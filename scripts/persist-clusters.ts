import './load-env'
import { Article, StoryCluster } from '@/types'
import { getStoryClusters } from '@/lib/clustering/clusterService'
import { computeSeverity, scoreCluster } from '@/lib/clustering/severity'
import { mergeClustersByTitle, preClusterArticles } from '@/lib/clustering/textCluster'
import { ENV_DEFAULTS, envBool, envInt, envNumber } from '@/lib/config/env'
import { persistClusters } from '@/lib/evidence/clusterPersist'
import { getSql } from '@/lib/evidence/db'
import { generateSummaries } from '@/lib/evidence/storySummaries'

// Runs the in-memory clustering engine over the evidence DB's recent articles
// and persists the snapshot as long-lived stories (stable ids via member
// overlap), then generates bounded Groq summaries + daily category digests.
// Persisted summaries come from storySummaries; skip the engine's own top-N
// summarization pass unless explicitly re-enabled.
process.env.CLUSTER_SUMMARIZE_TOP_N ??= '0'

const WINDOW_HOURS = 48
const ARTICLE_LIMIT = 2000 // matches the feed pipeline's NEWS_GLOBAL_LIMIT scale

interface ArticleRow {
  id: string
  title: string
  body: string
  url: string
  category: string | null
  published_at: string
  source: string
  raw_json: {
    urlToImage?: string
    imageWidth?: number
    imageHeight?: number
    source?: { name?: string; url?: string }
  } | null
}

// Rebuild clustering-engine input from the slim DB representation. The DB id
// (ev-…) doubles as the in-memory Article.id, so cluster membership maps back
// to rows trivially; the stored body stands in for the feed description.
function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    title: row.title,
    description: row.body,
    url: row.url,
    urlToImage: row.raw_json?.urlToImage || '',
    imageWidth: row.raw_json?.imageWidth,
    imageHeight: row.raw_json?.imageHeight,
    publishedAt: new Date(row.published_at).toISOString(),
    source: {
      name: row.raw_json?.source?.name || row.source,
      url: row.raw_json?.source?.url || '',
    },
    category: row.category || 'Other',
  }
}

// One cheap authenticated call up front: some networks are blocked outright at
// Groq's edge (403 for every request), which the engine's per-seed error
// handling would otherwise turn into ~200 doomed calls and zero clusters.
async function groqReachable(): Promise<boolean> {
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️ GROQ_API_KEY is not set — no summaries will be generated.')
    return false
  }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) return true
    // Distinguish a rejected key from a blocked network: both used to read as
    // "unreachable", so an expired key silently produced no summaries forever.
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    console.warn(
      `⚠️ Groq preflight failed: HTTP ${res.status} ${res.statusText}. ` +
        (res.status === 401 || res.status === 403
          ? 'The API key was rejected — rotate the GROQ_API_KEY secret.'
          : 'Groq returned an unexpected status.') +
        (detail ? ` Response: ${detail}` : '')
    )
    return false
  } catch (error) {
    console.warn('⚠️ Groq preflight failed: network error —', (error as Error).message)
    return false
  }
}

// Degraded mode when the LLM tier is unavailable: the engine's own
// deterministic stages (TF-IDF seeds + title merge + category severity/score),
// so the evidence archive keeps accumulating stories through Groq outages.
function deterministicClusters(articles: Article[]): StoryCluster[] {
  const seeds = preClusterArticles(articles, {
    threshold: envNumber('PRECLUSTER_THRESHOLD', ENV_DEFAULTS.preclusterThreshold),
    minSize: envInt('PRECLUSTER_MIN_SIZE', ENV_DEFAULTS.preclusterMinSize),
    maxGroup: envInt('PRECLUSTER_MAX_GROUP', ENV_DEFAULTS.preclusterMaxGroup),
  })
  const merged = mergeClustersByTitle(seeds, {
    threshold: envNumber('CLUSTER_TITLE_MERGE', ENV_DEFAULTS.clusterTitleMerge),
  })
  const articleById = new Map(articles.map((a) => [a.id, a]))
  return merged
    .map((cluster) => {
      const members = cluster.articleIds
        .map((id) => articleById.get(id))
        .filter(Boolean) as Article[]
      const { ambiguous: _drop, ...severity } = computeSeverity({ ...cluster, articles: members })
      const withMeta: StoryCluster = { ...cluster, articles: members, severity }
      const imageUrls = [
        ...new Set(
          members.map((a) => a.urlToImage).filter((u) => u && !u.includes('placehold.co'))
        ),
      ].slice(0, 4)
      return { ...withMeta, imageUrls, score: scoreCluster(withMeta) }
    })
    .filter((c) => (c.articles?.length || 0) >= 2)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
}

async function main() {
  const started = Date.now()
  const sql = getSql()
  const rows = (await sql`
    SELECT id, title, body, url, category, published_at, source, raw_json
    FROM articles
    WHERE published_at > now() - make_interval(hours => ${WINDOW_HOURS})
    ORDER BY published_at DESC
    LIMIT ${ARTICLE_LIMIT}
  `) as unknown as ArticleRow[]
  const articles = rows.map(toArticle)
  console.log(`loaded ${articles.length} articles from the last ${WINDOW_HOURS}h, clustering…`)

  const groqOk = await groqReachable()
  // The full engine's per-seed LLM refinement is UNCAPPED (~100-200 70B calls
  // over a 2000-article window) — orders of magnitude beyond the summaries
  // budget. Deterministic clustering is the default; the LLM engine is a
  // deliberate opt-in, never an ambient cost.
  const useLlmEngine = envBool('CLUSTERS_USE_LLM', false) && groqOk
  let clusters: StoryCluster[]
  if (useLlmEngine) {
    const engine = await getStoryClusters(articles)
    if (engine.rateLimited) {
      console.warn('⚠️ Clustering was rate limited; nothing to persist this run.')
      return
    }
    clusters = engine.clusters
  } else {
    if (!groqOk) {
      console.warn('⚠️ Groq API unreachable — deterministic clustering, no summaries this run.')
    }
    clusters = deterministicClusters(articles)
  }
  console.log(`clustered into ${clusters.length} stories, persisting…`)

  const persisted = await persistClusters(clusters, articles)
  const summaries = groqOk
    ? await generateSummaries(persisted.storyIds)
    : { summariesGenerated: 0, digestsGenerated: 0, groqCalls: 0 }

  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(
    `done in ${seconds}s — stories: ${persisted.storiesCreated} created, ` +
      `${persisted.storiesUpdated} updated (${persisted.clustersSkipped} clusters skipped), ` +
      `${persisted.membersAdded} members added; ` +
      `${summaries.summariesGenerated} summaries + ${summaries.digestsGenerated} digests ` +
      `generated (${summaries.groqCalls} Groq calls)`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
