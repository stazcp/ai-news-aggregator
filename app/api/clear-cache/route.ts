import { clearCache, clearCacheByPattern } from '@/lib/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { pattern } = await request.json().catch(() => ({}))

    if (pattern) {
      const clearedCount = clearCacheByPattern(pattern)
      return NextResponse.json({
        success: true,
        message: `Cleared ${clearedCount} cache entries matching pattern: ${pattern}`,
      })
    } else {
      clearCache()
      return NextResponse.json({
        success: true,
        message: 'All cache cleared successfully',
      })
    }
  } catch (error) {
    console.error('Error clearing cache:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clear cache',
      },
      { status: 500 }
    )
  }
}

// For development only - add some protection
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  return NextResponse.json({
    message: 'Use POST to clear cache. Send {"pattern": "clusters"} to clear specific keys.',
  })
}
