'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StoryClusterCard from './StoryClusterCard'
import { StoryCluster } from '@/types'

// Number of top stories to show prominently
const TOP_STORIES_COUNT = 4
// Pixels to leave above the card after scrolling (accounts for sticky header)
const SCROLL_OFFSET = 88

interface NewsListProps {
  storyClusters: StoryCluster[]
}

export default function NewsList({ storyClusters }: NewsListProps) {
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set([0]))
  const [showMoreStories, setShowMoreStories] = useState(false)
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)
  const [highlightedClusterId, setHighlightedClusterId] = useState<string | null>(null)

  const clusterMap = useMemo(
    () => new Map(storyClusters.filter((c) => c.id).map((c) => [c.id!, c])),
    [storyClusters]
  )

  // After React commits the DOM (expand + possible More Stories reveal),
  // scroll to the target card. All three state changes are batched into one
  // render by React 18, so getBoundingClientRect() always measures the final layout.
  useEffect(() => {
    if (!pendingScrollId) return
    const el = document.getElementById(`cluster-${pendingScrollId}`)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
    window.scrollTo({ top, behavior: 'smooth' })
    setPendingScrollId(null)
  }, [pendingScrollId, expandedClusters, showMoreStories])

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRelatedClick = useCallback(
    (id: string) => {
      const idx = storyClusters.findIndex((c) => c.id === id)
      if (idx === -1) return
      if (idx >= TOP_STORIES_COUNT) setShowMoreStories(true)
      setExpandedClusters((prev) => {
        const next = new Set(prev)
        next.add(idx)
        return next
      })
      setPendingScrollId(id)

      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      setHighlightedClusterId(id)
      highlightTimerRef.current = setTimeout(() => setHighlightedClusterId(null), 2500)
    },
    [storyClusters]
  )

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    }
  }, [])

  const handleClusterExpansion = useCallback((index: number, isExpanded: boolean) => {
    setExpandedClusters((prev) => {
      const newSet = new Set(prev)
      if (isExpanded) {
        newSet.add(index)
      } else {
        newSet.delete(index)
      }
      return newSet
    })
  }, [])

  // Clear "More Stories" expansion state when section is hidden
  const handleToggleMoreStories = () => {
    if (showMoreStories) {
      setExpandedClusters((expanded) => {
        const newSet = new Set(expanded)
        for (const idx of expanded) {
          if (idx >= TOP_STORIES_COUNT) newSet.delete(idx)
        }
        return newSet
      })
    }
    setShowMoreStories(!showMoreStories)
  }

  // Split clusters into top stories and more stories
  const topStories = storyClusters.slice(0, TOP_STORIES_COUNT)
  const moreStories = storyClusters.slice(TOP_STORIES_COUNT)

  if (storyClusters.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📰</div>
        <h3 className="text-xl font-semibold text-foreground mb-2">No stories yet</h3>
        <p className="text-muted-foreground">
          Check back soon for AI-synthesized news stories from multiple sources.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-10 lg:space-y-12">
      {/* Top Stories Section */}
      <section>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className="h-6 w-1 rounded-full bg-accent"></span>
          Top Stories
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {topStories.map((cluster, index) => {
            const isExpanded = expandedClusters.has(index)
            const shouldSpanFullWidth = index === 0 || isExpanded
            const relatedClusters = (cluster.relatedClusterIds || [])
              .map((id) => clusterMap.get(id))
              .filter(Boolean) as StoryCluster[]

            return (
              <div key={index} className={shouldSpanFullWidth ? 'md:col-span-2' : ''}>
                <StoryClusterCard
                  cluster={cluster}
                  relatedClusters={relatedClusters}
                  isFirst={index === 0}
                  isHighlighted={highlightedClusterId === cluster.id}
                  onExpansionChange={(expanded) => handleClusterExpansion(index, expanded)}
                  onRelatedClick={handleRelatedClick}
                />
              </div>
            )
          })}
        </div>
      </section>

      {/* More Stories Section (expandable) */}
      {moreStories.length > 0 && (
        <section>
          <button
            onClick={handleToggleMoreStories}
            className="w-full flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-2">
              <span className="h-6 w-1 rounded-full bg-muted-foreground/30 group-hover:bg-accent transition-colors"></span>
              <span className="text-lg font-semibold text-foreground">More Stories</span>
              <span className="text-sm text-muted-foreground">({moreStories.length})</span>
            </div>
            <svg
              className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${
                showMoreStories ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showMoreStories && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {moreStories.map((cluster, index) => {
                const actualIndex = index + TOP_STORIES_COUNT
                const isExpanded = expandedClusters.has(actualIndex)
                const relatedClusters = (cluster.relatedClusterIds || [])
                  .map((id) => clusterMap.get(id))
                  .filter(Boolean) as StoryCluster[]

                return (
                  <div key={actualIndex} className={isExpanded ? 'md:col-span-2' : ''}>
                    <StoryClusterCard
                      cluster={cluster}
                      relatedClusters={relatedClusters}
                      isFirst={false}
                      isHighlighted={highlightedClusterId === cluster.id}
                      onExpansionChange={(expanded) => handleClusterExpansion(actualIndex, expanded)}
                      onRelatedClick={handleRelatedClick}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
