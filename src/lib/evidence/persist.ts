import { createHash } from 'crypto'
import { Article } from '@/types'
import { getSql } from './db'
import { embedTexts } from './embeddings'
import { sourceSlug } from './sourceSlug'

export interface PersistResult {
  fetched: number
  inserted: number
  chunksEmbedded: number
  skippedExisting: number
}

const CHUNK_MAX_CHARS = 1200
const CHUNK_OVERLAP_CHARS = 150
// Storage diet: embeddings + the HNSW index dominate DB size and scale with
// chunk count, so cap chunks per article. The first two chunks (~2.2k chars,
// title + lead) carry the retrieval signal at this scale; body overflow past
// that rarely matters and articles.body keeps the full text canon anyway.
const MAX_CHUNKS_PER_ARTICLE = 2

// Slim raw_json contract: article metadata the thesis-tracker needs beyond the
// dedicated columns (image + original source object). Body text lives ONLY in
// articles.body — content/description are dropped here by design.
const SLIM_RAW_KEYS = [
  'id',
  'title',
  'url',
  'urlToImage',
  'imageWidth',
  'imageHeight',
  'publishedAt',
  'source',
  'category',
] as const
const SLIM_SOURCE_KEYS = ['name', 'url'] as const

// Partial source: stored raw_json predating the contract may lack source keys.
export type SlimRawJson = Omit<Pick<Article, (typeof SLIM_RAW_KEYS)[number]>, 'source'> & {
  source: Partial<Article['source']>
}

/** Projects an article (or a previously stored raw_json) to the slim contract. */
export function slimRawJson(article: Article): SlimRawJson {
  return {
    id: article.id,
    title: article.title,
    url: article.url,
    urlToImage: article.urlToImage,
    imageWidth: article.imageWidth,
    imageHeight: article.imageHeight,
    publishedAt: article.publishedAt,
    source: { name: article.source?.name, url: article.source?.url },
    category: article.category,
  }
}

/** True when a stored raw_json object already matches the slim contract. */
export function isSlimRawJson(raw: unknown): boolean {
  // jsonb null / scalars / arrays pass a SQL `raw_json IS NOT NULL` filter but
  // aren't slimmable objects — report them as "already slim" so callers skip
  // instead of crashing or rewriting garbage to an empty shape.
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return true
  const rec = raw as Record<string, unknown>
  const keys = Object.keys(rec) as (keyof SlimRawJson)[]
  if (!keys.every((k) => (SLIM_RAW_KEYS as readonly string[]).includes(k))) return false
  const source = rec.source
  if (source === null || source === undefined) return true
  if (typeof source !== 'object') return false
  return Object.keys(source).every((k) => (SLIM_SOURCE_KEYS as readonly string[]).includes(k))
}

export function contentHash(article: Article): string {
  return createHash('sha256').update(article.url.trim()).digest('hex')
}

const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff
const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff

/**
 * slice() that never cuts a surrogate pair in half.
 *
 * JS strings are UTF-16, so a fixed code-unit offset can land between the two
 * halves of a non-BMP character — any emoji. The resulting chunk ends on a lone
 * surrogate, which JSON-encodes to an invalid escape; the Neon HTTP driver
 * sends query params as JSON, so the INSERT fails with
 *   "could not parse the HTTP request body: unexpected end of hex escape".
 *
 * That alone would be a dropped article, but backfillMissingChunks re-selects
 * every zero-chunk article on the next run, so the same row fails forever and
 * takes the whole ingest with it — entity extraction and clustering never run.
 * Observed 2026-09-10 through 2026-09-13: article ev-48138 carried U+1F680 in
 * an img alt attribute at offset 1199 of a 1200-char chunk, and every scheduled
 * run failed on it for three days.
 *
 * A surrogate at a slice edge is by definition unpaired *within the slice* —
 * its partner is on the other side of the boundary — so trimming the edge is
 * always the correct repair. The character survives in the adjacent chunk.
 */
function sliceWholeCodePoints(s: string, start: number, end: number): string {
  if (start < s.length && isLowSurrogate(s.charCodeAt(start))) start++
  if (end > start && isHighSurrogate(s.charCodeAt(end - 1))) end--
  return s.slice(start, end)
}

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Removes surrogates that are unpaired in the source itself.
 *
 * Boundary trimming handles pairs this code splits; a feed can also deliver a
 * half-character of its own. rss-parser decodes numeric character references
 * without validating pairing, and `&#55357;&#56898;` is how WordPress-family
 * feeds emit an emoji — so a feed that emits or truncates one half hands us a
 * lone surrogate directly.
 *
 * There are TWO distinct rejections, and surviving the first does not imply
 * surviving the second:
 *
 *  1. Neon's HTTP body parser rejects a bare text param carrying an unpaired
 *     surrogate — "unexpected end of hex escape".
 *  2. Postgres rejects it at a ::jsonb cast — "invalid input syntax for type
 *     json". JSON.stringify turns the surrogate into the ASCII text \ud83d,
 *     so the param sails through (1) and dies at (2) instead. Verified against
 *     this project's database; see PG docs 8.14.1 — json tolerates such
 *     escapes, jsonb does not, and raw_json is jsonb.
 *
 * Either way the whole INSERT batch fails, not the offending row.
 */
export function stripLoneSurrogates(s: string): string {
  // Reset lastIndex defensively: the regex is module-scoped and /g, so a
  // future .test() on it elsewhere would otherwise carry state between calls.
  LONE_SURROGATE.lastIndex = 0
  return s.replace(LONE_SURROGATE, '')
}

/**
 * Strips lone surrogates from every free-text field of an article, once, at the
 * boundary where feed data enters persistence.
 *
 * Sanitizing per-param does not scale: raw_json alone carries six fields, and
 * missing any one of them reproduces the original outage with a different error
 * string. Normalizing the Article itself makes every downstream param — bare
 * text, jsonb, and chunk text alike — safe by construction.
 *
 * Applied before contentHash so the dedupe key matches the url actually stored.
 */
export function sanitizeArticleText(a: Article): Article {
  const clean = (v: string | undefined) => (v === undefined ? undefined : stripLoneSurrogates(v))
  return {
    ...a,
    title: stripLoneSurrogates(a.title),
    description: clean(a.description),
    content: clean(a.content),
    url: stripLoneSurrogates(a.url),
    urlToImage: stripLoneSurrogates(a.urlToImage ?? ''),
    category: stripLoneSurrogates(a.category),
    summary: clean(a.summary),
    source: {
      ...a.source,
      name: stripLoneSurrogates(a.source?.name ?? ''),
      url: stripLoneSurrogates(a.source?.url ?? ''),
    },
  }
}

export function chunkText(text: string): string[] {
  // Strip before collapsing whitespace, not after: removing a half-character
  // from between two spaces would otherwise leave a double space behind.
  const clean = stripLoneSurrogates(text).replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= CHUNK_MAX_CHARS) return [clean]
  const chunks: string[] = []
  let start = 0
  while (start < clean.length && chunks.length < MAX_CHUNKS_PER_ARTICLE) {
    const slice = sliceWholeCodePoints(clean, start, Math.min(start + CHUNK_MAX_CHARS, clean.length))
    // Trimming a one-code-unit window can empty it. Unreachable at the
    // current chunk size, but an empty chunk would be embedded and stored.
    if (slice) chunks.push(slice)
    start += CHUNK_MAX_CHARS - CHUNK_OVERLAP_CHARS
  }
  return chunks
}

export function articleBody(article: Article): string {
  const parts = [...new Set([article.description, article.content].filter(Boolean) as string[])]
  // Drop any part fully contained in a longer one (description is often the
  // lead paragraph of content) — keep the longer text, never the shorter.
  const kept = parts.filter((p) => !parts.some((q) => q !== p && q.includes(p)))
  return kept.join('\n\n').trim() || article.title
}

function toDate(value: string): string {
  const d = new Date(value)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

// Batched: each INSERT carries ~200 rows of ~5KB embedding literals, keeping
// individual Neon HTTP requests well under request-size limits.
async function insertChunks(
  rows: { articleId: string; index: number; text: string }[],
  batchSize = 200
): Promise<void> {
  const sql = getSql()
  let start = 0
  while (start < rows.length) {
    let end = Math.min(start + batchSize, rows.length)
    // Never split one article's chunks across batches: a crash between
    // batches would leave it partially chunked, and backfill only revisits
    // articles with zero chunks.
    while (end < rows.length && rows[end].articleId === rows[end - 1].articleId) end++
    const batch = rows.slice(start, end)
    const embeddings = await embedTexts(batch.map((c) => c.text))
    await sql`
      INSERT INTO article_chunks (article_id, chunk_index, text, embedding)
      SELECT a, i, t, e::vector
      FROM unnest(
        ${batch.map((c) => c.articleId)}::text[],
        ${batch.map((c) => c.index)}::int[],
        ${batch.map((c) => c.text)}::text[],
        ${embeddings.map((e) => `[${e.join(',')}]`)}::text[]
      ) AS x(a, i, t, e)
      ON CONFLICT (article_id, chunk_index) DO NOTHING
    `
    start = end
  }
}

/**
 * Embeds chunks for articles that have none — recovers from runs that
 * crashed between the article insert and the chunk insert.
 */
export async function backfillMissingChunks(batchSize = 200): Promise<number> {
  const sql = getSql()
  // Whitespace-only articles yield no chunks and would be re-selected forever;
  // excluding them per run guarantees every pass makes progress.
  const unchunkable: string[] = []
  let total = 0
  for (;;) {
    const missing = await sql`
      SELECT a.id, a.title, a.body FROM articles a
      LEFT JOIN article_chunks c ON c.article_id = a.id
      WHERE c.id IS NULL AND NOT (a.id = ANY(${unchunkable}))
      LIMIT ${batchSize}
    `
    if (missing.length === 0) return total
    const rows: { articleId: string; index: number; text: string }[] = []
    for (const article of missing) {
      const chunks = chunkText(`${article.title}\n\n${article.body}`)
      if (chunks.length === 0) unchunkable.push(article.id as string)
      chunks.forEach((text, index) => rows.push({ articleId: article.id as string, index, text }))
    }
    await insertChunks(rows)
    total += rows.length
  }
}

/**
 * Appends new articles (deduped by content_hash) and their embedded chunks
 * to the evidence DB. Existing articles are never mutated (append-only canon).
 */
export async function persistArticles(articles: Article[]): Promise<PersistResult> {
  const sql = getSql()
  const result: PersistResult = {
    fetched: articles.length,
    inserted: 0,
    chunksEmbedded: 0,
    skippedExisting: 0,
  }
  if (articles.length === 0) return result

  // Dedup within the batch, then against the DB
  const byHash = new Map<string, Article>()
  for (const raw of articles) {
    // Normalize once, here: every param below (bare text, jsonb, chunk text)
    // derives from this object, so one strip makes all of them safe.
    const a = sanitizeArticleText(raw)
    if (a.url) byHash.set(contentHash(a), a)
  }
  const hashes = [...byHash.keys()]
  const existing = await sql`
    SELECT content_hash FROM articles WHERE content_hash = ANY(${hashes})
  `
  const existingHashes = new Set(existing.map((r) => r.content_hash as string))
  const fresh = [...byHash.entries()].filter(([h]) => !existingHashes.has(h))
  result.skippedExisting = byHash.size - fresh.length
  if (fresh.length === 0) return result

  const inserted = await sql`
    INSERT INTO articles (source, url, title, category, published_at, body, raw_json, content_hash)
    SELECT s, u, t, c, p::timestamptz, b, r::jsonb, h
    FROM unnest(
      ${fresh.map(([, a]) => sourceSlug(a.source.name, [a.source.url, a.url]))}::text[],
      ${fresh.map(([, a]) => a.url)}::text[],
      ${fresh.map(([, a]) => a.title)}::text[],
      ${fresh.map(([, a]) => a.category)}::text[],
      ${fresh.map(([, a]) => toDate(a.publishedAt))}::text[],
      ${fresh.map(([, a]) => articleBody(a))}::text[],
      ${fresh.map(([, a]) => JSON.stringify(slimRawJson(a)))}::text[],
      ${fresh.map(([h]) => h)}::text[]
    ) AS x(s, u, t, c, p, b, r, h)
    ON CONFLICT (content_hash) DO NOTHING
    RETURNING id, content_hash
  `
  result.inserted = inserted.length
  const idByHash = new Map(inserted.map((r) => [r.content_hash as string, r.id as string]))

  // Chunk + embed only what was actually inserted
  const chunkRows: { articleId: string; index: number; text: string }[] = []
  for (const [hash, article] of fresh) {
    const articleId = idByHash.get(hash)
    if (!articleId) continue
    const chunks = chunkText(`${article.title}\n\n${articleBody(article)}`)
    chunks.forEach((text, index) => chunkRows.push({ articleId, index, text }))
  }
  await insertChunks(chunkRows)
  result.chunksEmbedded = chunkRows.length
  return result
}
