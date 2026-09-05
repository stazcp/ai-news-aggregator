import { getSql } from '../evidence/db'
import { getCachedData, setCachedData } from '../cache'
import { buildCategorySummaryPayload, filterByTopic, getCacheTtl, topicForCategory } from '../utils'
import { getSummaryCacheKey, shouldPersistSummaryToCache } from '../ai/summaryCache'
import { TOPIC_KEYWORDS, matchesTopic } from '../topics'
import { linkRelatedClusters } from '../clustering/textCluster'
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
// Only the description prefix is ever rendered; fetching full bodies for ~400
// rows moved megabytes per read. Headroom over DESCRIPTION_MAX_CHARS covers
// whitespace collapsing.
const BODY_FETCH_CHARS = 600
// Small memo so Neon isn't hit on every request (reuses the shared cache adapter)
const DB_MEMO_KEY = 'homepage-db-result'
const DB_MEMO_EMPTY = 'db-homepage-empty'
const DB_MEMO_TTL_SECONDS = 300
// Longer-lived copy served only when a DB read throws (the legacy Redis path
// has no writer while the refresh cron is paused).
const DB_LAST_GOOD_KEY = 'homepage-db-last-good'
const DB_LAST_GOOD_TTL_SECONDS = 86400
const DB_LAST_GOOD_MARKER = 'homepage-db-last-good-written'
const DB_LAST_GOOD_REFRESH_SECONDS = 3600
// The legacy cache key page.tsx / the homepage route fall back to
const LEGACY_HOMEPAGE_KEY = 'homepage-result'

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
  // Always return the FULL taxonomy like the legacy generator — the client
  // hides topics without clusters, so dropping unmatched topics here would
  // silently delete working navigation (entity names rarely contain topic
  // keywords). Entity signal only decides the order of the leading topics.
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([topic]) => topic)
    .slice(0, limit)
  return [...new Set([...ranked, ...Object.keys(TOPIC_KEYWORDS)])]
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
  // Map DB category names ('World News', 'Environment') onto the taxonomy topic
  // the UI actually clicks, using the same alias table filterByTopic uses —
  // keyword matching describes article text, not category names, so it would
  // seed the digest under a key the client never requests.
  return { label: topicForCategory(category) || category, isTrending: false }
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
  // Several categories can resolve to one topic ('World' and 'World News'),
  // and they would compute the same cache key. Pick deterministically —
  // exact topic name first, then alphabetical — instead of letting unordered
  // DB rows decide which digest occupies the key for the whole TTL.
  const todayUtc = new Date().toISOString().slice(0, 10)
  const isToday = (row: DigestRow) => toUtcDateString(row.digest_date) === todayUtc
  const byLabel = new Map<string, DigestRow>()
  for (const row of [...digests].sort((a, b) => a.category.localeCompare(b.category))) {
    const { label } = resolveDigestTopic(row.category)
    const existing = byLabel.get(label)
    // Today's digest always beats yesterday's; only then does the exact topic
    // name win, so an alias category can't seed a stale day under the key.
    if (!existing) byLabel.set(label, row)
    else if (isToday(row) && !isToday(existing)) byLabel.set(label, row)
    else if (row.category === label && isToday(row) === isToday(existing)) byLabel.set(label, row)
  }
  for (const row of byLabel.values()) {
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
    const key = getSummaryCacheKey('category', payload.id)
    // Never clobber a summary already at this key: seeding runs on every memo
    // miss (~5 min), and an on-demand summary there is at least as fresh.
    if (await getCachedData(key)) continue
    await setCachedData(key, digestText, ttl)
  }
}

/**
 * Assembles the HomepageData shape the UI expects from Postgres.
 * Returns null when the DB holds no recent stories or articles (callers fall
 * back to the legacy Redis-cache path). Throws on DB errors for the same reason.
 */
export async function getHomepageDataFromDb(): Promise<HomepageData | null> {
  const sql = getSql()

  // Serve something rather than nothing: if the pipeline has been down longer
  // than STORY_WINDOW_HOURS, every story falls outside the window and the page
  // would drop to the legacy cache — which has no writer while the refresh
  // cron is paused, so the reader gets an error instead of day-old news. The
  // fallback pass drops the time filter entirely rather than widening it to a
  // fixed bound, which would silently re-break the page once the outage
  // outlived it. Same rows, same LIMIT; the UI shows data age from lastUpdated.
  let clusterRows = (await sql`
    SELECT id, title, category, summary, severity_level, severity_label, score, image_urls
    FROM story_clusters
    WHERE last_seen_at > now() - interval '1 hour' * ${STORY_WINDOW_HOURS}
    ORDER BY score DESC NULLS LAST, last_seen_at DESC
    LIMIT ${STORY_LIMIT}
  `) as ClusterRow[]
  const isStale = clusterRows.length === 0
  if (isStale) {
    clusterRows = (await sql`
      SELECT id, title, category, summary, severity_level, severity_label, score, image_urls
      FROM story_clusters
      ORDER BY score DESC NULLS LAST, last_seen_at DESC
      LIMIT ${STORY_LIMIT}
    `) as ClusterRow[]
    if (clusterRows.length > 0) {
      console.warn(
        `⚠️ No stories within ${STORY_WINDOW_HOURS}h — serving the most recent ones ` +
          'regardless of age. The ingest pipeline is likely failing.'
      )
    }
  }

  // Nothing below can change the outcome once there are no clusters (the UI
  // renders clusters only), so stop before four more queries.
  if (clusterRows.length === 0) return null

  const clusterIds = clusterRows.map((row) => row.id)

  const memberRows = (await sql`
    SELECT ca.cluster_id, a.id, a.title, a.url, a.source, a.category,
           a.published_at, left(a.body, ${BODY_FETCH_CHARS}) AS body, a.raw_json
    FROM cluster_articles ca
    JOIN articles a ON a.id = ca.article_id
    WHERE ca.cluster_id = ANY(${clusterIds})
    ORDER BY a.published_at DESC
  `) as ArticleRow[]

  const unclusteredRows = (await sql`
    SELECT a.id, a.title, a.url, a.source, a.category, a.published_at,
           left(a.body, ${BODY_FETCH_CHARS}) AS body, a.raw_json
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
  // digest_date as text: the driver parses DATE columns to a JS Date at LOCAL
  // midnight, which shifts the day on any server not running in UTC.
  const digestRows = (await sql`
    SELECT category, to_char(digest_date, 'YYYY-MM-DD') AS digest_date, digest
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

  // Related-coverage pills and the related-story modal are gated on
  // relatedClusterIds; the legacy path fills it via the same helper, which
  // returns a new array rather than mutating in place.
  const articleMap = new Map<string, Article>()
  for (const cluster of storyClusters) {
    for (const article of cluster.articles || []) articleMap.set(article.id, article)
  }
  const linkedClusters = linkRelatedClusters(storyClusters, articleMap)

  const unclusteredArticles = unclusteredRows.map(mapArticleRow)

  const homepageData: HomepageData = {
    storyClusters: linkedClusters,
    unclusteredArticles,
    rateLimitMessage: null,
    topics: mapTrendingTopics(entityRows),
    lastUpdated: lastSeenRows[0]?.last_updated
      ? toIso(lastSeenRows[0].last_updated)
      : new Date().toISOString(),
  }

  try {
    // Seed from the exact array served, so the payload id matches what the
    // client computes.
    await seedCategoryDigestCaches(linkedClusters, pickLatestDigests(digestRows, todayUtc))
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

  let fresh: HomepageData | null
  try {
    fresh = await getHomepageDataFromDb()
  } catch (error) {
    // A transient Neon blip must not blank the page. Both fallbacks can be
    // the stale one — the legacy cron snapshot lives 12h, ours refreshes
    // hourly — so compare lastUpdated instead of fixing an order. Rethrowing
    // hands the request to the caller's legacy path. Failures are never
    // memoized.
    const lastGood = (await getCachedData(DB_LAST_GOOD_KEY)) as HomepageData | null
    if (!lastGood) throw error
    const legacy = (await getCachedData(LEGACY_HOMEPAGE_KEY)) as HomepageData | null
    if (legacy && Date.parse(legacy.lastUpdated) > Date.parse(lastGood.lastUpdated)) throw error
    console.warn('⚠️ DB homepage read failed; serving last known good snapshot:', error)
    return lastGood
  }

  // Cache writes must not be able to discard a good read.
  await setCachedData(DB_MEMO_KEY, fresh ?? DB_MEMO_EMPTY, DB_MEMO_TTL_SECONDS)
  // Refresh the fallback copy at most hourly — the snapshot is ~450KB, and
  // rewriting it on every 5-minute memo miss is pure write bandwidth.
  if (fresh && !(await getCachedData(DB_LAST_GOOD_MARKER))) {
    await setCachedData(DB_LAST_GOOD_KEY, fresh, DB_LAST_GOOD_TTL_SECONDS)
    await setCachedData(DB_LAST_GOOD_MARKER, '1', DB_LAST_GOOD_REFRESH_SECONDS)
  }
  return fresh
}
