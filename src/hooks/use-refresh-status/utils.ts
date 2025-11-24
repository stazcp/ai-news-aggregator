const clampInterval = (ms: number) => Math.max(1000, Math.round(ms))

export const applyJitter = (intervalMs: number, variance = 0.1): number => {
  const delta = intervalMs * variance
  const jittered = intervalMs + (Math.random() * 2 - 1) * delta
  return clampInterval(jittered)
}

export const getBackoffInterval = (
  attempt: number,
  { baseMs, maxMs, variance = 0.1 }: { baseMs: number; maxMs: number; variance?: number }
): number => {
  const pow = Math.pow(2, Math.max(0, attempt - 1))
  const interval = Math.min(baseMs * pow, maxMs)
  return applyJitter(interval || baseMs, variance)
}

export const getIdleInterval = (
  cacheAgeMinutes: number,
  { enabled }: { enabled: boolean }
): number => {
  // Enabled = user waiting for data (needs faster updates)
  if (enabled) {
    if (cacheAgeMinutes < 60) return applyJitter(15 * 60 * 1000)
    if (cacheAgeMinutes < 300) return applyJitter(15 * 60 * 1000)
    if (cacheAgeMinutes < 330) return applyJitter(2 * 60 * 1000)
    if (cacheAgeMinutes < 360) return applyJitter(60 * 1000)
    return applyJitter(30 * 1000)
  }

  // Disabled = user already has data (background detection)
  if (cacheAgeMinutes < 60) return applyJitter(30 * 60 * 1000)
  if (cacheAgeMinutes < 300) return applyJitter(30 * 60 * 1000)
  if (cacheAgeMinutes < 330) return applyJitter(5 * 60 * 1000)
  if (cacheAgeMinutes < 360) return applyJitter(2 * 60 * 1000)
  return applyJitter(60 * 1000)
}
