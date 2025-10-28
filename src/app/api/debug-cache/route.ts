import { NextResponse } from 'next/server'
import { getCachedData } from '@/lib/cache'

export async function GET() {
  const startTime = Date.now()

  try {
    // Check cache prefix
    let cachePrefix = 'unknown'
    try {
      // Try to determine the cache prefix
      if (process.env.CACHE_PREFIX) {
        cachePrefix = process.env.CACHE_PREFIX
      } else {
        const nodeEnv = process.env.NODE_ENV
        const vercelEnv = process.env.VERCEL_ENV
        if (nodeEnv === 'production' && vercelEnv === 'production') {
          cachePrefix = 'prod:'
        } else if (vercelEnv === 'preview') {
          cachePrefix = `staging-${process.env.VERCEL_GIT_COMMIT_REF || 'preview'}:`
        } else if (nodeEnv === 'development') {
          cachePrefix = 'dev:'
        } else {
          cachePrefix = 'local:'
        }
      }
    } catch {}

    // Check if homepage cache exists
    const cachedHomepage = await getCachedData('homepage-result')
    const refreshInProgress = await getCachedData('refresh-in-progress')

    const response = {
      timestamp: new Date().toISOString(),
      environment: {
        NODE_ENV: process.env.NODE_ENV || 'not set',
        VERCEL_ENV: process.env.VERCEL_ENV || 'not set',
        CACHE_PREFIX: process.env.CACHE_PREFIX || 'not set (auto-detected)',
      },
      detectedCachePrefix: cachePrefix,
      cache: {
        homepageExists: !!cachedHomepage,
        homepageAge: cachedHomepage?.lastUpdated
          ? `${Math.floor((Date.now() - new Date(cachedHomepage.lastUpdated).getTime()) / 1000 / 60)} minutes`
          : 'N/A',
        articleCount: cachedHomepage?.storyClusters?.length || 0,
        refreshInProgress: !!refreshInProgress,
      },
      performance: {
        checkLatency: `${Date.now() - startTime}ms`,
      },
      status: cachedHomepage ? '✅ Cache OK' : '⚠️ No cache found',
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
