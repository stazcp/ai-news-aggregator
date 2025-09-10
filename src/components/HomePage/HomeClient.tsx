'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { StoryCluster, Article } from '@/types'
import HomeLayout from './HomeLayout'
import HomeHeader from './HomeHeader'
import NewsList from '@/components/NewsList'
import { filterByTopic } from '@/lib/utils'

interface HomeClientProps {
  storyClusters: StoryCluster[]
  unclusteredArticles: Article[]
  topics: string[]
  rateLimitMessage: string | null
}

export default function HomeClient({ storyClusters, unclusteredArticles, topics, rateLimitMessage }: HomeClientProps) {
  const [topic, setTopic] = useState<string>('')

  // Initialize from URL once, but do not trigger server navigation on changes
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const t = params.get('topic') || ''
      setTopic(t)
    } catch {}
  }, [])

  // Compute which topics actually have content
  const available = useMemo(() => {
    const scored: Array<{ topic: string; score: number }> = []

    const ACTIVITY_W = Number(process.env.NEXT_PUBLIC_TOPIC_ACTIVITY_WEIGHT ?? '1')
    const RECENCY_W = Number(process.env.NEXT_PUBLIC_TOPIC_RECENCY_WEIGHT ?? '1')
    const HALF_LIFE_HOURS = Number(
      process.env.NEXT_PUBLIC_TOPIC_RECENCY_HALF_LIFE_HOURS ?? '24'
    )

    const recencyWeight = (publishedAt: string | undefined) => {
      if (!publishedAt) return 0
      try {
        const hours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 36e5)
        const halfLife = HALF_LIFE_HOURS > 0 ? HALF_LIFE_HOURS : 24
        return Math.exp(-hours / halfLife) // 1 now, ~0.37 at half-life hours
      } catch {
        return 0
      }
    }
    for (const t of topics) {
      const { clusters, unclustered } = filterByTopic(storyClusters, unclusteredArticles, t)
      const clusterArticles = (clusters || []).reduce(
        (sum, c) => sum + (c.articles?.length || 0),
        0
      )
      // Recency score sums freshness of each article (max ~ total)
      const recency = (clusters || []).reduce((sum, c) => {
        return sum + (c.articles || []).reduce((s, a) => s + recencyWeight(a.publishedAt), 0)
      }, 0) + (unclustered || []).reduce((s, a) => s + recencyWeight(a.publishedAt), 0)

      const total = clusterArticles + (unclustered?.length || 0)
      const score = ACTIVITY_W * total + RECENCY_W * recency // combine activity and freshness
      if (total > 0) scored.push({ topic: t, score })
    }
    // Sort by activity (descending)
    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => s.topic)
  }, [topics, storyClusters, unclusteredArticles])

  const filtered = useMemo(() => filterByTopic(storyClusters, unclusteredArticles, topic || undefined), [storyClusters, unclusteredArticles, topic])

  return (
    <HomeLayout>
      <HomeHeader
        rateLimitMessage={rateLimitMessage}
        topics={available}
        activeTopic={topic}
        onTopicChange={setTopic}
      />
      <NewsList storyClusters={filtered.clusters} unclusteredArticles={filtered.unclustered} />
    </HomeLayout>
  )
}
