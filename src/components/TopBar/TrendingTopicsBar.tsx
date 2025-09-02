'use client'

import React, { useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface TrendingTopicsBarProps {
  topics: string[]
}

export default function TrendingTopicsBar({ topics }: TrendingTopicsBarProps) {
  const router = useRouter()
  const params = useSearchParams()
  const active = useMemo(() => params.get('topic') || '', [params])

  const setTopic = (topic: string) => {
    const next = new URLSearchParams(params.toString())
    if (!topic || active === topic) {
      next.delete('topic')
    } else {
      // URLSearchParams will handle encoding; store the raw value to avoid double-encoding
      next.set('topic', topic)
    }
    router.push(`?${next.toString()}`)
  }

  if (!topics?.length) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
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
    </div>
  )
}
