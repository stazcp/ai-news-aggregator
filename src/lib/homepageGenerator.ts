import { fetchAllNews } from './newsService'
import { getStoryClusters, getUnclusteredArticles } from './clusterService'
import { setCachedData, getCachedData } from './cache'
import { computeTrendingTopics, computeCategoryFallbackTopics } from './topics'
import { summarizeArticle, summarizeCluster } from './groq'
import { StoryCluster, Article } from '@/types'

export interface HomepageData {
  storyClusters: StoryCluster[]
  unclusteredArticles: Article[]
  rateLimitMessage: string | null
  topics: string[]
  lastUpdated: string
}

/**
 * Generates fresh homepage data with articles, clusters, and topics
 * This is the core function used by both the API endpoint and background refresh
 */
export async function generateFreshHomepage(): Promise<HomepageData> {
  console.log('🔄 Generating fresh homepage data...')

  try {
    // Fetch articles
    const articles = await fetchAllNews()
    console.log(`📰 Fetched ${articles.length} articles`)

    // Generate clusters
    const clusteringResult = await getStoryClusters(articles)
    const storyClusters = clusteringResult.clusters
    console.log(`🔗 Generated ${storyClusters.length} clusters`)

    // Get unclustered articles and topics
    const unclusteredArticles = getUnclusteredArticles(articles, storyClusters)
    const computed = computeTrendingTopics(articles, storyClusters, 10)
    const topics = computed.length
      ? computed
      : computeCategoryFallbackTopics(articles, storyClusters, 10)

    const homepageData: HomepageData = {
      storyClusters,
      unclusteredArticles,
      rateLimitMessage: clusteringResult.rateLimited
        ? 'AI clustering temporarily unavailable due to rate limits. Showing individual articles.'
        : null,
      topics,
      lastUpdated: new Date().toISOString(),
    }

    // Cache for 24 hours
    await setCachedData('homepage-result', homepageData, 86400)
    console.log('💾 Cached fresh homepage data')

    return homepageData
  } catch (error) {
    console.error('❌ Failed to generate fresh homepage:', error)
    throw error
  }
}

/**
 * Generates and caches AI summaries for top stories
 * Used by the background refresh to pre-warm expensive AI operations
 */
export async function generateTopStorySummaries(
  storyClusters: StoryCluster[],
  articles: Article[],
  progressCallback?: (completed: number, total: number) => Promise<void>
): Promise<void> {
  console.log('🤖 Generating AI summaries for top stories...')

  const topClusters = storyClusters.slice(0, 10) // Top 10 clusters
  const topArticles = articles.slice(0, 15) // Top 15 articles

  let completed = 0
  const total = topClusters.length + topArticles.length

  // Generate cluster summaries
  const clusterPromises = topClusters.map(async (cluster) => {
    try {
      // Generate unique ID from cluster's article IDs
      const clusterId = (cluster.articleIds || []).slice(0, 10).sort().join('-')
      await generateAndCacheSummary(clusterId, cluster.articles || [], true, cluster.clusterTitle)
      completed++
      if (progressCallback) {
        await progressCallback(completed, total)
      }
      console.log(`✅ Generated summary for cluster: ${cluster.clusterTitle}`)
    } catch (error) {
      console.error(`❌ Failed to generate cluster summary for ${cluster.clusterTitle}:`, error)
      completed++ // Still count as completed to keep progress accurate
      if (progressCallback) {
        await progressCallback(completed, total)
      }
    }
  })

  // Generate article summaries
  const articlePromises = topArticles.map(async (article) => {
    try {
      await generateAndCacheSummary(article.id, article.content || '', false)
      completed++
      if (progressCallback) {
        await progressCallback(completed, total)
      }
      console.log(`✅ Generated summary for article: ${article.title}`)
    } catch (error) {
      console.error(`❌ Failed to generate article summary for ${article.id}:`, error)
      completed++ // Still count as completed to keep progress accurate
      if (progressCallback) {
        await progressCallback(completed, total)
      }
    }
  })

  // Wait for all summaries to complete (or fail)
  await Promise.allSettled([...clusterPromises, ...articlePromises])
  console.log(`✅ Completed summary generation: ${completed}/${total} summaries processed`)
}

/**
 * Generates and caches a single summary
 */
async function generateAndCacheSummary(
  articleId: string,
  content: string | Article[],
  isCluster: boolean,
  clusterTitle?: string
): Promise<void> {
  const cacheKey = `Summary-${articleId}`
  const existing = await getCachedData(cacheKey)

  if (existing) {
    console.log(`⏭️ Summary already exists for ${articleId}`)
    return
  }

  try {
    let summary: string

    if (isCluster && Array.isArray(content)) {
      // Use the cluster-specific summarizer for multi-sentence cohesive summaries
      summary = await summarizeCluster(content)
    } else if (typeof content === 'string') {
      // Regular article summary
      summary = await summarizeArticle(content)
    } else {
      throw new Error('Invalid content type for summary generation')
    }

    // Cache for 24 hours to match the refresh cycle
    await setCachedData(cacheKey, summary, 86400)
    console.log(`✅ Generated and cached summary for ${articleId}`)
  } catch (error) {
    console.error(`❌ Failed to generate summary for ${articleId}:`, error)
    // Don't throw - we want the refresh to continue even if some summaries fail
  }
}

/**
 * Enriches clusters with pre-generated summaries
 */
export async function enrichClustersWithSummaries(
  storyClusters: StoryCluster[]
): Promise<StoryCluster[]> {
  return Promise.all(
    storyClusters.map(async (cluster) => {
      // Generate unique ID from cluster's article IDs (same as in generateTopStorySummaries)
      const clusterId = (cluster.articleIds || []).slice(0, 10).sort().join('-')
      return {
        ...cluster,
        // Preserve existing server-generated summary; otherwise, hydrate from cache if available
        summary: cluster.summary || (await getCachedData(`Summary-${clusterId}`)) || undefined,
      }
    })
  )
}
