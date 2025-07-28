const memoryCache = new Map<string, { data: any; expires: number }>()

export async function getCachedData(key: string): Promise<any> {
  // Memory cache fallback
  const cached = memoryCache.get(key)
  if (cached && cached.expires > Date.now()) {
    return cached.data
  }

  return null
}

export async function setCachedData(key: string, data: any, ttlSeconds: number): Promise<void> {
  // Memory cache fallback
  memoryCache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 })
}

/**
 * Clears all cached data - useful for debugging rate limit issues
 */
export function clearCache(): void {
  memoryCache.clear()
  console.log('🗑️ All cache cleared')
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
  console.log(`🗑️ Cleared ${clearedCount} cache entries matching pattern: ${pattern}`)
  return clearedCount
}
