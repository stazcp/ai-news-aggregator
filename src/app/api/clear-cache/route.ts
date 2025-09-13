import { clearCache, clearCacheByPattern, clearCacheAll } from '@/lib/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { pattern, all, token } = await request.json().catch(() => ({}))

    // Protect Redis operations with auth/environment checks
    if (all) {
      // Check if Redis is even configured
      if (!process.env.UPSTASH_REDIS_REST_URL) {
        // No Redis configured - just clear memory
        const result = await clearCacheAll()
        return NextResponse.json({
          success: true,
          message: `Cleared cache: ${result.memory} memory entries (Redis not configured)`,
          result,
        })
      }

      // Redis is configured - require token for ALL environments
      const envToken = process.env.CACHE_CLEAR_TOKEN

      // Ensure environment token is set and not empty
      if (!envToken || envToken.trim() === '') {
        return NextResponse.json(
          {
            success: false,
            error:
              'CACHE_CLEAR_TOKEN environment variable is not configured. Redis clearing is disabled for security.',
            hint: 'Set a strong CACHE_CLEAR_TOKEN in your environment variables',
          },
          { status: 403 }
        )
      }

      // Ensure request token is provided and not empty
      if (!token || typeof token !== 'string' || token.trim() === '') {
        return NextResponse.json(
          {
            success: false,
            error: 'Token is required for Redis cache clearing.',
            hint: 'Pass {"all": true, "token": "your-secret-token"}',
          },
          { status: 403 }
        )
      }

      // Perform secure token comparison
      if (token !== envToken) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid token provided.',
          },
          { status: 403 }
        )
      }

      // Clear all cache including Redis with environment prefix
      const result = await clearCacheAll()
      return NextResponse.json({
        success: true,
        message: `Cleared cache: ${result.memory} memory entries, ${result.redis} Redis keys`,
        result,
        tokenInfo: {
          valid: true,
          permissions: ['cache:clear'],
          type: 'environment',
        },
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
      'all (memory + redis)': '{"all": true, "token": "your-secret-token"}',
    },
    note: 'Redis operations always require CACHE_CLEAR_TOKEN to protect shared cache',
  })
}
