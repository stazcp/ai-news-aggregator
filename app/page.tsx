import { fetchAllNews } from '@/lib/newsService'
import { getStoryClusters, getUnclusteredArticles } from '@/lib/clusterService'
import NewsList from '@/components/NewsList'

export const revalidate = 600 // Cache for 10 minutes

export default async function Home() {
  const allArticles = await fetchAllNews()
  const storyClusters = await getStoryClusters(allArticles)
  const unclusteredArticles = getUnclusteredArticles(allArticles, storyClusters)

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
      <NewsList storyClusters={storyClusters} unclusteredArticles={unclusteredArticles} />
    </main>
  )
}

export async function generateMetadata() {
  return {
    title: 'AI News Aggregator - Latest News with AI Summaries',
    description: 'Get the latest news with AI-powered summaries. Fast, accurate, and up-to-date.',
  }
}
