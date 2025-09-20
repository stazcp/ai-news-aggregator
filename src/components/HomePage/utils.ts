import { HomepageData } from '@/hooks/useHomepageData'
import { filterByTopic } from '@/lib/utils'

export const computeTopics = (data: HomepageData | undefined) => {
  if (!data || !data.topics || !data.storyClusters || !data.unclusteredArticles) {
    return []
  }

  const { storyClusters, unclusteredArticles, topics } = data
  const scored: Array<{ topic: string; score: number }> = []

  const ACTIVITY_W = Number(process.env.NEXT_PUBLIC_TOPIC_ACTIVITY_WEIGHT ?? '1')
  const RECENCY_W = Number(process.env.NEXT_PUBLIC_TOPIC_RECENCY_WEIGHT ?? '1')
  const HALF_LIFE_HOURS = Number(process.env.NEXT_PUBLIC_TOPIC_RECENCY_HALF_LIFE_HOURS ?? '24')

  const recencyWeight = (publishedAt: string | undefined) => {
    if (!publishedAt) return 0
    try {
      const hours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 36e5)
      const halfLife = HALF_LIFE_HOURS > 0 ? HALF_LIFE_HOURS : 24
      return Math.exp(-hours / halfLife)
    } catch {
      return 0
    }
  }

  for (const t of topics) {
    const { clusters, unclustered } = filterByTopic(storyClusters, unclusteredArticles, t)
    const clusterArticles = (clusters || []).reduce((sum, c) => sum + (c.articles?.length || 0), 0)
    const recency =
      (clusters || []).reduce((sum, c) => {
        return sum + (c.articles || []).reduce((s, a) => s + recencyWeight(a.publishedAt), 0)
      }, 0) + (unclustered || []).reduce((s, a) => s + recencyWeight(a.publishedAt), 0)

    const total = clusterArticles + (unclustered?.length || 0)
    const score = ACTIVITY_W * total + RECENCY_W * recency
    if (total > 0) scored.push({ topic: t, score })
  }

  scored.sort((a, b) => b.score - a.score)

  return scored.map((s) => s.topic)
}
