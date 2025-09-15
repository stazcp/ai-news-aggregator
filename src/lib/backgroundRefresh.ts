import { getCachedData, setCachedData } from './cache'
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
  const isAlreadyRefreshing = await getCachedData('refresh-in-progress')
  if (isAlreadyRefreshing) {
    console.log('🔄 Refresh already in progress, skipping')
    return
  }

  try {
    // Mark refresh as in progress
    await setCachedData(
      'refresh-in-progress',
      {
        startTime: Date.now(),
        stage: 'Starting refresh...',
        progress: 0,
        timestamp: Date.now(),
      },
      3600
    ) // 1 hour timeout

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
    await setCachedData('homepage-result', finalHomepageResult, 86400) // 24 hours
    await setCachedData('last-cache-update', new Date().toISOString(), 86400)

    // Mark refresh as complete
    await updateRefreshStatus('Fresh stories ready!', 100)
    console.log('✅ Background refresh complete')

    // Clean up progress indicator after 3 seconds
    setTimeout(async () => {
      try {
        await setCachedData('refresh-in-progress', null, 1) // Expire immediately
      } catch (error) {
        console.error('Failed to clear refresh progress:', error)
      }
    }, 3000)
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
      300
    ) // 5 minutes before retry
  }
}

async function updateRefreshStatus(stage: string, progress: number): Promise<void> {
  try {
    await setCachedData(
      'refresh-in-progress',
      {
        stage,
        progress,
        timestamp: Date.now(),
      },
      3600
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
