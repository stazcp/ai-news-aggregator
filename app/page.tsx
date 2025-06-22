import { fetchAllNews } from '@/lib/newsService'
import NewsList from '@/components/NewsList'
import { Article } from '@/types'

export const revalidate = 300 // Revalidate every 5 minutes

export default async function Home() {
  const articles = await fetchAllNews()
  const featuredArticles = articles.slice(0, 20)

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-6xl md:text-7xl">
          AI-Curated News
        </h1>
        <p className="mt-4 text-lg text-[var(--muted-foreground)]">
          Your daily feed of news, summarized by AI.
        </p>
      </header>
      <NewsList articles={featuredArticles} />
    </main>
  )
}

export async function generateMetadata() {
  return {
    title: 'AI News Aggregator - Latest News with AI Summaries',
    description: 'Get the latest news with AI-powered summaries. Fast, accurate, and up-to-date.',
  }
}
