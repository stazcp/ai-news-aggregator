import { Article, StoryCluster } from '@/types'
import { clusterArticles, summarizeCluster } from './groq'

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
  const allClusters: StoryCluster[] = []
  const batchSize = 50 // Reduced batch size to 50 to ensure requests are small enough

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize)
    console.log(`🤖 Clustering batch ${i / batchSize + 1}... (${batch.length} articles)`)
    try {
      const clustersFromBatch = await clusterArticles(batch)
      allClusters.push(...clustersFromBatch)
    } catch (error) {
      if (isRateLimitError(error)) {
        console.warn(
          `⚠️ Rate limit hit during clustering batch ${i / batchSize + 1}. Stopping clustering to prevent further errors.`
        )
        throw new Error('RATE_LIMIT_EXCEEDED')
      }
      console.error(`Error clustering batch starting at index ${i}:`, error)
    }
    // Optional: Add a small delay between batches if hitting rate limits
    // await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // A potential issue with simple batching is that a single story might be split
  // across two batches, preventing it from being clustered. For this technical test,
  // simple batching is a reasonable approach to avoid the immediate error.
  // A more advanced solution could involve overlap or a more sophisticated grouping strategy.

  return allClusters
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

  for (const cluster of rawClusters) {
    try {
      const articlesInCluster = cluster.articleIds
        .map((id) => articleMap.get(id))
        .filter(Boolean) as Article[]

      if (articlesInCluster.length < 2) {
        continue // Skip invalid clusters
      }

      const summary = await summarizeCluster(articlesInCluster)
      const imageUrls = articlesInCluster
        .map((a) => a.urlToImage)
        .filter((url) => url && !url.includes('placehold.co'))
        .slice(0, 4)

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
 * @returns A promise that resolves to an array of enriched story clusters.
 */
export async function getStoryClusters(articles: Article[]): Promise<StoryCluster[]> {
  try {
    console.log(`🔄 Starting clustering process for ${articles.length} articles`)
    const articleMap = new Map(articles.map((a) => [a.id, a]))
    const rawClusters = await getRawClusters(articles)
    const enrichedClusters = await enrichClusters(rawClusters, articleMap)
    // Filter out any clusters that became invalid (e.g., had fewer than 2 articles after enrichment)
    const validClusters = enrichedClusters.filter(
      (cluster) => cluster.articles && cluster.articles.length >= 2
    )
    console.log(`✅ Successfully created ${validClusters.length} story clusters`)
    return validClusters
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (isRateLimitError(error) || errorMessage === 'RATE_LIMIT_EXCEEDED') {
      console.warn(
        '⚠️ Rate limit exceeded during clustering. Returning empty clusters array to show individual articles instead.'
      )
      return []
    }
    console.error('❌ Unexpected error during clustering:', error)
    return [] // Return empty array to gracefully fallback to individual articles
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
