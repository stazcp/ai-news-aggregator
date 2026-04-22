import { NextResponse } from 'next/server'
import { fetchAllNews } from '@/lib/news/newsService'
import { getCachedData, setCachedData } from '@/lib/cache'
import { Article } from '@/types'
import { isProjectPaused } from '@/lib/config/projectState'

export async function GET(request: Request) {
  if (isProjectPaused()) {
    return NextResponse.json(
      { error: 'Project paused. News ingestion has been disabled.' },
      { status: 410 }
    )
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const cacheKey = `news=${category || 'all'}-${page}-${limit}`

  let articles: Article[] = await getCachedData(cacheKey)
  if (!articles) {
    articles = await fetchAllNews()
    await setCachedData(cacheKey, articles, 300)
  }

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
