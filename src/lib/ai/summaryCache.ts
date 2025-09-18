import { StoryCluster } from '@/types'

export type SummaryPurpose = 'article' | 'cluster' | 'category'

/**
 * Create a consistent cache key for AI summaries regardless of the caller.
 */
export function getSummaryCacheKey(purpose: SummaryPurpose, id: string): string {
  const sanitizedId = (id || '').trim() || 'unknown'
  return `Summary-${purpose}-${sanitizedId}`
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
