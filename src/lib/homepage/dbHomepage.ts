import { getSql } from '../evidence/db'
import { getCachedData, setCachedData } from '../cache'
import { buildCategorySummaryPayload, filterByTopic, getCacheTtl } from '../utils'
import { getSummaryCacheKey, shouldPersistSummaryToCache } from '../ai/summaryCache'
import { TOPIC_KEYWORDS, matchesTopic } from '../topics'
import type { HomepageData } from './homepageGenerator'
import { Article, StoryCluster } from '@/types'

// Stories younger than this (by cluster last_seen_at / article published_at) are shown
const STORY_WINDOW_HOURS = 48
const STORY_LIMIT = 60
const UNCLUSTERED_LIMIT = 100
// Trending topics derive from entity mentions over the last 24h
const TRENDING_ENTITY_POOL = 40
const TRENDING_TOPIC_LIMIT = 12
const DESCRIPTION_MAX_CHARS = 300
// Small memo so Neon isn't hit on every request (reuses the shared cache adapter)
const DB_MEMO_KEY = 'homepage-db-result'
const DB_MEMO_EMPTY = 'db-homepage-empty'
const DB_MEMO_TTL_SECONDS = 300

// Digest rows using these categories describe the whole day, not a single topic
const TRENDING_DIGEST_CATEGORIES = new Set(['trending', 'all', 'today', 'overall'])
const TRENDING_DIGEST_LABEL = "Today's top stories"

interface ClusterRow {
  id: string
  title: string
  category: string | null
  summary: string | null
  severity_level: number | null
  severity_label: string | null
  score: number | null
  image_urls: unknown
}

interface ArticleRow {
  cluster_id?: string
  id: string
  title: string
  url: string
  source: string
  category: string | null
  published_at: string | Date
  body: string | null
  raw_json: unknown
}

interface EntityRow {
  name: string
  type: string
  article_count: number
}

interface DigestRow {
  category: string
  digest_date: string | Date
  digest: unknown
}

/** Slim raw_json contract — rely only on these keys (body text lives in articles.body). */
interface SlimRawJson {
  urlToImage?: string
  imageWidth?: number
  imageHeight?: number
  source?: { name?: string; url?: string }
  category?: string
}

function toIso(value: string | Date | null | undefined): string {
  const d = value ? new Date(value) : new Date()
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function toUtcDateString(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

/** Builds a UI Article from an articles row, using only the slim raw_json keys. */
export function mapArticleRow(row: ArticleRow): Article {
  const raw = (row.raw_json && typeof row.raw_json === 'object' ? row.raw_json : {}) as SlimRawJson
  const body = (row.body || '').replace(/\s+/g, ' ').trim()
  const description =
    body.length > DESCRIPTION_MAX_CHARS
      ? `${body.slice(0, DESCRIPTION_MAX_CHARS - 3)}...`
      : body || undefined
  return {
    id: row.id,
    title: row.title,
    description,
    url: row.url,
    urlToImage: typeof raw.urlToImage === 'string' ? raw.urlToImage : '',
    imageWidth: typeof raw.imageWidth === 'number' ? raw.imageWidth : undefined,
    imageHeight: typeof raw.imageHeight === 'number' ? raw.imageHeight : undefined,
    publishedAt: toIso(row.published_at),
    source: raw.source?.name
      ? { name: raw.source.name, url: raw.source.url || '' }
      : { name: row.source, url: '' },
    category: row.category || raw.category || '',
  }
}

/**
 * Maps trending entities (theme/company/geography, ranked by distinct-article count)
 * into the existing topic taxonomy the TrendingTopicsBar consumes. The client
 * re-scores and hides topics without clusters, exactly as with the legacy path.
 */
export function mapTrendingTopics(
  entityRows: EntityRow[],
  limit = TRENDING_TOPIC_LIMIT
): string[] {
  const counts = new Map<string, number>()
  for (const row of entityRows) {
    const name = (row.name || '').trim()
    if (!name) continue
    const articleCount = Number(row.article_count) || 0
    for (const topic of Object.keys(TOPIC_KEYWORDS)) {
      if (matchesTopic(topic, name)) {
        counts.set(topic, (counts.get(topic) || 0) + articleCount)
      }
    }
  }
  if (counts.size === 0) {
    // Same fallback as the legacy generator: predefined topics; client scores/orders.
    return Object.keys(TOPIC_KEYWORDS)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .slice(0, limit)
}

/** Keeps one digest row per category, preferring today's UTC date over yesterday's. */
export function pickLatestDigests(rows: DigestRow[], todayUtc: string): DigestRow[] {
  const byCategory = new Map<string, DigestRow>()
  for (const row of rows) {
    const existing = byCategory.get(row.category)
    if (
      !existing ||
      (toUtcDateString(existing.digest_date) !== todayUtc &&
        toUtcDateString(row.digest_date) === todayUtc)
    ) {
      byCategory.set(row.category, row)
    }
  }
  return [...byCategory.values()]
}

function resolveDigestTopic(category: string): { label: string; isTrending: boolean } {
  const normalized = category.trim().toLowerCase()
  if (!normalized || TRENDING_DIGEST_CATEGORIES.has(normalized)) {
    return { label: TRENDING_DIGEST_LABEL, isTrending: true }
  }
  if (TOPIC_KEYWORDS[category]) {
    return { label: category, isTrending: false }
  }
  // Map DB category names (e.g. "AI") onto the taxonomy topic the UI will click
  const mapped = Object.keys(TOPIC_KEYWORDS).find((topic) => matchesTopic(topic, category))
  return { label: mapped || category, isTrending: false }
}

/**
 * Seeds the summary cache CategorySummary reads through /api/summarize so persisted
 * digests render without a Groq call. Replicates the exact payload id the client
 * computes (buildCategorySummaryPayload over the same clusters and options).
 */
async function seedCategoryDigestCaches(
  storyClusters: StoryCluster[],
  digests: DigestRow[]
): Promise<void> {
  const ttl = getCacheTtl()
  for (const row of digests) {
    const { label, isTrending } = resolveDigestTopic(row.category)
    const clusters = isTrending
      ? storyClusters
      : filterByTopic(storyClusters, [], label).clusters
    // Must mirror CategorySummary's buildCategorySummaryPayload options exactly
    const payload = buildCategorySummaryPayload(label, clusters, [], {
      maxClusters: 4,
      maxArticlesPerCluster: 2,
      maxStandaloneArticles: 0,
    })
    if (!payload) continue
    const digestText = typeof row.digest === 'string' ? row.digest : JSON.stringify(row.digest)
    if (!shouldPersistSummaryToCache(digestText)) continue
    await setCachedData(getSummaryCacheKey('category', payload.id), digestText, ttl)
  }
}

/**
 * Assembles the HomepageData shape the UI expects from Postgres.
 * Returns null when the DB holds no recent stories or articles (callers fall
 * back to the legacy Redis-cache path). Throws on DB errors for the same reason.
 */
export async function getHomepageDataFromDb(): Promise<HomepageData | null> {
  const sql = getSql()

  const clusterRows = (await sql`
    SELECT id, title, category, summary, severity_level, severity_label, score, image_urls
    FROM story_clusters
    WHERE last_seen_at > now() - interval '1 hour' * ${STORY_WINDOW_HOURS}
    ORDER BY score DESC NULLS LAST, last_seen_at DESC
    LIMIT ${STORY_LIMIT}
  `) as ClusterRow[]

  const clusterIds = clusterRows.map((row) => row.id)

  const memberRows =
    clusterIds.length > 0
      ? ((await sql`
          SELECT ca.cluster_id, a.id, a.title, a.url, a.source, a.category,
                 a.published_at, a.body, a.raw_json
          FROM cluster_articles ca
          JOIN articles a ON a.id = ca.article_id
          WHERE ca.cluster_id = ANY(${clusterIds})
          ORDER BY a.published_at DESC
        `) as ArticleRow[])
      : []

  const unclusteredRows = (await sql`
    SELECT a.id, a.title, a.url, a.source, a.category, a.published_at, a.body, a.raw_json
    FROM articles a
    WHERE a.published_at > now() - interval '1 hour' * ${STORY_WINDOW_HOURS}
      AND NOT EXISTS (
        SELECT 1 FROM cluster_articles ca
        WHERE ca.article_id = a.id AND ca.cluster_id = ANY(${clusterIds})
      )
    ORDER BY a.published_at DESC
    LIMIT ${UNCLUSTERED_LIMIT}
  `) as ArticleRow[]

  const entityRows = (await sql`
    SELECT e.name, e.type, COUNT(DISTINCT ae.article_id)::int AS article_count
    FROM article_entities ae
    JOIN entities e ON e.id = ae.entity_id
    JOIN articles a ON a.id = ae.article_id
    WHERE a.published_at > now() - interval '24 hours'
      AND e.type IN ('theme', 'company', 'geography')
    GROUP BY e.name, e.type
    ORDER BY article_count DESC, e.name ASC
    LIMIT ${TRENDING_ENTITY_POOL}
  `) as EntityRow[]

  const todayUtc = new Date().toISOString().slice(0, 10)
  const digestRows = (await sql`
    SELECT category, digest_date, digest
    FROM category_digests
    WHERE digest_date IN (${todayUtc}::date, ${todayUtc}::date - 1)
  `) as DigestRow[]

  const lastSeenRows = (await sql`
    SELECT max(last_seen_at) AS last_updated FROM story_clusters
  `) as { last_updated: string | Date | null }[]

  const membersByCluster = new Map<string, Article[]>()
  for (const row of memberRows) {
    const clusterId = row.cluster_id as string
    const list = membersByCluster.get(clusterId) || []
    list.push(mapArticleRow(row))
    membersByCluster.set(clusterId, list)
  }

  const storyClusters: StoryCluster[] = []
  for (const row of clusterRows) {
    const articles = membersByCluster.get(row.id) || []
    if (articles.length === 0) continue
    const imageUrls = Array.isArray(row.image_urls)
      ? row.image_urls.filter((u): u is string => typeof u === 'string' && u.length > 0)
      : []
    storyClusters.push({
      id: row.id,
      clusterTitle: row.title,
      articleIds: articles.map((a) => a.id),
      articles,
      summary: row.summary || undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      score: typeof row.score === 'number' ? row.score : undefined,
      severity:
        row.severity_level != null || row.severity_label
          ? { level: row.severity_level ?? 0, label: row.severity_label || 'Other' }
          : undefined,
    })
  }

  // The homepage UI renders story clusters only, so an empty cluster set means
  // the DB pipeline hasn't produced stories yet — fall back to the legacy path
  // rather than serving a blank homepage.
  if (storyClusters.length === 0) {
    return null
  }

  const unclusteredArticles = unclusteredRows.map(mapArticleRow)

  const homepageData: HomepageData = {
    storyClusters,
    unclusteredArticles,
    rateLimitMessage: null,
    topics: mapTrendingTopics(entityRows),
    lastUpdated: lastSeenRows[0]?.last_updated
      ? toIso(lastSeenRows[0].last_updated)
      : new Date().toISOString(),
  }

  try {
    await seedCategoryDigestCaches(storyClusters, pickLatestDigests(digestRows, todayUtc))
  } catch (error) {
    console.warn('⚠️ Failed to seed category digest caches from DB:', error)
  }

  return homepageData
}

/**
 * Memoized DB read (5 min TTL via the shared cache adapter) so Neon isn't hit
 * on every request. Empty results are memoized too; DB errors are not.
 */
export async function getCachedDbHomepage(): Promise<HomepageData | null> {
  const memo = await getCachedData(DB_MEMO_KEY)
  if (memo === DB_MEMO_EMPTY) return null
  if (memo) return memo as HomepageData

  const fresh = await getHomepageDataFromDb()
  await setCachedData(DB_MEMO_KEY, fresh ?? DB_MEMO_EMPTY, DB_MEMO_TTL_SECONDS)
  return fresh
}
