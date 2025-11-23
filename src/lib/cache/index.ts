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
} catch (error) {
  redis = null
  console.warn(
    '⚠️ Redis initialization failed. Falling back to in-memory cache only.',
    (error as Error)?.message ?? error
  )
}

const memoryCache = new Map<string, { data: any; expires: number }>()

// Get cache prefix from environment - auto-detect if not set
const getCachePrefix = () => {
  // Allow manual override
  if (process.env.CACHE_PREFIX) {
    return process.env.CACHE_PREFIX
  }

  // Auto-detect based on environment
  const nodeEnv = process.env.NODE_ENV
  const vercelEnv = process.env.VERCEL_ENV // Vercel's environment indicator

  // Debug logging (only in development)
  if (nodeEnv === 'development') {
    console.log(`🔧 Cache prefix detection: NODE_ENV=${nodeEnv}, VERCEL_ENV=${vercelEnv}`)
  }

  // Production
  if (nodeEnv === 'production' && vercelEnv === 'production') {
    return 'prod:'
  }

  // Preview/Staging (Vercel preview deployments)
  if (vercelEnv === 'preview') {
    const branchName =
      process.env.VERCEL_GIT_COMMIT_REF?.replace(/[^a-zA-Z0-9-]/g, '-') || 'preview'
    return `staging-${branchName}:`
  }

  // Development (local development with `npm run dev`)
  if (nodeEnv === 'development') {
    return 'dev:'
  }

  // Fallback for any other case
  return 'local:'
}

// Helper to add prefix to keys
const prefixKey = (key: string) => `${getCachePrefix()}${key}`

export async function getCachedData(key: string): Promise<any> {
  const prefixedKey = prefixKey(key)

  // Redis first (cross-instance)
  if (redis) {
    try {
      const value = await redis.get(prefixedKey)
      if (value !== null && value !== undefined) return value
    } catch {}
  }
  // Memory cache fallback (per instance)
  const cached = memoryCache.get(prefixedKey)
  if (cached && cached.expires > Date.now()) return cached.data
  return null
}

export async function setCachedData(key: string, data: any, ttlSeconds: number): Promise<void> {
  const prefixedKey = prefixKey(key)

  if (redis) {
    try {
      await redis.set(prefixedKey, data, { ex: ttlSeconds })
      return
    } catch {}
  }
  // Memory cache fallback
  memoryCache.set(prefixedKey, { data, expires: Date.now() + ttlSeconds * 1000 })
}

/**
 * Clears all cached data - useful for debugging rate limit issues
 */
/**
 * Clear only the in-memory cache (does NOT clear Redis).
 * Prefer clearCacheAll() if you need a cross-instance purge.
 */
export function clearCache(): void {
  memoryCache.clear()
  console.log('🗑️ In-memory cache cleared')
  if (redis)
    console.warn(
      'ℹ️ Redis cache not cleared here; use clearCacheAll() with a prefix or clear via provider dashboard'
    )
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
  if (redis)
    console.warn(
      'ℹ️ Redis pattern clear not supported here; consider prefixing keys and deleting by prefix via a script'
    )
  return clearedCount
}

/**
 * Best-effort cross-instance purge for Redis using a key prefix.
 * Returns number of Redis keys deleted. Requires Redis to be configured.
 *
 * IMPORTANT: You should namespace all cache keys (e.g., with ENV prefix)
 * so you can safely pass that prefix here without risking unrelated data.
 */
export async function clearCacheAll(prefix?: string): Promise<{ memory: number; redis: number }> {
  // Use current environment prefix if none provided
  const cachePrefix = prefix || getCachePrefix()

  // Always clear local memory first
  const memory = clearCacheByPattern(cachePrefix)

  let deleted = 0
  if (!redis) {
    console.warn('ℹ️ Redis not configured; only in-memory cache was cleared')
    return { memory, redis: deleted }
  }
  if (!cachePrefix) {
    console.warn(
      '⚠️ Refusing to clear Redis without a prefix. Pass a safe namespace like "dev:" or "prod:"'
    )
    return { memory, redis: deleted }
  }
  try {
    // Iterate SCAN with MATCH prefix*
    let cursor: number | string = 0
    const match = `${cachePrefix}*`
    do {
      const [next, keys] = (await (redis as any).scan(cursor, { match, count: 100 })) as [
        number | string,
        string[],
      ]
      cursor = next
      if (keys && keys.length) {
        // Upstash DEL supports variadic arguments
        await (redis as any).del(...keys)
        deleted += keys.length
      }
    } while (String(cursor) !== '0')
    console.log(`🗑️ Cleared ${deleted} Redis keys with prefix: ${cachePrefix}`)
  } catch (e) {
    console.error('❌ Failed to clear Redis keys by prefix:', e)
  }
  return { memory, redis: deleted }
}
