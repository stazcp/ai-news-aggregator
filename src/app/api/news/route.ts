import { NextResponse } from 'next/server'
import { fetchAllNews } from '@/lib/newsService'
import { getCachedData, setCachedData } from '@/lib/cache'
import { Article } from '@/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const cacheKey = `news=${category || 'all'}-${page}-${limit}`

  // Try cache first
  let articles: Article[] = await getCachedData(cacheKey)
  if (!articles) {
    articles = await fetchAllNews()
    await setCachedData(cacheKey, articles, 60 * 60 * 24) // 24h cache
  }

  // Filter and paginate
  const filtered = category ? articles.filter((article) => article.category === category) : articles

  const startIndex = (page - 1) * limit
  const paginatedArticles = filtered.slice(startIndex, startIndex + limit)

  return NextResponse.json({
    articles: paginatedArticles,
    totalResults: filtered.length,
    page,
    totalPages: Math.ceil(filtered.length / limit),
  })
}
