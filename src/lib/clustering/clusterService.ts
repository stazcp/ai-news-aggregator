import { Article, StoryCluster } from '@/types'
import { inferImageDimsFromUrl } from '../images/imageProviders'
import { clusterArticles, summarizeCluster, mergeClustersByLLM, batchAssessSeverityLLM } from '../ai/groq'
import { computeSeverity, scoreCluster } from './severity'
import {
  preClusterArticles,
  mergeClustersByOverlap,
  splitIncoherentCluster,
  mergeClustersByTitle,
  mergeClustersByEntity,
  expandClusterMembership,
  buildTfIdf,
  linkRelatedClusters,
} from './textCluster'
import { simpleHash } from '@/lib/utils'
import { ENV_DEFAULTS, envBool, envInt, envNumber } from '@/lib/config/env'

/**
 * Resolve the effective hostname for an article, preferring the publisher's
 * actual URL (`source.url`) over the article URL (which may be a Google News
 * redirect).  When the host is still `news.google.com` (decoding failed), falls
 * back to `source.name` so different publishers are not treated as one domain.
 */
export function resolveArticleHost(a: Article): string {
  try {
    const urlForHost = a.source?.url || a.url
    let host = new URL(urlForHost).hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'news.google.com' && a.source?.name) {
      host = `news.google.com:${a.source.name.toLowerCase()}`
    }
    return host
  } catch {
    return ''
  }
}

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
    errorMessage.includes('Rate limit reached') ||
    // Groq returns 403 for spend limit exceeded (not auth failures, which also 403
    // but include "invalid_api_key" in the error code)
    (error.status === 403 && errorCode !== 'invalid_api_key')
  )
}

/**
 * Fetches raw article clusters from the AI service.
 * @param articles - An array of articles to be clustered.
 * @returns A promise that resolves to an array of raw story clusters.
 */
async function getRawClusters(articles: Article[]): Promise<StoryCluster[]> {
  // Allow tuning via env vars without code changes
  const THRESH = envNumber('PRECLUSTER_THRESHOLD', ENV_DEFAULTS.preclusterThreshold)
  const MIN_SIZE = envInt('PRECLUSTER_MIN_SIZE', ENV_DEFAULTS.preclusterMinSize)
  const MAX_GROUP = envInt('PRECLUSTER_MAX_GROUP', ENV_DEFAULTS.preclusterMaxGroup)
  const JACCARD = envNumber('CLUSTER_JACCARD_MERGE', ENV_DEFAULTS.clusterJaccardMerge)
  const DIAG = envBool('CLUSTER_DIAGNOSTICS', ENV_DEFAULTS.clusterDiagnostics)

  const printSamples = (label: string, groups: StoryCluster[]) => {
    if (!DIAG) return
    const titles = groups.slice(0, 5).map((c) => c.clusterTitle)
    console.log(`🔎 ${label}: ${groups.length} clusters`)
    if (titles.length) console.log('   •', titles.join(' | '))
  }

  // 1) Deterministic pre-clustering to create coherent seeds across ALL articles
  console.log('🧩 Pre-clustering articles (TF-IDF cosine)…')
  const seeds = preClusterArticles(articles, {
    threshold: THRESH,
    minSize: MIN_SIZE,
    maxGroup: MAX_GROUP,
  })
  console.log(
    `🧪 Generated ${seeds.length} seed groups for LLM refinement (threshold=${THRESH}, min=${MIN_SIZE})`
  )
  printSamples('Seed groups (pre-refine)', seeds)

  // 2) Refine each seed with the LLM to name the cluster and adjust membership
  const allClusters: StoryCluster[] = []
  try {
    for (let si = 0; si < seeds.length; si++) {
      const seed = seeds[si]
      const seedArticles = articles.filter((a) => seed.articleIds.includes(a.id))

      // If a seed is very large, split into overlapping chunks to keep token usage sane
      const SEED_CHUNK = envInt('CLUSTER_SEED_CHUNK', ENV_DEFAULTS.clusterSeedChunk)
      const SEED_OVERLAP = envInt('CLUSTER_SEED_OVERLAP', ENV_DEFAULTS.clusterSeedOverlap)
      if (seedArticles.length > SEED_CHUNK) {
        for (let i = 0; i < seedArticles.length; i += Math.max(1, SEED_CHUNK - SEED_OVERLAP)) {
          const chunk = seedArticles.slice(i, i + SEED_CHUNK)
          console.log(`🤖 Refining seed ${si + 1}/${seeds.length} chunk (${chunk.length})`)
          try {
            const refined = await clusterArticles(chunk)
            allClusters.push(...refined)
          } catch (error) {
            if (isRateLimitError(error)) {
              console.warn(
                '⚠️ Rate limit during refinement (or spend limit). Falling back to deterministic seeds.'
              )
              // Fallback: return seeds as clusters
              return seeds
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
            console.warn(
              '⚠️ Rate limit during refinement (or spend limit). Falling back to deterministic seeds.'
            )
            return seeds
          }
          console.error('Error refining seed:', error)
        }
        await new Promise((r) => setTimeout(r, 800))
      }
    }
  } catch (e) {
    console.warn('⚠️ Unexpected error during refinement; falling back to seeds.', e)
    return seeds
  }

  printSamples('LLM refined (pre-merge)', allClusters)

  // 3) Try to recover additional clusters from articles not yet assigned by seeds
  const covered = new Set<string>(allClusters.flatMap((c) => c.articleIds))
  const uncovered = articles.filter((a) => !covered.has(a.id))
  if (uncovered.length >= 3) {
    console.log(`🔎 Refining ${uncovered.length} uncovered articles to find more clusters…`)
    const UNCOVERED_CHUNK = envInt('CLUSTER_UNCOVERED_CHUNK', ENV_DEFAULTS.clusterUncoveredChunk)
    for (let i = 0; i < uncovered.length; i += UNCOVERED_CHUNK) {
      const chunk = uncovered.slice(i, i + UNCOVERED_CHUNK)
      try {
        const extra = await clusterArticles(chunk)
        allClusters.push(...extra)
      } catch (error) {
        if (isRateLimitError(error)) {
          console.warn('⚠️ Rate limit during uncovered refinement; skipping uncovered step.')
          break
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
  const TITLE_THRESH = envNumber('CLUSTER_TITLE_MERGE', ENV_DEFAULTS.clusterTitleMerge)
  const titleMerged = mergeClustersByTitle(merged, { threshold: TITLE_THRESH })
  console.log(`🧲 Title-merged down to ${titleMerged.length} clusters (t=${TITLE_THRESH})`)
  printSamples('After title merge', titleMerged)

  // 4c) Merge clusters that share key entities (same topic/event, different angles)
  // Coherence gate prevents unrelated clusters sharing common entities from merging
  const articleMap = new Map(articles.map((a) => [a.id, a]))
  const ENTITY_MIN_SHARED = envInt('CLUSTER_ENTITY_MIN_SHARED', ENV_DEFAULTS.clusterEntityMinShared)
  const ENTITY_MIN_LEN = envInt('CLUSTER_ENTITY_MIN_LENGTH', ENV_DEFAULTS.clusterEntityMinLength)
  const ENTITY_MIN_COH = envNumber(
    'CLUSTER_ENTITY_MIN_COHERENCE',
    ENV_DEFAULTS.clusterEntityMinCoherence
  )
  const entityMerged = mergeClustersByEntity(titleMerged, articleMap, {
    minSharedEntities: ENTITY_MIN_SHARED,
    minEntityLength: ENTITY_MIN_LEN,
    minCoherence: ENTITY_MIN_COH,
  })
  console.log(`🏷️ Entity-merged down to ${entityMerged.length} clusters`)
  printSamples('After entity merge', entityMerged)

  // 5) Coherence guard: split any incoherent clusters into tighter subclusters
  const COH_THRESH = envNumber('CLUSTER_COHERENCE_THRESHOLD', ENV_DEFAULTS.clusterCoherenceThreshold)
  const COH_MIN = envInt('CLUSTER_COHERENCE_MIN', ENV_DEFAULTS.clusterCoherenceMin)
  const finalRaw: StoryCluster[] = []
  for (const c of entityMerged) {
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

  // 5b) Re-merge fragments that coherence split into near-identical titled clusters
  // (e.g. two "Winter Olympics" clusters created when a big Olympics cluster was split)
  const postCohTitleMerged = mergeClustersByTitle(finalRaw, { threshold: TITLE_THRESH })
  if (postCohTitleMerged.length < finalRaw.length) {
    console.log(
      `🧲 Post-coherence title re-merge: ${finalRaw.length} → ${postCohTitleMerged.length}`
    )
  }

  // 6) LLM merge for paraphrases / cross-language duplicates (optional via env toggle)
  let preFinal = postCohTitleMerged
  const ENABLE_LLM_MERGE = envBool('CLUSTER_LLM_MERGE', ENV_DEFAULTS.clusterLlmMerge)
  if (ENABLE_LLM_MERGE && postCohTitleMerged.length > 1) {
    try {
      const mergedLLM = await mergeClustersByLLM(postCohTitleMerged, articleMap)
      console.log(`🤝 LLM merged to ${mergedLLM.length} clusters`)
      printSamples('After LLM merge', mergedLLM)
      preFinal = mergedLLM
    } catch (e) {
      console.warn('LLM merge step failed; continuing with coherence output', e)
    }
  }

  // 7) Expand clusters to reach 10–20 sources per event (TF-IDF centroid matching)
  const { vecs: expandVecs } = buildTfIdf(articles)
  const expanded = preFinal.map((c) =>
    expandClusterMembership(articles, c, { prebuiltVecs: expandVecs })
  )
  printSamples('After expansion', expanded)

  // Post-expansion coherence guard: expansion can pull in unrelated articles
  const postExpand: StoryCluster[] = []
  for (const c of expanded) {
    const subs = splitIncoherentCluster(articles, c, { threshold: COH_THRESH, minSize: COH_MIN })
    if (subs.length > 0) {
      postExpand.push(...subs)
    } else {
      if ((c.articleIds?.length || 0) >= COH_MIN) postExpand.push(c)
    }
  }
  const remerged = mergeClustersByTitle(postExpand, { threshold: TITLE_THRESH })
  if (remerged.length < expanded.length) {
    console.log(`🧹 Post-expansion coherence: ${expanded.length} → ${remerged.length} clusters`)
  }
  printSamples('After post-expansion coherence', remerged)
  return remerged
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
  const DO_SUMMARY_DURING_ENRICH = envBool(
    'CLUSTER_SUMMARIZE_DURING_ENRICH',
    ENV_DEFAULTS.clusterSummarizeDuringEnrich
  )

  for (let i = 0; i < rawClusters.length; i++) {
    const cluster = rawClusters[i]
    try {
      let articlesInCluster = cluster.articleIds
        .map((id) => articleMap.get(id))
        .filter(Boolean) as Article[]

      if (articlesInCluster.length < 2) {
        continue // Skip invalid clusters
      }

      const hasUsefulImage = (a: Article | undefined) => {
        if (!a) return false
        const url = a.urlToImage || ''
        if (!url) return false
        if (url.includes('placehold.co')) return false
        return true
      }

      // Dedupe articles within a cluster (same story from multiple categories or mirrors)
      const seen = new Set<string>()
      const canonical = (a: Article) => {
        try {
          if (a.url) {
            const u = new URL(a.url)
            // Ignore query/hash for canonicalization to reduce duplicates
            return `${u.origin}${u.pathname}`
          }
        } catch {}
        // Fallback: tie dedupe explicitly to host (never cross-host)
        let host = ''
        try {
          if (a.source?.url)
            host = new URL(a.source.url).hostname.replace(/^www\./, '').toLowerCase()
        } catch {}
        return `${host}|${(a.title || '').toLowerCase().trim()}`
      }
      articlesInCluster = articlesInCluster.filter((a) => {
        const key = canonical(a)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Additional guard: drop exact same title from the same host (even if URL differs)
      // This avoids removing articles from different outlets that share the same headline.
      const seenTitleByHost = new Set<string>()
      articlesInCluster = articlesInCluster.filter((a) => {
        const host = resolveArticleHost(a)
        const k = `${host}|${(a.title || '').toLowerCase().trim()}`
        if (seenTitleByHost.has(k)) return false
        seenTitleByHost.add(k)
        return true
      })

      // Prefer articles with real images before applying domain caps so collages have content
      const dedupedArticles = [...articlesInCluster]
      articlesInCluster = articlesInCluster.sort((a, b) => {
        const aHasImage = hasUsefulImage(a) ? 0 : 1
        const bHasImage = hasUsefulImage(b) ? 0 : 1
        if (aHasImage !== bHasImage) return aHasImage - bHasImage
        const timeDiff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        return timeDiff
      })

      // Prefer diversity: cap per-domain to avoid single-source dominance
      const perDomainMax = envInt('CLUSTER_PER_DOMAIN_MAX', ENV_DEFAULTS.clusterPerDomainMax)
      const displayCap = envInt('CLUSTER_DISPLAY_CAP', ENV_DEFAULTS.clusterDisplayCap)
      const domainCounts = new Map<string, number>()
      const diverse: Article[] = []
      for (const a of articlesInCluster.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )) {
        const host = resolveArticleHost(a)
        if (!host) {
          // Unparseable URL — always include (matches pre-refactor catch behavior)
          diverse.push(a)
        } else {
          const used = domainCounts.get(host) || 0
          if (used < perDomainMax) {
            domainCounts.set(host, used + 1)
            diverse.push(a)
          }
        }
        if (diverse.length >= displayCap) break
      }
      articlesInCluster = diverse

      const summary = DO_SUMMARY_DURING_ENRICH ? await summarizeCluster(articlesInCluster) : ''
      const MINW = envInt('NEXT_PUBLIC_MIN_IMAGE_WIDTH', ENV_DEFAULTS.nextPublicMinImageWidth)
      const MINH = envInt('NEXT_PUBLIC_MIN_IMAGE_HEIGHT', ENV_DEFAULTS.nextPublicMinImageHeight)
      const imageSourceArticles = articlesInCluster.some(hasUsefulImage)
        ? articlesInCluster
        : dedupedArticles
      const validImageArticles = imageSourceArticles.filter((a) => {
        const urlOk = a.urlToImage && !a.urlToImage.includes('placehold.co')
        if (!urlOk) return false
        // Prefer explicit dims; if missing, infer from known providers (Guardian/BBC)
        let w = a.imageWidth
        let h = a.imageHeight
        if (!w || !h) {
          const inferred = inferImageDimsFromUrl(a.urlToImage)
          w = w || inferred.width
          h = h || inferred.height
        }
        // Enforce minimums when we know at least one dimension
        if (typeof w === 'number' && w > 0 && w < MINW) return false
        if (typeof h === 'number' && h > 0 && h < MINH) return false
        return true
      })
      // Unique image URLs only to avoid duplicate keys and empty slots
      const imageUrls = Array.from(new Set(validImageArticles.map((a) => a.urlToImage))).slice(0, 4)

      enrichedClusters.push({ ...cluster, articles: articlesInCluster, summary, imageUrls })
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
      'War/Conflict': envNumber('SEVERITY_BOOST_WAR', ENV_DEFAULTS.severityBoostWar),
      'Mass Casualty/Deaths': envNumber('SEVERITY_BOOST_DEATHS', ENV_DEFAULTS.severityBoostDeaths),
      'National Politics': envNumber(
        'SEVERITY_BOOST_POLITICS',
        ENV_DEFAULTS.severityBoostPolitics
      ),
      'Economy/Markets': envNumber('SEVERITY_BOOST_ECONOMY', ENV_DEFAULTS.severityBoostEconomy),
      'Tech/Business': envNumber('SEVERITY_BOOST_TECH', ENV_DEFAULTS.severityBoostTech),
      Other: envNumber('SEVERITY_BOOST_OTHER', ENV_DEFAULTS.severityBoostOther),
    }

    const USE_LLM_SEVERITY = envBool('SEVERITY_USE_LLM', ENV_DEFAULTS.severityUseLlm)
    const LLM_SEVERITY_TOP_N = envInt('SEVERITY_LLM_TOP_N', ENV_DEFAULTS.severityLlmTopN)

    // Step 1: fast category-based severity for all clusters
    const withSeverity = validClusters.map((c) => ({
      ...c,
      severity: computeSeverity(c) as StoryCluster['severity'] & { ambiguous?: boolean },
    }))

    // Step 2: fast-score for ranking
    withSeverity.sort(
      (a, b) =>
        scoreCluster(b, { severityBoosts: sevBoosts }) -
        scoreCluster(a, { severityBoosts: sevBoosts })
    )

    // Step 3: one batch LLM call for ambiguous clusters in top N
    if (USE_LLM_SEVERITY) {
      const topN = withSeverity.slice(0, LLM_SEVERITY_TOP_N)
      const ambiguousInTopN = topN.filter((c) => c.severity?.ambiguous)
      if (ambiguousInTopN.length > 0) {
        console.log(`🔎 Batch LLM severity for ${ambiguousInTopN.length} ambiguous top clusters`)
        const llmResults = await batchAssessSeverityLLM(ambiguousInTopN)
        llmResults.forEach((llmSev, i) => {
          if (llmSev) ambiguousInTopN[i].severity = llmSev
        })
      }
    }

    // Step 4: final score with settled severities; strip internal ambiguous flag
    validClusters = withSeverity
      .map((c) => {
        const { ambiguous: _drop, ...cleanSeverity } = (c.severity as any) ?? {}
        const severity = cleanSeverity as StoryCluster['severity']
        return {
          ...c,
          severity,
          score: scoreCluster({ ...c, severity }, { severityBoosts: sevBoosts }),
        }
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0))

    // Assign stable IDs (hash of sorted articleIds)
    validClusters = validClusters.map((c) => ({
      ...c,
      id: `cluster-${simpleHash([...c.articleIds].sort().join('|'))}`,
    }))

    // Link related clusters (same story, different angle) without merging
    // Use the original full articleMap (all raw articles), not the diversity-filtered c.articles,
    // so TF-IDF has full coverage and cross-cluster coherence scores are meaningful.
    validClusters = linkRelatedClusters(validClusters, articleMap)

    // Summarize only top-N clusters to reduce Groq load; others lazy-load on client
    const SUM_TOP = envInt('CLUSTER_SUMMARIZE_TOP_N', ENV_DEFAULTS.clusterSummarizeTopN)
    const topToSummarize = validClusters.slice(0, SUM_TOP)
    for (let i = 0; i < topToSummarize.length; i++) {
      try {
        if (!topToSummarize[i].summary) {
          const s = await summarizeCluster(topToSummarize[i].articles || [])
          topToSummarize[i].summary = s
          if (i < topToSummarize.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000))
          }
        }
      } catch (e) {
        if (isRateLimitError(e)) break
      }
    }

    console.log(
      `✅ Successfully created ${validClusters.length} story clusters (scored and sorted)`
    )
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
