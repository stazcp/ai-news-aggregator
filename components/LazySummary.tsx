'use client'

import { useState, useEffect } from 'react'
import { useIntersectionObserver } from '@/lib/hooks/useIntersectionObserver'
import { StoryCluster } from '@/types'

interface LazySummaryProps {
  // For individual articles
  articleId?: string
  content?: string

  // For story clusters
  cluster?: StoryCluster

  // Common props
  className?: string
  eager?: boolean // Option to force immediate loading
  variant?: 'article' | 'cluster' // Determines styling and behavior
}

// Shared UI Components
const SummaryBadge = ({
  variant,
  status,
  children,
}: {
  variant: 'article' | 'cluster'
  status: 'loading' | 'error' | 'available' | 'ready'
  children: React.ReactNode
}) => {
  const baseClasses =
    variant === 'cluster'
      ? 'flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium'
      : 'flex items-center text-sm font-semibold mb-2'

  const statusStyles = {
    loading: variant === 'cluster' ? 'bg-accent/10 border-accent/20' : '',
    error: variant === 'cluster' ? 'bg-red-900/20 border-red-700/30' : '',
    available: variant === 'cluster' ? 'bg-accent/5 border-accent/10' : '',
    ready: variant === 'cluster' ? 'bg-accent/10 border-accent/20' : '',
  }

  return <div className={`${baseClasses} ${statusStyles[status]}`}>{children}</div>
}

const LoadingSpinner = ({
  variant,
  articleCount,
}: {
  variant: 'article' | 'cluster'
  articleCount?: number
}) => (
  <div className="flex items-center space-x-2">
    <div
      className={`animate-spin rounded-full border-b-2 border-accent ${variant === 'cluster' ? 'h-5 w-5' : 'h-4 w-4'}`}
    ></div>
    <p
      className={`text-muted-foreground ${variant === 'cluster' ? 'text-lg animate-pulse' : 'text-sm'}`}
    >
      {variant === 'cluster'
        ? `AI is analyzing ${articleCount || 0} articles to create a comprehensive summary...`
        : 'Generating summary...'}
    </p>
  </div>
)

const RetryButton = ({ onRetry }: { onRetry: () => void }) => (
  <button onClick={onRetry} className="text-xs text-red-300 hover:text-red-200 mt-1 underline">
    Retry
  </button>
)

export default function LazySummary({
  articleId,
  content,
  cluster,
  className = '',
  eager = false,
  variant = 'article',
}: LazySummaryProps) {
  const [summary, setSummary] = useState<string>(
    variant === 'cluster' ? cluster?.summary || '' : ''
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRequested, setHasRequested] = useState(
    variant === 'cluster' ? !!cluster?.summary : false
  )

  // Use intersection observer to detect when component is visible
  const { elementRef, isIntersecting } = useIntersectionObserver({
    threshold: variant === 'cluster' ? 0.1 : 0.2,
    rootMargin: variant === 'cluster' ? '300px' : '200px',
    triggerOnce: true,
  })

  const fetchSummary = async () => {
    if (hasRequested) return // Prevent duplicate requests

    const logId = variant === 'cluster' ? cluster?.clusterTitle : articleId
    console.log(`🤖 Generating AI ${variant} summary for: ${logId}`)
    setIsLoading(true)
    setError(null)
    setHasRequested(true)

    try {
      const requestPayload =
        variant === 'cluster' && cluster
          ? {
              articleId: `cluster-${cluster.clusterTitle}`,
              content:
                cluster.articles
                  ?.map(
                    (article) => `${article.title}\n${article.description || article.content || ''}`
                  )
                  .join('\n\n---\n\n') || '',
              isCluster: true,
              clusterTitle: cluster.clusterTitle,
            }
          : { articleId, content: content || '' }

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      })

      if (!response.ok) throw new Error('Failed to fetch summary')

      const data = await response.json()
      setSummary(data.summary)
      console.log(`✅ AI ${variant} summary generated for: ${logId}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load summary'
      setError(errorMessage)
      console.error(`❌ Failed to generate ${variant} summary for ${logId}: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch summary when component becomes visible or if eager loading is enabled
  useEffect(() => {
    const shouldFetch =
      variant === 'cluster' ? (cluster?.articles?.length ?? 0) > 0 : content && content.length > 100

    if (shouldFetch && (eager || isIntersecting)) {
      fetchSummary()
    }
  }, [content, isIntersecting, eager, cluster])

  // Don't render for individual articles with short content
  if (variant === 'article' && (!content || content.length <= 100)) {
    return null
  }

  const handleRetry = () => {
    setError(null)
    setHasRequested(false)
    fetchSummary()
  }

  // Render cluster variant
  if (variant === 'cluster') {
    if (error) {
      return (
        <div ref={elementRef} className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-red-900/20 rounded-full border border-red-700/30">
              <span className="text-red-400 text-sm">⚠️</span>
              <span className="text-sm font-medium text-red-400">Summary Failed</span>
            </div>
          </div>
          <div className="prose prose-lg max-w-none">
            <p className="text-sm text-red-400">Failed to generate AI summary.</p>
            <RetryButton onRetry={handleRetry} />
          </div>
        </div>
      )
    }

    if (isLoading) {
      return (
        <div ref={elementRef} className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full border border-accent/20">
              <span className="text-accent text-sm">✨</span>
              <span className="text-sm font-medium text-accent">Generating Analysis</span>
            </div>
          </div>
          <div className="prose prose-lg max-w-none">
            <LoadingSpinner variant="cluster" articleCount={cluster?.articles?.length} />
          </div>
        </div>
      )
    }

    if (!summary) {
      // Show placeholder while waiting for intersection
      if (!isIntersecting && !eager) {
        return (
          <div ref={elementRef} className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2 px-3 py-1 bg-accent/5 rounded-full border border-accent/10">
                <span className="text-accent/70 text-sm">✨</span>
                <span className="text-sm font-medium text-accent/70">AI Analysis Available</span>
              </div>
            </div>
            <div className="prose prose-lg max-w-none">
              <p className="text-lg text-muted-foreground">
                AI-powered analysis will load when this section becomes visible
              </p>
            </div>
          </div>
        )
      }
      return null
    }

    return (
      <div ref={elementRef} className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full border border-accent/20">
            <span className="text-accent text-sm">✨</span>
            <span className="text-sm font-medium text-accent">AI Analysis</span>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <p className="text-lg leading-relaxed text-foreground font-medium">{summary}</p>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          <div className="w-1 h-1 bg-accent rounded-full animate-pulse"></div>
          <span>Generated from {cluster?.articles?.length || 0} sources using AI</span>
        </div>
      </div>
    )
  }

  // Render article variant (original behavior)
  const baseClasses = 'mt-4 p-4 rounded-lg border'
  const containerClasses = `${baseClasses} ${className}`

  if (error) {
    return (
      <div ref={elementRef} className={`${containerClasses} bg-red-900/20 border-red-700/30`}>
        <p className="text-sm text-red-400">Failed to load AI summary.</p>
        <RetryButton onRetry={handleRetry} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div ref={elementRef} className={`${containerClasses} bg-accent/10 border-accent/30`}>
        <h4 className="flex items-center text-sm font-semibold text-accent mb-2">
          <span className="mr-2">✨</span>
          AI-Powered Summary
        </h4>
        <LoadingSpinner variant="article" />
      </div>
    )
  }

  if (!summary) {
    // Show placeholder while waiting for intersection
    if (!isIntersecting && !eager) {
      return (
        <div ref={elementRef} className={`${containerClasses} bg-accent/5 border-accent/20`}>
          <h4 className="flex items-center text-sm font-semibold text-accent/70 mb-2">
            <span className="mr-2">✨</span>
            AI Summary Available
          </h4>
          <p className="text-sm text-muted-foreground">
            AI summary will load when this section becomes visible
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div
      ref={elementRef}
      className={`${containerClasses} bg-accent/10`}
      style={{ animation: 'pulse-border 2s infinite' }}
    >
      <h4 className="flex items-center text-sm font-semibold text-accent mb-2">
        <span className="mr-2">✨</span>
        AI-Powered Summary
      </h4>
      <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
    </div>
  )
}
