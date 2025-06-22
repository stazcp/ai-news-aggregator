import { Article, StoryCluster } from '@/types'
import { clusterArticles, summarizeCluster } from './groq'

/**
 * Fetches raw article clusters from the AI service.
 * @param articles - An array of articles to be clustered.
 * @returns A promise that resolves to an array of raw story clusters.
 */
async function getRawClusters(articles: Article[]): Promise<StoryCluster[]> {
  return await clusterArticles(articles)
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
  return Promise.all(
    rawClusters.map(async (cluster): Promise<StoryCluster> => {
      const articlesInCluster = cluster.articleIds
        .map((id) => articleMap.get(id))
        .filter(Boolean) as Article[]

      if (articlesInCluster.length < 2) {
        return { ...cluster, articles: articlesInCluster, summary: '' } // Return empty/invalid cluster
      }

      const summary = await summarizeCluster(articlesInCluster)
      const imageUrls = articlesInCluster
        .map((a) => a.urlToImage)
        .filter((url): url is string => !!url)
        .slice(0, 4)

      return { ...cluster, articles: articlesInCluster, summary, imageUrls }
    })
  )
}

/**
 * Main orchestrator function to get fully processed story clusters.
 * It fetches raw clusters and then enriches them.
 * @param articles - An array of all articles to be processed.
 * @returns A promise that resolves to an array of enriched story clusters.
 */
export async function getStoryClusters(articles: Article[]): Promise<StoryCluster[]> {
  const articleMap = new Map(articles.map((a) => [a.id, a]))
  const rawClusters = await getRawClusters(articles)
  const enrichedClusters = await enrichClusters(rawClusters, articleMap)
  // Filter out any clusters that became invalid (e.g., had fewer than 2 articles after enrichment)
  return enrichedClusters.filter((cluster) => cluster.articles && cluster.articles.length >= 2)
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
