'use client'

import React from 'react'
import TrendingTopicsBar from '../TopBar/TrendingTopicsBar'
import { Button } from '../ui/button'

interface HomeHeaderProps {
  rateLimitMessage?: string | null
  topics: string[]
  activeTopic?: string
  onTopicChange?: (topic: string) => void
  openSummary: () => void
  closeSummary: () => void
}

export default function HomeHeader({
  rateLimitMessage,
  topics,
  activeTopic,
  onTopicChange,
  openSummary,
  closeSummary,
}: HomeHeaderProps) {
  const openSummaryButton = (
    <Button
      size="sm"
      variant="outline"
      onClick={openSummary}
      className="relative overflow-hidden border border-border text-foreground hover:bg-muted transition-all duration-300"
    >
      <span className="relative z-10 font-medium">✨ Summarize</span>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite] dark:via-white/10"></div>
    </Button>
  )

  return (
    <header className="text-center mb-12">
      <h1 className="text-5xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-6xl md:text-7xl">
        AI-Curated News
      </h1>
      <p className="mt-4 text-lg text-[var(--muted-foreground)]">
        Your daily feed of news, intelligently grouped and summarized by AI.
      </p>
      {rateLimitMessage && (
        <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg max-w-2xl mx-auto">
          <p className="text-sm text-yellow-300">⚠️ {rateLimitMessage}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-6 flex-wrap">
        <TrendingTopicsBar
          topics={topics}
          activeTopic={activeTopic}
          onTopicChange={onTopicChange}
          additionalActions={openSummaryButton}
          closeSummary={closeSummary}
        />
      </div>
    </header>
  )
}
