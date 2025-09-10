import React from 'react'
import TrendingTopicsBar from '../TopBar/TrendingTopicsBar'

interface HomeHeaderProps {
  rateLimitMessage?: string | null
  topics: string[]
  activeTopic?: string
  onTopicChange?: (topic: string) => void
}

export default function HomeHeader({ rateLimitMessage, topics, activeTopic, onTopicChange }: HomeHeaderProps) {
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
      <TrendingTopicsBar topics={topics} activeTopic={activeTopic} onTopicChange={onTopicChange} />
    </header>
  )
}
