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
