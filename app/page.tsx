import { fetchAllNews } from '@/lib/newsService'
import NewsList from '@/components/NewsList'
import { Article } from '@/types'

export const revalidate = 300 // Revalidate every 5 minutes

export default async function Home() {
  const articles = await fetchAllNews()
  const featuredArticles = articles.slice(0, 20)

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Latest News</h1>
      <NewsList articles={featuredArticles} />
    </div>
  )
}
