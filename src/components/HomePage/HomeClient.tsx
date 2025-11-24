'use client'

import React, { useEffect, useMemo, useState } from 'react'
import HomeLayout from './HomeLayout'
import HomeHeader from './HomeHeader'
import NewsList from '@/components/NewsList'
import CategorySummary from '@/components/Summary/CategorySummary'
import RefreshStatusBar from '@/components/RefreshStatusBar'
import { NewsListSkeleton, HomeHeaderSkeleton, CategorySummarySkeleton } from '@/components/ui'
import { filterByTopic } from '@/lib/utils'
import { useHomepageData, HomepageData } from '@/hooks/useHomepageData'
import { computeTopics } from './utils'
import { useRefreshIndicator } from '@/hooks/use-refresh-status'

interface HomeClientProps {
  initialData?: HomepageData
}

export default function HomeClient({ initialData }: HomeClientProps) {
  const [topic, setTopic] = useState<string>('')
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)

  // Use React Query for homepage data with initial SSR data
  const { data: homepageData, isLoading, error, isFetching } = useHomepageData(initialData)

  // Get data age info for UI indicators
  const dataAge = useMemo(() => {
    if (!homepageData?.lastUpdated) return null
    const lastUpdate = new Date(homepageData.lastUpdated)
    const ageInHours = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60)
    return {
      lastUpdated: lastUpdate,
      ageInHours,
    }
  }, [homepageData?.lastUpdated])

  // Initialize from URL once, but do not trigger server navigation on changes
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const t = params.get('topic') || ''
      setTopic(t)
    } catch {}
  }, [])

  // Use React Query data if available, fallback to initial data
  const data = homepageData || initialData
  const refreshIndicator = useRefreshIndicator({
    enabled: !data,
  })

  // Compute which topics actually have content
  const availableTopics = useMemo(() => computeTopics(data), [data])

  const filtered = useMemo(() => {
    if (!data?.storyClusters || !data?.unclusteredArticles) {
      return { clusters: [], unclustered: [] }
    }
    return filterByTopic(data.storyClusters, data.unclusteredArticles, topic || undefined)
  }, [data, topic])

  // Show error state if no data and there's an error
  if (error && !data) {
    return (
      <HomeLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="text-6xl mb-4">📰</div>
            <h1 className="text-2xl font-bold text-red-600 mb-2">Unable to load news</h1>
            <p className="text-muted-foreground mb-4">
              We're having trouble loading the latest stories. Please check your connection and try
              again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </HomeLayout>
    )
  }

  // Show skeleton loading state only if no data at all
  if (isLoading && !data) {
    return (
      <HomeLayout>
        <div className="space-y-8">
          <HomeHeaderSkeleton />
          <NewsListSkeleton />
        </div>
      </HomeLayout>
    )
  }

  if (!data) return null

  const handleTopicChange = (nextTopic: string) => {
    setIsSummaryOpen(false)
    setTopic(nextTopic)
  }

  const handleOpenSummary = () => setIsSummaryOpen(true)
  const handleCloseSummary = () => setIsSummaryOpen(false)

  return (
    <HomeLayout>
      {/* Refresh status bar - shows when background updates are happening */}
      <RefreshStatusBar showOnlyWhenWaiting hasData={!!data} refreshState={refreshIndicator} />

      <div className="relative">
        {/* Subtle loading indicator when fetching fresh data - non-blocking */}
        {isFetching && data && (
          <div className="fixed top-20 right-4 z-40 bg-blue-500/10 dark:bg-blue-400/10 backdrop-blur-sm border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 shadow-sm pointer-events-none">
            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
              <div className="animate-pulse w-2 h-2 bg-blue-500 rounded-full"></div>
              Updating content...
            </div>
          </div>
        )}

        <HomeHeader
          rateLimitMessage={data.rateLimitMessage}
          topics={availableTopics}
          activeTopic={topic}
          onTopicChange={handleTopicChange}
          openSummary={handleOpenSummary}
          closeSummary={handleCloseSummary}
        />

        <CategorySummary
          topic={topic || undefined}
          clusters={filtered.clusters}
          unclustered={filtered.unclustered}
          isSummaryOpen={isSummaryOpen}
          onClose={handleCloseSummary}
        />

        <NewsList storyClusters={filtered.clusters} unclusteredArticles={filtered.unclustered} />

        {/* Last updated timestamp */}
        {data.lastUpdated && (
          <div className="text-center text-xs text-muted-foreground mt-8 pb-4 border-t pt-4 mx-4">
            <p>Last updated: {new Date(data.lastUpdated).toLocaleString()}</p>
            {dataAge && (
              <p className="mt-1">
                Content age:{' '}
                {dataAge.ageInHours < 1
                  ? `${Math.round(dataAge.ageInHours * 60)} minutes`
                  : `${dataAge.ageInHours.toFixed(1)} hours`}
              </p>
            )}
          </div>
        )}
      </div>
    </HomeLayout>
  )
}
