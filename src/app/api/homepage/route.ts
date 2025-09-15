import { NextResponse } from 'next/server'
import { getCachedData } from '@/lib/cache'
import { refreshCacheInBackground } from '@/lib/backgroundRefresh'
import { generateFreshHomepage, HomepageData as BaseHomepageData } from '@/lib/homepageGenerator'

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

    // No cache - generate fresh data (cold start)
    console.log('🐌 Cold start - generating fresh homepage data')
    const homepageData = await generateFreshHomepage()

    return NextResponse.json({
      ...homepageData,
      fromCache: false,
    })
  } catch (error) {
    console.error('❌ Homepage API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load homepage data' },
      { status: 500 }
    )
  }
}
