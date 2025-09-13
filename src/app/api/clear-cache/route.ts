import { clearCache, clearCacheByPattern, clearCacheAll } from '@/lib/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { pattern, all } = await request.json().catch(() => ({}))

    if (all) {
      // Clear all cache including Redis with environment prefix
      const result = await clearCacheAll()
      return NextResponse.json({
        success: true,
        message: `Cleared cache: ${result.memory} memory entries, ${result.redis} Redis keys`,
        result,
      })
    } else if (pattern) {
      const clearedCount = clearCacheByPattern(pattern)
      return NextResponse.json({
        success: true,
        message: `Cleared ${clearedCount} cache entries matching pattern: ${pattern}`,
      })
    } else {
      // Just clear memory cache (backward compatibility)
      clearCache()
      return NextResponse.json({
        success: true,
        message: 'Memory cache cleared successfully',
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
    message: 'Use POST to clear cache.',
    options: {
      'memory only': '{}',
      'pattern match': '{"pattern": "clusters"}',
      'all (memory + redis)': '{"all": true}',
    },
  })
}
