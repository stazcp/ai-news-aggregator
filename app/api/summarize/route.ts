import { NextResponse } from 'next/server'
import { getCachedData, setCachedData } from '@/lib/cache'
import { summarizeArticle } from '@/lib/groq'

export async function POST(request: Request) {
  try {
    const { articleId, content, isCluster, clusterTitle } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const cacheKey = `Summary-${articleId}`
    const summaryType = isCluster ? 'cluster' : 'article'

    // Log AI resource usage for optimization tracking
    console.log(`🤖 [AI Summary Request] Type: ${summaryType}, ID: ${articleId}`)
    if (isCluster) {
      console.log(`📊 [Cluster Summary] Title: ${clusterTitle}`)
    }

    // Check cache first
    let summary = await getCachedData(cacheKey)

    if (!summary) {
      console.log(`⚡ [AI Generation] Generating new ${summaryType} summary for: ${articleId}`)

      if (isCluster && clusterTitle) {
        // For clusters, create a more comprehensive summary
        const clusterPrompt = `Please create a comprehensive summary of this news story based on multiple sources:\n\nStory: ${clusterTitle}\n\nSource Content:\n${content}`
        summary = await summarizeArticle(clusterPrompt)
      } else {
        // Regular article summary
        summary = await summarizeArticle(content)
      }

      // Cache for longer time for clusters since they're more expensive to generate
      const cacheTime = isCluster ? 7200 : 3600 // 2 hours for clusters, 1 hour for articles
      await setCachedData(cacheKey, summary, cacheTime)

      console.log(`✅ [AI Generated] ${summaryType} summary cached for: ${articleId}`)
    } else {
      console.log(`🔄 [Cache Hit] Using cached ${summaryType} summary for: ${articleId}`)
    }

    return NextResponse.json({ summary })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ [AI Error] Summarization failed:`, errorMessage)
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }
}
