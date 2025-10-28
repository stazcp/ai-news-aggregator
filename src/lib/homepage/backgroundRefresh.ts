import { getCachedData, setCachedData } from '../cache'
import { getCacheTtl } from '../utils'
import {
  generateFreshHomepage,
  generateTopStorySummaries,
  enrichClustersWithSummaries,
} from './homepageGenerator'

interface RefreshProgress {
  stage: string
  progress: number
  timestamp: number
  startTime?: number
  error?: string
}

export async function refreshCacheInBackground(): Promise<void> {
  // Skip background refresh in local development unless explicitly enabled
  const ALLOW_LOCAL = /^(1|true|yes)$/i.test(process.env.ALLOW_LOCAL_BACKGROUND_REFRESH || '')
  if (process.env.NODE_ENV === 'development' && !ALLOW_LOCAL) {
    console.log(
      '⏭️ Skipping background refresh in development (set ALLOW_LOCAL_BACKGROUND_REFRESH=1 to enable)'
    )
    return
  }

  const isAlreadyRefreshing = await getCachedData('refresh-in-progress')
  if (isAlreadyRefreshing) {
    console.log('🔄 Refresh already in progress, skipping')
    return
  }

  try {
    // Mark refresh as in progress with reasonable timeout
    await setCachedData(
      'refresh-in-progress',
      {
        startTime: Date.now(),
        stage: 'Starting refresh...',
        progress: 0,
        timestamp: Date.now(),
      },
      600 // 10 minutes timeout (10x normal refresh time for safety)
    )

    console.log('🔄 Background refresh starting...')

    // Stage 1: Generate fresh homepage data (articles, clusters, topics)
    await updateRefreshStatus('Fetching latest news and generating clusters...', 10)
    const homepageData = await generateFreshHomepage()
    console.log(`✅ Generated homepage with ${homepageData.storyClusters.length} clusters`)

    // Stage 2: Generate AI summaries for top stories
    await updateRefreshStatus('Generating AI summaries...', 50)

    // Get articles from cache (they were just fetched by generateFreshHomepage)
    const articles = await getCachedData('all-news')
    if (articles && articles.length > 0) {
      await generateTopStorySummaries(
        homepageData.storyClusters,
        articles,
        async (completed, total) => {
          const progress = 50 + Math.floor((completed / total) * 40) // 50-90%
          await updateRefreshStatus('Generating AI summaries...', progress)
        }
      )
    }

    // Stage 3: Update homepage data with enriched summaries
    await updateRefreshStatus('Finalizing updates...', 95)
    const enrichedClusters = await enrichClustersWithSummaries(homepageData.storyClusters)

    const finalHomepageResult = {
      ...homepageData,
      storyClusters: enrichedClusters,
    }

    // Update the cached homepage result with enriched data
    const cacheTtl = getCacheTtl()
    await setCachedData('homepage-result', finalHomepageResult, cacheTtl)
    await setCachedData('last-cache-update', new Date().toISOString(), cacheTtl)

    // Mark refresh as complete with short TTL (3 minutes for client to see completion)
    await setCachedData(
      'refresh-in-progress',
      {
        stage: 'Fresh stories ready!',
        progress: 100,
        timestamp: Date.now(),
        startTime: Date.now(), // Set completion time
      },
      180 // 3 minutes TTL - enough time for clients to see completion, then auto-clears
    )

    console.log('✅ Background refresh complete - status will auto-clear in 3 minutes')
  } catch (error) {
    console.error('❌ Background refresh failed:', error)
    await setCachedData(
      'refresh-in-progress',
      {
        stage: 'Error occurred',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: 0,
        timestamp: Date.now(),
      },
      180 // 3 minutes before retry (reduced from 5 minutes)
    )
  }
}

async function updateRefreshStatus(stage: string, progress: number): Promise<void> {
  try {
    // Get existing status to preserve startTime
    const existingStatus = await getCachedData('refresh-in-progress')

    await setCachedData(
      'refresh-in-progress',
      {
        stage,
        progress,
        timestamp: Date.now(),
        // Preserve original startTime for accurate age calculations
        startTime: existingStatus?.startTime || Date.now(),
      },
      600 // 10 minutes timeout (consistent with initial timeout)
    )
  } catch (error) {
    console.error('Failed to update refresh status:', error)
  }
}

export async function getRefreshStatus(): Promise<RefreshProgress | null> {
  try {
    const refreshInProgress = await getCachedData('refresh-in-progress')
    const lastUpdate = await getCachedData('last-cache-update')

    if (refreshInProgress && refreshInProgress.stage) {
      return {
        stage: refreshInProgress.stage,
        progress: refreshInProgress.progress || 0,
        timestamp: refreshInProgress.timestamp || Date.now(),
        startTime: refreshInProgress.startTime,
        error: refreshInProgress.error,
      }
    }

    // Return idle status with last update info
    return {
      stage: 'idle',
      progress: 100,
      timestamp: Date.now(),
      startTime: lastUpdate ? new Date(lastUpdate).getTime() : undefined,
    }
  } catch (error) {
    console.error('Failed to get refresh status:', error)
    return {
      stage: 'error',
      progress: 0,
      timestamp: Date.now(),
      error: 'Failed to get status',
    }
  }
}
