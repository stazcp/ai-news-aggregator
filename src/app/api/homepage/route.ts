import { NextResponse } from 'next/server'
import { getCachedData } from '@/lib/cache'
import { refreshCacheInBackground } from '@/lib/homepage/backgroundRefresh'
import { HomepageData as BaseHomepageData } from '@/lib/homepage/homepageGenerator'

interface HomepageData extends BaseHomepageData {
  fromCache: boolean
  cacheAge?: number
}

export async function GET(): Promise<NextResponse<HomepageData | { error: string }>> {
  try {
    console.log('🏠 Homepage API called')

    // Try cached homepage result first (instant response)
    const cachedHomepage = await getCachedData('homepage-result')

    if (cachedHomepage) {
      console.log('⚡ Serving cached homepage data')

      // Calculate cache age
      const lastUpdate = cachedHomepage.lastUpdated
      const cacheAge = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : Infinity
      const cacheAgeMinutes = Math.floor(cacheAge / (1000 * 60))
      const sixHoursInMs = 6 * 60 * 60 * 1000

      // Check if we should trigger background refresh
      if (cacheAge > sixHoursInMs) {
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

    // No cache - this should be rare with fixed CACHE_PREFIX
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

    // No refresh in progress and no cache - this is the first request
    // Allow blocking generation for initial seed (emergency fallback)
    console.warn(
      '🚨 No cache and no refresh in progress - generating initial data (this may take 30-60s)'
    )
    console.warn('📋 This should only happen once. If frequent, check CACHE_PREFIX configuration.')

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
