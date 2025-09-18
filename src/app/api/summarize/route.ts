import { NextResponse } from 'next/server'
import { getCachedData, setCachedData } from '@/lib/cache'
import { summarizeArticle, summarizeCategoryDigest, summarizeCluster } from '@/lib/groq'
import { getSummaryCacheKey } from '@/lib/summaryCache'

export async function POST(request: Request) {
  try {
    const { articleId, content, isCluster, clusterTitle, purpose } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const summaryPurpose: 'article' | 'cluster' | 'category' = isCluster
      ? 'cluster'
      : purpose === 'category'
        ? 'category'
        : 'article'

    const cacheKey = getSummaryCacheKey(summaryPurpose, articleId)
    const summaryType = summaryPurpose

    // Log AI resource usage for optimization tracking
    console.log(`🤖 [AI Summary Request] Type: ${summaryType}, ID: ${articleId}`)
    if (isCluster) {
      console.log(`📊 [Cluster Summary] Title: ${clusterTitle}`)
    }

    // Check cache first
    let summary = await getCachedData(cacheKey)

    if (!summary) {
      console.log(`⚡ [AI Generation] Generating new ${summaryType} summary for: ${articleId}`)

      if (summaryPurpose === 'cluster' && clusterTitle) {
        summary = await summarizeCluster(content)
      } else if (summaryPurpose === 'category') {
        summary = await summarizeCategoryDigest(content)
      } else {
        // Regular article summary
        summary = await summarizeArticle(content)
      }

      // Cache for longer time for clusters since they're more expensive to generate
      const cacheTime =
        summaryPurpose === 'cluster' ? 7200 : summaryPurpose === 'category' ? 5400 : 3600
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
