import { Article, StoryCluster } from '@/types'
import { clusterArticles, summarizeCluster, mergeClustersByLLM } from './groq'
import { computeSeverity, scoreCluster } from './severity'
import { assessClusterSeverityLLM } from './groq'
import {
  preClusterArticles,
  mergeClustersByOverlap,
  splitIncoherentCluster,
  mergeClustersByTitle,
  expandClusterMembership,
} from './textCluster'

// Helper function to check if error is a rate limit error
function isRateLimitError(error: any): boolean {
  if (!error) return false

  // Check for Groq rate limit error patterns
  const errorMessage = error.message || error.toString() || ''
  const errorCode = error.code || error.error?.code || ''

  return (
    errorMessage.includes('rate_limit_exceeded') ||
    errorMessage.includes('429') ||
    errorCode === 'rate_limit_exceeded' ||
    error.status === 429 ||
    errorMessage.includes('Rate limit reached')
  )
}

/**
 * Fetches raw article clusters from the AI service.
 * @param articles - An array of articles to be clustered.
 * @returns A promise that resolves to an array of raw story clusters.
 */
async function getRawClusters(articles: Article[]): Promise<StoryCluster[]> {
  // Allow tuning via env vars without code changes
  const THRESH = parseFloat(process.env.PRECLUSTER_THRESHOLD || '0.42')
  const MIN_SIZE = parseInt(process.env.PRECLUSTER_MIN_SIZE || '2', 10)
  const MAX_GROUP = parseInt(process.env.PRECLUSTER_MAX_GROUP || '40', 10)
  const JACCARD = parseFloat(process.env.CLUSTER_JACCARD_MERGE || '0.45')
  const DIAG = (
    process.env.CLUSTER_DIAGNOSTICS || (process.env.NODE_ENV !== 'production' ? 'true' : 'false')
  )
    .toLowerCase()
    .trim() !== 'false'

  const printSamples = (label: string, groups: StoryCluster[]) => {
    if (!DIAG) return
    const titles = groups.slice(0, 5).map((c) => c.clusterTitle)
    console.log(`🔎 ${label}: ${groups.length} clusters`)
    if (titles.length) console.log('   •', titles.join(' | '))
  }

  // 1) Deterministic pre-clustering to create coherent seeds across ALL articles
  console.log('🧩 Pre-clustering articles (TF-IDF cosine)…')
  const seeds = preClusterArticles(articles, { threshold: THRESH, minSize: MIN_SIZE, maxGroup: MAX_GROUP })
  console.log(`🧪 Generated ${seeds.length} seed groups for LLM refinement (threshold=${THRESH}, min=${MIN_SIZE})`)
  printSamples('Seed groups (pre-refine)', seeds)

  // 2) Refine each seed with the LLM to name the cluster and adjust membership
  const allClusters: StoryCluster[] = []
  for (let si = 0; si < seeds.length; si++) {
    const seed = seeds[si]
    const seedArticles = articles.filter((a) => seed.articleIds.includes(a.id))

    // If a seed is very large, split into overlapping chunks to keep token usage sane
    const SEED_CHUNK = parseInt(process.env.CLUSTER_SEED_CHUNK || '25', 10)
    const SEED_OVERLAP = parseInt(process.env.CLUSTER_SEED_OVERLAP || '5', 10)
    if (seedArticles.length > SEED_CHUNK) {
      for (let i = 0; i < seedArticles.length; i += Math.max(1, SEED_CHUNK - SEED_OVERLAP)) {
        const chunk = seedArticles.slice(i, i + SEED_CHUNK)
        console.log(`🤖 Refining seed ${si + 1}/${seeds.length} chunk (${chunk.length})`)
        try {
          const refined = await clusterArticles(chunk)
          allClusters.push(...refined)
        } catch (error) {
          if (isRateLimitError(error)) {
            console.warn('⚠️ Rate limit during refinement; stopping.')
            throw new Error('RATE_LIMIT_EXCEEDED')
          }
          console.error('Error refining seed chunk:', error)
        }
        await new Promise((r) => setTimeout(r, 800))
      }
    } else {
      console.log(`🤖 Refining seed ${si + 1}/${seeds.length} (${seedArticles.length} articles)`) 
      try {
        const refined = await clusterArticles(seedArticles)
        allClusters.push(...refined)
      } catch (error) {
        if (isRateLimitError(error)) {
          console.warn('⚠️ Rate limit during refinement; stopping.')
          throw new Error('RATE_LIMIT_EXCEEDED')
        }
        console.error('Error refining seed:', error)
      }
      await new Promise((r) => setTimeout(r, 800))
    }
  }

  printSamples('LLM refined (pre-merge)', allClusters)

  // 3) Try to recover additional clusters from articles not yet assigned by seeds
  const covered = new Set<string>(allClusters.flatMap((c) => c.articleIds))
  const uncovered = articles.filter((a) => !covered.has(a.id))
  if (uncovered.length >= 3) {
    console.log(`🔎 Refining ${uncovered.length} uncovered articles to find more clusters…`)
    const UNCOVERED_CHUNK = parseInt(process.env.CLUSTER_UNCOVERED_CHUNK || '40', 10)
    for (let i = 0; i < uncovered.length; i += UNCOVERED_CHUNK) {
      const chunk = uncovered.slice(i, i + UNCOVERED_CHUNK)
      try {
        const extra = await clusterArticles(chunk)
        allClusters.push(...extra)
      } catch (error) {
        if (isRateLimitError(error)) {
          console.warn('⚠️ Rate limit during uncovered refinement; stopping.')
          throw new Error('RATE_LIMIT_EXCEEDED')
        }
        console.error('Error refining uncovered articles:', error)
      }
      await new Promise((r) => setTimeout(r, 600))
    }
  }

  // 4) Merge overlapping clusters that the LLM split across chunks
  const merged = mergeClustersByOverlap(allClusters, { jaccard: JACCARD })
  console.log(`🧷 Merged to ${merged.length} raw clusters after overlap resolution (j=${JACCARD})`)
  printSamples('After ID-overlap merge', merged)

  // 4b) Merge clusters with near-identical titles (handles disjoint-article duplicates)
  const TITLE_THRESH = parseFloat(process.env.CLUSTER_TITLE_MERGE || '0.72')
  const titleMerged = mergeClustersByTitle(merged, { threshold: TITLE_THRESH })
  console.log(`🧲 Title-merged down to ${titleMerged.length} clusters (t=${TITLE_THRESH})`)
  printSamples('After title merge', titleMerged)

  // 5) Coherence guard: split any incoherent clusters into tighter subclusters
  const COH_THRESH = parseFloat(process.env.CLUSTER_COHERENCE_THRESHOLD || '0.52')
  const COH_MIN = parseInt(process.env.CLUSTER_COHERENCE_MIN || '2', 10)
  const finalRaw: StoryCluster[] = []
  for (const c of titleMerged) {
    const subs = splitIncoherentCluster(articles, c, { threshold: COH_THRESH, minSize: COH_MIN })
    if (subs.length > 0) {
      finalRaw.push(...subs)
    } else {
      // Keep original if cannot split and size is at least min
      if ((c.articleIds?.length || 0) >= COH_MIN) finalRaw.push(c)
    }
  }
  console.log(`🧪 Coherence check produced ${finalRaw.length} refined raw clusters`)
  printSamples('After coherence split', finalRaw)

  // 6) LLM merge for paraphrases / cross-language duplicates (optional via env toggle)
  const ENABLE_LLM_MERGE = (process.env.CLUSTER_LLM_MERGE || 'true').toLowerCase() !== 'false'
  if (ENABLE_LLM_MERGE && finalRaw.length > 1) {
    try {
      // Build a quick map for article lookup
      const articleMap = new Map(articles.map((a) => [a.id, a]))
      const mergedLLM = await mergeClustersByLLM(finalRaw, articleMap)
      console.log(`🤝 LLM merged to ${mergedLLM.length} clusters`)
      printSamples('After LLM merge', mergedLLM)
      // Optional expansion to reach 10–20 sources per event
      const EXPAND = (process.env.CLUSTER_EXPAND || 'true').toLowerCase() !== 'false'
      if (EXPAND) {
        const sim = parseFloat(process.env.CLUSTER_EXPAND_SIM || '0.46')
        const maxAdd = parseInt(process.env.CLUSTER_EXPAND_MAX_ADD || '30', 10)
        const hours = parseInt(process.env.CLUSTER_EXPAND_TIME_HOURS || '96', 10)
        const strict = (process.env.CLUSTER_EXPAND_CATEGORY_STRICT || 'true').toLowerCase() !== 'false'
        const expanded = mergedLLM.map((c) =>
          expandClusterMembership(articles, c, {
            simThreshold: sim,
            maxAdd,
            timeWindowHours: hours,
            categoryStrict: strict,
          })
        )
        printSamples('After expansion', expanded)
        return expanded
      }
      return mergedLLM
    } catch (e) {
      console.warn('LLM merge step failed; falling back to coherence output', e)
      return finalRaw
    }
  }

  return finalRaw
}

/**
 * Enriches each raw cluster with its full articles, a synthesized summary,
 * and a list of image URLs for a collage.
 * @param rawClusters - An array of raw story clusters.
 * @param articleMap - A map of article IDs to full article objects.
 * @returns A promise that resolves to an array of fully processed story clusters.
 */
async function enrichClusters(
  rawClusters: StoryCluster[],
  articleMap: Map<string, Article>
): Promise<StoryCluster[]> {
  const enrichedClusters: StoryCluster[] = []

  for (let i = 0; i < rawClusters.length; i++) {
    const cluster = rawClusters[i]
    try {
      let articlesInCluster = cluster.articleIds
        .map((id) => articleMap.get(id))
        .filter(Boolean) as Article[]

      if (articlesInCluster.length < 2) {
        continue // Skip invalid clusters
      }

      // Prefer diversity: cap per-domain to avoid single-source dominance
      const perDomainMax = 2
      const domainCounts = new Map<string, number>()
      const diverse: Article[] = []
      for (const a of articlesInCluster.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())) {
        try {
          const host = new URL(a.url).hostname.replace(/^www\./, '')
          const used = domainCounts.get(host) || 0
          if (used < perDomainMax) {
            domainCounts.set(host, used + 1)
            diverse.push(a)
          }
        } catch {
          diverse.push(a)
        }
        if (diverse.length >= 20) break
      }
      articlesInCluster = diverse

      const summary = await summarizeCluster(articlesInCluster)
      const imageUrls = articlesInCluster
        .map((a) => a.urlToImage)
        .filter((url) => url && !url.includes('placehold.co'))
        .slice(0, 4)

      enrichedClusters.push({ ...cluster, articles: articlesInCluster, summary, imageUrls })

      // Artificial Delay to avoid rate limits
      if (i < rawClusters.length - 1) {
        // Only delay if there are more clusters
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        console.warn(`⚠️ Rate limit hit during cluster summarization. Stopping further processing.`)
        throw new Error('RATE_LIMIT_EXCEEDED')
      }
      console.error(`Error enriching cluster "${cluster.clusterTitle}":`, error)
      // Continue with other clusters even if one fails
    }
  }

  return enrichedClusters
}

/**
 * Main orchestrator function to get fully processed story clusters.
 * It fetches raw clusters and then enriches them.
 * @param articles - An array of all articles to be processed.
 * @returns A promise that resolves to an object with clusters and rate limit status.
 */
export async function getStoryClusters(articles: Article[]): Promise<{
  clusters: StoryCluster[]
  rateLimited: boolean
}> {
  try {
    console.log(`🔄 Starting clustering process for ${articles.length} articles`)
    const articleMap = new Map(articles.map((a) => [a.id, a]))
    const rawClusters = await getRawClusters(articles)
  const enrichedClusters = await enrichClusters(rawClusters, articleMap)
  // Filter out any clusters that became invalid (e.g., had fewer than 2 articles after enrichment)
  let validClusters = enrichedClusters.filter(
    (cluster) => cluster.articles && cluster.articles.length >= 2
  )

  // Compute severity and scores, then sort
  const sevBoosts = {
    'War/Conflict': Number(process.env.SEVERITY_BOOST_WAR || 10),
    'Mass Casualty/Deaths': Number(process.env.SEVERITY_BOOST_DEATHS || 7),
    'National Politics': Number(process.env.SEVERITY_BOOST_POLITICS || 3),
    'Economy/Markets': Number(process.env.SEVERITY_BOOST_ECONOMY || 2),
    'Tech/Business': Number(process.env.SEVERITY_BOOST_TECH || 1),
    Other: Number(process.env.SEVERITY_BOOST_OTHER || 0),
  }

  const USE_LLM_SEVERITY = (process.env.SEVERITY_USE_LLM || 'true').toLowerCase() !== 'false'
  const computed: StoryCluster[] = []
  for (const c of validClusters) {
    let severity = USE_LLM_SEVERITY ? await assessClusterSeverityLLM(c) : computeSeverity(c)
    // Fallback if LLM returns neutral
    if (!USE_LLM_SEVERITY || !severity || severity.level === 0) {
      severity = computeSeverity(c)
    }
    const score = scoreCluster({ ...c, severity }, { severityBoosts: sevBoosts })
    computed.push({ ...c, severity, score })
  }
  validClusters = computed

  validClusters.sort((a, b) => (b.score || 0) - (a.score || 0))

  console.log(`✅ Successfully created ${validClusters.length} story clusters (scored and sorted)`) 
  return { clusters: validClusters, rateLimited: false }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (isRateLimitError(error) || errorMessage === 'RATE_LIMIT_EXCEEDED') {
      console.warn(
        '⚠️ Rate limit exceeded during clustering. Returning empty clusters array to show individual articles instead.'
      )
      return { clusters: [], rateLimited: true }
    }
    console.error('❌ Unexpected error during clustering:', error)
    return { clusters: [], rateLimited: false } // Return empty array to gracefully fallback to individual articles
  }
}

/**
 * Finds all articles that were not included in any story cluster.
 * @param allArticles - The complete list of articles.
 * @param clusters - The list of story clusters.
 * @returns An array of unclustered articles.
 */
export function getUnclusteredArticles(
  allArticles: Article[],
  clusters: StoryCluster[]
): Article[] {
  const clusteredIds = new Set(clusters.flatMap((c) => c.articleIds))
  return allArticles.filter((a) => !clusteredIds.has(a.id))
}
