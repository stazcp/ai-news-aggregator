import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { matchesTopic } from '@/lib/topics'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { StoryCluster } from '@/types'
import { useQuery } from '@tanstack/react-query'

interface UseLazySummaryArgs {
  articleId?: string
  content?: string
  cluster?: StoryCluster
  eager?: boolean
  variant?: 'article' | 'cluster'
  mode?: 'auto' | 'manual'
}

export function useLazySummary({
  articleId,
  content,
  cluster,
  eager = false,
  variant = 'article',
  mode = 'auto',
}: UseLazySummaryArgs) {
  const searchParams = useSearchParams()
  const activeTopic = (searchParams?.get('topic') || '').trim()
  const [summary, setSummary] = useState<string>(
    variant === 'cluster' ? cluster?.summary || '' : ''
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRequested, setHasRequested] = useState(
    variant === 'cluster' ? !!cluster?.summary : false
  )

  const { elementRef, isIntersecting } = useIntersectionObserver({
    threshold: variant === 'cluster' ? 0.1 : 0.2,
    rootMargin: variant === 'cluster' ? '300px' : '200px',
    triggerOnce: true,
  })

  // Helper to strip any HTML tags from summaries that may come from fallbacks
  const stripHtml = (input: string): string =>
    (input || '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  // Reset local state when target identity changes to avoid stale summaries
  useEffect(() => {
    const initialSummaryRaw = variant === 'cluster' ? cluster?.summary || '' : ''
    const initialSummary = stripHtml(initialSummaryRaw)
    setSummary(initialSummary)
    setError(null)
    setHasRequested(variant === 'cluster' ? !!cluster?.summary : false)
    setIsLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, articleId, cluster?.clusterTitle])

  const topicMatches = (() => {
    if (!activeTopic) return true
    if (variant === 'cluster' && cluster) {
      const text = [
        cluster.clusterTitle,
        ...(cluster.articles?.map((a) => `${a.title} ${a.description || ''}`) || []),
      ].join(' ')
      return matchesTopic(activeTopic, text)
    }
    const text = `${content || ''}`
    return matchesTopic(activeTopic, text)
  })()

  const contentPayload = useMemo(() => {
    if (variant === 'cluster' && cluster) {
      return (
        cluster.articles
          ?.map(
            (article: { title: string; description?: string; content?: string }) =>
              `${article.title}\n${article.description || article.content || ''}`
          )
          .join('\n\n---\n\n') || ''
      )
    }
    return content || ''
  }, [variant, cluster, content])

  const idForCache = useMemo(() => {
    return variant === 'cluster'
      ? `cluster-${cluster?.clusterTitle || 'unknown'}`
      : articleId || 'unknown'
  }, [variant, cluster?.clusterTitle, articleId])

  const enabled = useMemo(() => {
    const lengthOk =
      variant === 'cluster'
        ? (cluster?.articles?.length ?? 0) > 0
        : !!content && content.length > 100
    const hasServerClusterSummary = variant === 'cluster' && !!cluster?.summary
    if (mode === 'manual') {
      return lengthOk && hasRequested && topicMatches && !hasServerClusterSummary
    }
    return lengthOk && (eager || isIntersecting) && topicMatches && !hasServerClusterSummary
  }, [variant, cluster, content, eager, isIntersecting, topicMatches, mode, hasRequested])

  const {
    data,
    isFetching,
    error: queryError,
  } = useQuery({
    queryKey: ['summary', variant, idForCache, contentPayload.length],
    enabled,
    initialData: variant === 'cluster' ? cluster?.summary : undefined,
    staleTime: variant === 'cluster' ? 7200_000 : 3600_000,
    gcTime: variant === 'cluster' ? 7200_000 : 3600_000,
    queryFn: async () => {
      const payload =
        variant === 'cluster'
          ? {
              articleId: idForCache,
              content: contentPayload,
              isCluster: true,
              clusterTitle: cluster?.clusterTitle,
            }
          : { articleId: idForCache, content: contentPayload }

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to fetch summary')
      const json = await response.json()
      return json.summary as string
    },
  })

  useEffect(() => {
    setIsLoading(isFetching)
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Failed to load summary')
    } else if (typeof data === 'string') {
      setSummary(stripHtml(data))
    }
  }, [isFetching, queryError, data])

  const handleRetry = () => {
    setError(null)
    setHasRequested(false)
    // Refetch via react-query by invalidating key implicitly through enabled conditions
    // or rely on retry button to re-trigger by intersection; here we do nothing extra
  }

  const requestSummary = () => {
    setError(null)
    setHasRequested(true)
  }

  return {
    elementRef,
    isIntersecting,
    summary,
    isLoading,
    error,
    handleRetry,
    topicMatches,
    requestSummary,
  }
}
