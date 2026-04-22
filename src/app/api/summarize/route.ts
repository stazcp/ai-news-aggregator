import { NextResponse } from 'next/server'
import { getCachedData, setCachedData } from '@/lib/cache'
import { summarizeArticle, summarizeCategoryDigest, summarizeCluster } from '@/lib/ai/groq'
import { getSummaryCacheKey, shouldPersistSummaryToCache } from '@/lib/ai/summaryCache'
import { getCacheTtl } from '@/lib/utils'
import { isProjectPaused } from '@/lib/config/projectState'

export async function POST(request: Request) {
  if (isProjectPaused()) {
    return NextResponse.json(
      { error: 'Project paused. AI summarization has been disabled.' },
      { status: 410 }
    )
  }

  try {
    const { articleId, content, isCluster, clusterTitle, purpose, length } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const summaryPurpose: 'article' | 'cluster' | 'category' = isCluster
      ? 'cluster'
      : purpose === 'category'
        ? 'category'
        : 'article'

    const cacheKey = getSummaryCacheKey(
      summaryPurpose,
      length === 'short' && summaryPurpose === 'cluster' ? `${articleId}:short` : articleId
    )
    const summaryType = summaryPurpose

    console.log(`🤖 [AI Summary Request] Type: ${summaryType}, ID: ${articleId}`)
    if (isCluster) {
      console.log(`📊 [Cluster Summary] Title: ${clusterTitle}`)
    }

    let summary = await getCachedData(cacheKey)

    if (!summary) {
      console.log(`⚡ [AI Generation] Generating new ${summaryType} summary for: ${articleId}`)

      if (summaryPurpose === 'cluster' && clusterTitle) {
        summary = await summarizeCluster(content, length === 'short' ? 'short' : 'long')
      } else if (summaryPurpose === 'category') {
        summary = await summarizeCategoryDigest(content)
      } else {
        summary = await summarizeArticle(content)
      }

      if (shouldPersistSummaryToCache(summary)) {
        const cacheTime = getCacheTtl()
        await setCachedData(cacheKey, summary, cacheTime)
        console.log(`✅ [AI Generated] ${summaryType} summary cached for: ${articleId}`)
      } else {
        console.warn(`⚠️ [AI Generated] Skipping cache for non-cacheable ${summaryType} summary`)
      }
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
