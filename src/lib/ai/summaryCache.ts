import { StoryCluster } from '@/types'

export type SummaryPurpose = 'article' | 'cluster' | 'category'

const NON_CACHEABLE_SUMMARY_VALUES = new Set([
  'summary not available',
  'summary could not be generated.',
  'an error occurred while generating the cluster summary.',
])

/**
 * Create a consistent cache key for AI summaries regardless of the caller.
 */
export function getSummaryCacheKey(purpose: SummaryPurpose, id: string): string {
  const sanitizedId = (id || '').trim() || 'unknown'
  // Bump cluster cache namespace to avoid collisions with pre-change keys
  // and to separate short vs. long variants clearly in production caches.
  const versionTag = purpose === 'cluster' ? 'v2' : 'v1'
  return `Summary-${versionTag}-${purpose}-${sanitizedId}`
}

/**
 * Create a deterministic ID for cluster summaries so cache hits line up
 * between server warmup and client requests.
 */
export function getClusterSummaryId(cluster: StoryCluster): string {
  const ids = cluster.articleIds && cluster.articleIds.length > 0
    ? [...cluster.articleIds]
    : (cluster.articles || []).map((a) => a.id)
  const key = ids.filter(Boolean).sort().join('-')
  return key ? `cluster-${key}` : `cluster-${(cluster.clusterTitle || 'unknown').trim()}`
}

export function shouldPersistSummaryToCache(summary: string | null | undefined): summary is string {
  if (typeof summary !== 'string') return false
  const normalized = summary.trim().toLowerCase()
  if (!normalized) return false
  return !NON_CACHEABLE_SUMMARY_VALUES.has(normalized)
}
