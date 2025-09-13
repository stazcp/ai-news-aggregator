// Shared cache adapter: prefers Upstash Redis (@upstash/redis) if configured,
// otherwise uses in-memory Map. This preserves the same API across the app.
import { Redis } from '@upstash/redis'

// Allow forcing Redis off via env for local testing
const DISABLE_REDIS = /^(1|true|yes)$/i.test(process.env.CACHE_DISABLE_REDIS || '')

let redis: Redis | null = null
try {
  if (!DISABLE_REDIS) {
    // Will throw if required envs are missing (UPSTASH_REDIS_REST_URL/TOKEN)
    redis = Redis.fromEnv()
  }
} catch {
  redis = null
}

const memoryCache = new Map<string, { data: any; expires: number }>()

export async function getCachedData(key: string): Promise<any> {
  // Redis first (cross-instance)
  if (redis) {
    try {
      const value = await redis.get(key)
      if (value !== null && value !== undefined) return value
    } catch {}
  }
  // Memory cache fallback (per instance)
  const cached = memoryCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.data
  return null
}

export async function setCachedData(key: string, data: any, ttlSeconds: number): Promise<void> {
  if (redis) {
    try {
      await redis.set(key, data, { ex: ttlSeconds })
      return
    } catch {}
  }
  // Memory cache fallback
  memoryCache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 })
}

/**
 * Clears all cached data - useful for debugging rate limit issues
 */
export function clearCache(): void {
  memoryCache.clear()
  console.log('🗑️ In-memory cache cleared')
  if (redis) console.warn('ℹ️ Redis cache not cleared here; clear via provider dashboard or script')
}

/**
 * Clears specific cache keys by pattern - useful for targeted cache clearing
 */
export function clearCacheByPattern(pattern: string): number {
  let clearedCount = 0
  for (const [key] of memoryCache.entries()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key)
      clearedCount++
    }
  }
  console.log(`🗑️ Cleared ${clearedCount} in-memory cache entries matching pattern: ${pattern}`)
  if (redis) console.warn('ℹ️ Redis pattern clear not supported here; consider prefixing keys and deleting by prefix via a script')
  return clearedCount
}
