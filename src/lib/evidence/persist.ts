import { createHash } from 'crypto'
import { Article } from '@/types'
import { getSql } from './db'
import { embedTexts } from './embeddings'

export interface PersistResult {
  fetched: number
  inserted: number
  chunksEmbedded: number
  skippedExisting: number
}

const CHUNK_MAX_CHARS = 1200
const CHUNK_OVERLAP_CHARS = 150

export function contentHash(article: Article): string {
  return createHash('sha256').update(article.url.trim()).digest('hex')
}

export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= CHUNK_MAX_CHARS) return [clean]
  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    chunks.push(clean.slice(start, start + CHUNK_MAX_CHARS))
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
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize)
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
  for (const a of articles) {
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
      ${fresh.map(([, a]) => a.source.name)}::text[],
      ${fresh.map(([, a]) => a.url)}::text[],
      ${fresh.map(([, a]) => a.title)}::text[],
      ${fresh.map(([, a]) => a.category)}::text[],
      ${fresh.map(([, a]) => toDate(a.publishedAt))}::text[],
      ${fresh.map(([, a]) => articleBody(a))}::text[],
      ${fresh.map(([, a]) => JSON.stringify(a))}::text[],
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
