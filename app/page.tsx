import { fetchAllNews } from '@/lib/newsService'
import { clusterArticles, summarizeCluster } from '@/lib/groq'
import NewsList from '@/components/NewsList'
import { Article, StoryCluster } from '@/types'

export const revalidate = 600 // Cache for 10 minutes

export default async function Home() {
  const allArticles = await fetchAllNews()
  const articleMap = new Map(allArticles.map((a) => [a.id, a]))

  const rawClusters = await clusterArticles(allArticles)

  // For each cluster, fetch a summary in parallel
  const clustersWithSummaries = await Promise.all(
    rawClusters.map(async (cluster): Promise<StoryCluster> => {
      const articlesInCluster = cluster.articleIds
        .map((id) => articleMap.get(id))
        .filter(Boolean) as Article[]

      if (articlesInCluster.length === 0) {
        return { ...cluster, articles: [], summary: 'No articles found for this cluster.' }
      }

      const summary = await summarizeCluster(articlesInCluster)
      const imageUrls = articlesInCluster
        .map((a) => a.urlToImage)
        .filter((url): url is string => !!url)
        .slice(0, 4) // Limit to a max of 4 images

      return { ...cluster, articles: articlesInCluster, summary, imageUrls }
    })
  )

  // Find articles that were not part of any cluster
  const clusteredIds = new Set(rawClusters.flatMap((c) => c.articleIds))
  const unclusteredArticles = allArticles.filter((a) => !clusteredIds.has(a.id))

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-6xl md:text-7xl">
          AI-Curated News
        </h1>
        <p className="mt-4 text-lg text-[var(--muted-foreground)]">
          Your daily feed of news, intelligently grouped and summarized by AI.
        </p>
      </header>
      <NewsList storyClusters={clustersWithSummaries} unclusteredArticles={unclusteredArticles} />
    </main>
  )
}

export async function generateMetadata() {
  return {
    title: 'AI News Aggregator - Latest News with AI Summaries',
    description: 'Get the latest news with AI-powered summaries. Fast, accurate, and up-to-date.',
  }
}
