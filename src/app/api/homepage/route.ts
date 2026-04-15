import { NextResponse } from 'next/server'
import { getCachedData } from '@/lib/cache'
import { refreshCacheInBackground } from '@/lib/homepage/backgroundRefresh'
import { HomepageData as BaseHomepageData } from '@/lib/homepage/homepageGenerator'
import { ENV_DEFAULTS, envString } from '@/lib/config/env'

interface HomepageData extends BaseHomepageData {
  fromCache: boolean
  cacheAge?: number
}

type HomepageRefreshMode = 'cron-only' | 'request-refresh' | 'request-generate'

function getHomepageRefreshMode(): HomepageRefreshMode {
  const configured = envString('HOMEPAGE_REFRESH_MODE', ENV_DEFAULTS.homepageRefreshMode).trim()
  if (
    configured === 'cron-only' ||
    configured === 'request-refresh' ||
    configured === 'request-generate'
  ) {
    return configured
  }
  return 'cron-only'
}

export async function GET(): Promise<NextResponse<HomepageData | { error: string }>> {
  try {
    console.log('🏠 Homepage API called')
    const refreshMode = getHomepageRefreshMode()

    // Try cached homepage result first (instant response)
    const cachedHomepage = await getCachedData('homepage-result')

    if (cachedHomepage) {
      console.log('⚡ Serving cached homepage data')

      // Calculate cache age
      const lastUpdate = cachedHomepage.lastUpdated
      const cacheAge = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : Infinity
      const cacheAgeMinutes = Math.floor(cacheAge / (1000 * 60))
      const sixHoursInMs = 6 * 60 * 60 * 1000

      // Optional escape hatch for environments that still want request-driven refreshes.
      if (
        (refreshMode === 'request-refresh' || refreshMode === 'request-generate') &&
        cacheAge > sixHoursInMs
      ) {
        console.log(`🔄 Triggering background refresh (cache is ${cacheAgeMinutes} minutes old)`)
        // Don't await - let this run in background
        refreshCacheInBackground().catch((error) => {
          console.error('Background refresh failed:', error)
        })
      }

      return NextResponse.json({
        ...cachedHomepage,
        fromCache: true,
        cacheAge: cacheAgeMinutes,
      })
    }

    // No cache - with cron-owned refreshes this means the cache has not been warmed yet
    console.warn('⚠️ Cache miss detected!')

    // Check if a refresh is already in progress
    const refreshInProgress = await getCachedData('refresh-in-progress')

    if (refreshInProgress) {
      // Refresh already in progress - return 503 and let client retry
      console.log('⏳ Refresh already in progress, returning 503')
      return NextResponse.json(
        {
          error: 'Data is being refreshed. Please try again in a moment.',
          refreshing: true,
          fromCache: false,
        },
        { status: 503, headers: { 'Retry-After': '10' } }
      )
    }

    if (refreshMode !== 'request-generate') {
      return NextResponse.json(
        {
          error:
            `Homepage cache is not ready yet. Current homepage refresh mode is "${refreshMode}".`,
        },
        { status: 503, headers: { 'Retry-After': '60' } }
      )
    }

    // Escape hatch for environments that still want a blocking first-generation path.
    console.warn(
      '🚨 No cache and no refresh in progress - generating initial data (this may take 30-60s)'
    )
    console.warn('📋 This should only happen when HOMEPAGE_REFRESH_MODE=request-generate.')

    try {
      const { generateFreshHomepage } = await import('@/lib/homepage/homepageGenerator')
      const homepageData = await generateFreshHomepage()

      return NextResponse.json({
        ...homepageData,
        fromCache: false,
      })
    } catch (genError) {
      console.error('❌ Failed to generate initial data:', genError)
      // Trigger background refresh for next time
      refreshCacheInBackground().catch(console.error)
      throw genError
    }
  } catch (error) {
    console.error('❌ Homepage API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load homepage data' },
      { status: 500 }
    )
  }
}
