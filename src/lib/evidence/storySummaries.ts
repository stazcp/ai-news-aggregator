import { Article } from '@/types'
import { summarizeCategoryDigest, summarizeCluster } from '@/lib/ai/groq'
import { getSql } from './db'

export interface SummaryRunResult {
  summariesGenerated: number
  digestsGenerated: number
  groqCalls: number
}

export interface SummaryCandidate {
  id: string
  score: number | null
  summary: string | null
  summaryArticleCount: number | null
  memberCount: number
  category: string | null
}

/** At most this many long-form story summaries per run. */
const MAX_SUMMARIES_PER_RUN = 20
/** At most this many category digests per run. */
const MAX_DIGESTS_PER_RUN = 6
/** Hard ceiling on Groq calls per run (summaries + digests). */
const MAX_GROQ_CALLS = MAX_SUMMARIES_PER_RUN + MAX_DIGESTS_PER_RUN
/** Regenerate a summary once the story has grown by this factor since it was written. */
const GROWTH_FACTOR = 1.5
/** Token bounds for summary prompts: articles per story and body chars per article. */
const SUMMARY_ARTICLE_CAP = 12
const SUMMARY_BODY_CHARS = 700
/** Stories per category folded into a digest prompt. */
const DIGEST_STORY_CAP = 8

/** Placeholder strings the Groq helpers return instead of throwing. */
const UNUSABLE_SUMMARIES = new Set([
  'Summary not available',
  'Summary could not be generated.',
  'An error occurred while generating the cluster summary.',
])

function isUsableSummary(summary: string | undefined): summary is string {
  return !!summary && !UNUSABLE_SUMMARIES.has(summary.trim())
}

/** Numeric-aware compare so 'st-9' sorts before 'st-10' (deterministic ties). */
function compareStoryIds(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

/**
 * Stories that need a (re)generated summary: none stored yet, or the member
 * set grew materially since the stored one was written. Best score first.
 */
export function selectStoriesForSummary(
  candidates: SummaryCandidate[],
  limit = MAX_SUMMARIES_PER_RUN
): string[] {
  return candidates
    .filter(
      (c) =>
        c.summary === null || c.memberCount >= GROWTH_FACTOR * (c.summaryArticleCount ?? 0)
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || compareStoryIds(a.id, b.id))
    .slice(0, limit)
    .map((c) => c.id)
}

/**
 * Top categories among this run's stories: most stories first, then best
 * score, then name — deterministic for a given snapshot.
 */
export function selectDigestCategories(
  candidates: { category: string | null; score: number | null }[],
  limit = MAX_DIGESTS_PER_RUN
): string[] {
  const byCategory = new Map<string, { count: number; bestScore: number }>()
  for (const c of candidates) {
    if (!c.category) continue
    const entry = byCategory.get(c.category) || { count: 0, bestScore: -Infinity }
    entry.count++
    entry.bestScore = Math.max(entry.bestScore, c.score ?? 0)
    byCategory.set(c.category, entry)
  }
  return [...byCategory.entries()]
    .sort(
      ([nameA, a], [nameB, b]) =>
        b.count - a.count || b.bestScore - a.bestScore || nameA.localeCompare(nameB)
    )
    .slice(0, limit)
    .map(([name]) => name)
}

interface MemberRow {
  id: string
  title: string
  body: string
  url: string
  published_at: string
  source: string
  raw_json: { source?: { name?: string; url?: string }; urlToImage?: string } | null
}

/** Shape a DB article row for the existing Groq summarize prompt. */
function toSummaryArticle(row: MemberRow): Article {
  return {
    id: row.id,
    title: row.title,
    description: (row.body || '').slice(0, SUMMARY_BODY_CHARS),
    url: row.url,
    urlToImage: row.raw_json?.urlToImage || '',
    publishedAt: new Date(row.published_at).toISOString(),
    source: {
      name: row.raw_json?.source?.name || row.source,
      url: row.raw_json?.source?.url || '',
    },
    category: '',
  }
}

/**
 * Generates long-form summaries for the highest-scored stories touched this
 * run, plus one digest per top category per UTC day. Bounded Groq usage
 * (MAX_GROQ_CALLS); skips gracefully when GROQ_API_KEY is absent and stops
 * (without throwing) when the API rate/spend limit is hit.
 */
export async function generateSummaries(storyIds: string[]): Promise<SummaryRunResult> {
  const result: SummaryRunResult = { summariesGenerated: 0, digestsGenerated: 0, groqCalls: 0 }
  if (storyIds.length === 0) return result
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️ GROQ_API_KEY is not set — skipping story summaries and category digests')
    return result
  }
  const sql = getSql()

  const rows = await sql`
    SELECT sc.id, sc.score, sc.summary, sc.summary_article_count, sc.category,
           count(ca.article_id)::int AS member_count
    FROM story_clusters sc
    LEFT JOIN cluster_articles ca ON ca.cluster_id = sc.id
    WHERE sc.id = ANY(${storyIds})
    GROUP BY sc.id
  `
  const candidates: SummaryCandidate[] = rows.map((r) => ({
    id: r.id as string,
    score: r.score as number | null,
    summary: r.summary as string | null,
    summaryArticleCount: r.summary_article_count as number | null,
    memberCount: r.member_count as number,
    category: r.category as string | null,
  }))
  const memberCountById = new Map(candidates.map((c) => [c.id, c.memberCount]))

  // ---- Long-form story summaries ----
  for (const storyId of selectStoriesForSummary(candidates)) {
    if (result.groqCalls >= MAX_GROQ_CALLS) break
    const members = (await sql`
      SELECT a.id, a.title, a.body, a.url, a.published_at, a.source, a.raw_json
      FROM cluster_articles ca
      JOIN articles a ON a.id = ca.article_id
      WHERE ca.cluster_id = ${storyId}
      ORDER BY a.published_at DESC
      LIMIT ${SUMMARY_ARTICLE_CAP}
    `) as unknown as MemberRow[]
    if (members.length === 0) continue
    let summary: string
    try {
      result.groqCalls++
      summary = await summarizeCluster(members.map(toSummaryArticle), 'long')
    } catch (error) {
      // summarizeCluster only throws on rate/spend limits — stop burning calls.
      console.warn('⚠️ Groq limit reached during story summaries; stopping this run.', error)
      return result
    }
    if (!isUsableSummary(summary)) continue
    await sql`
      UPDATE story_clusters SET
        summary = ${summary},
        summary_generated_at = now(),
        summary_article_count = ${memberCountById.get(storyId) ?? members.length}
      WHERE id = ${storyId}
    `
    result.summariesGenerated++
  }

  // ---- Daily category digests ----
  const digestDate = new Date().toISOString().slice(0, 10) // UTC date, matches the PK
  const categories = selectDigestCategories(candidates)
  if (categories.length === 0) return result
  const existingRows = await sql`
    SELECT category FROM category_digests
    WHERE digest_date = ${digestDate} AND category = ANY(${categories})
  `
  const existing = new Set(existingRows.map((r) => r.category as string))
  for (const category of categories) {
    if (existing.has(category)) continue
    if (result.groqCalls >= MAX_GROQ_CALLS) break
    const stories = await sql`
      SELECT title, summary FROM story_clusters
      WHERE id = ANY(${storyIds}) AND category = ${category}
      ORDER BY score DESC NULLS LAST, id
      LIMIT ${DIGEST_STORY_CAP}
    `
    if (stories.length === 0) continue
    const notes = stories
      .map((s) => `- ${s.title}${s.summary ? `: ${(s.summary as string).slice(0, 200)}` : ''}`)
      .join('\n')
    let digestText: string
    try {
      result.groqCalls++
      digestText = await summarizeCategoryDigest(notes)
    } catch (error) {
      console.warn('⚠️ Groq limit reached during category digests; stopping this run.', error)
      return result
    }
    if (!isUsableSummary(digestText)) continue
    let digest: unknown
    try {
      digest = JSON.parse(digestText)
    } catch {
      digest = { lede: digestText, takeaways: [] }
    }
    await sql`
      INSERT INTO category_digests (category, digest_date, digest)
      VALUES (${category}, ${digestDate}, ${JSON.stringify(digest)}::jsonb)
      ON CONFLICT (category, digest_date) DO NOTHING
    `
    result.digestsGenerated++
  }
  return result
}
