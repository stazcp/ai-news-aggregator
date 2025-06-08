import { NextResponse } from 'next/server'
import { getCachedData, setCachedData } from '@/lib/cache'
import { summarizeArticle } from '@/lib/groq'

export async function POST(request: Request) {
  try {
    const { articleId, content } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const cacheKey = `Summary-${articleId}`

    // Check cache first
    let summary = await getCachedData(cacheKey)

    if (!summary) {
      summary = await summarizeArticle(content)
      await setCachedData(cacheKey, summary, 3600) // 1 hour cache
    }

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('Summarization error:', error)
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }
}
