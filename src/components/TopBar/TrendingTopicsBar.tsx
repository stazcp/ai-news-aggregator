'use client'

import React, { useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface TrendingTopicsBarProps {
  topics: string[]
  activeTopic?: string
  onTopicChange?: (topic: string) => void
  additionalActions?: React.ReactNode
  closeSummary: () => void
}

export default function TrendingTopicsBar({
  topics,
  activeTopic,
  onTopicChange,
  additionalActions,
  closeSummary,
}: TrendingTopicsBarProps) {
  const router = useRouter()
  const params = useSearchParams()
  const active = useMemo(
    () => (activeTopic !== undefined ? activeTopic : params.get('topic') || ''),
    [params, activeTopic]
  )

  const setTopic = (topic: string) => {
    if (onTopicChange) {
      // Update URL without triggering a server navigation
      try {
        const url = new URL(window.location.href)
        if (!topic || active === topic) url.searchParams.delete('topic')
        else url.searchParams.set('topic', topic)
        window.history.replaceState({}, '', `${url.pathname}${url.search}`)
      } catch {}
      closeSummary()
      onTopicChange(topic)
      return
    }
    // Fallback: navigate (server will filter)
    const next = new URLSearchParams(params.toString())
    if (!topic || active === topic) next.delete('topic')
    else next.set('topic', topic)
    router.push(`?${next.toString()}`)
  }

  if (!topics?.length) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 ">
      <Button size="sm" variant={active ? 'outline' : 'default'} onClick={() => setTopic('')}>
        Trending
      </Button>
      {topics.map((t) => (
        <Button
          key={t}
          size="sm"
          variant={active === t ? 'default' : 'outline'}
          onClick={() => setTopic(t)}
          aria-pressed={active === t}
        >
          {t}
        </Button>
      ))}
      {additionalActions}
    </div>
  )
}
