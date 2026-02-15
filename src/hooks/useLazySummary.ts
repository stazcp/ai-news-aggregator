import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { matchesTopic } from '@/lib/topics'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { StoryCluster } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { getClusterSummaryId } from '@/lib/ai/summaryCache'

interface UseLazySummaryArgs {
  articleId?: string
  content?: string
  cluster?: StoryCluster
  eager?: boolean
  variant?: 'article' | 'cluster'
  mode?: 'auto' | 'manual'
  purpose?: 'article' | 'cluster' | 'category'
  disabled?: boolean
  length?: 'short' | 'long'
}

export function useLazySummary({
  articleId,
  content,
  cluster,
  eager = false,
  variant = 'article',
  mode = 'auto',
  purpose,
  disabled = false,
  length = 'long',
}: UseLazySummaryArgs) {
  const searchParams = useSearchParams()
  const activeTopic = (searchParams?.get('topic') || '').trim()
  const effectivePurpose = purpose || (variant === 'cluster' ? 'cluster' : 'article')

  const MIN_CLUSTER_SUMMARY_LENGTH = 160

  // Helper to strip any HTML tags from summaries that may come from fallbacks
  const stripHtml = (input: string): string =>
    (input || '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const cleanedClusterSummary = useMemo(() => {
    if (variant !== 'cluster') return ''
    return stripHtml(cluster?.summary || '')
  }, [variant, cluster?.summary])

  const hasServerClusterSummary =
    variant === 'cluster' && cleanedClusterSummary.length >= MIN_CLUSTER_SUMMARY_LENGTH

  // For short cluster summaries, we never treat the long server summary as a
  // substitute; always allow fetching the short variant when requested.
  const hasServerSummaryForVariant =
    variant === 'cluster' && length === 'short' ? false : hasServerClusterSummary

  const [summary, setSummary] = useState<string>(
    variant === 'cluster' && hasServerSummaryForVariant ? cleanedClusterSummary : ''
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRequested, setHasRequested] = useState(hasServerSummaryForVariant)

  const { elementRef, isIntersecting } = useIntersectionObserver({
    threshold: variant === 'cluster' ? 0.1 : 0.2,
    rootMargin: variant === 'cluster' ? '300px' : '200px',
    triggerOnce: true,
  })

  // Reset local state when target identity changes to avoid stale summaries
  useEffect(() => {
    const initialSummary =
      variant === 'cluster' && hasServerSummaryForVariant ? cleanedClusterSummary : ''
    setSummary(initialSummary)
    setError(null)
    setHasRequested(variant === 'cluster' ? hasServerSummaryForVariant : false)
    setIsLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, articleId, cluster?.clusterTitle, cleanedClusterSummary, hasServerSummaryForVariant])

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
      return cluster?.articles ?? []
    }
    return content || ''
  }, [variant, cluster, content])

  const idForCache = useMemo(() => {
    if (variant === 'cluster' && cluster) {
      const base = getClusterSummaryId(cluster)
      return length === 'short' ? `${base}:short` : base
    }
    return articleId || 'unknown'
  }, [variant, cluster, articleId, length])

  const enabled = useMemo(() => {
    if (disabled) return false
    // Allow shorter thresholds when user explicitly requests (manual mode),
    // but still require some content to avoid 400 from the API.
    const lengthOk =
      variant === 'cluster'
        ? (cluster?.articles?.length ?? 0) > 0
        : !!content && (mode === 'manual' ? content.length > 30 : content.length > 100)

    if (mode === 'manual') {
      return lengthOk && hasRequested && !hasServerSummaryForVariant
    }
    return lengthOk && (eager || isIntersecting) && topicMatches && !hasServerSummaryForVariant
  }, [
    variant,
    cluster,
    content,
    eager,
    isIntersecting,
    topicMatches,
    mode,
    hasRequested,
    hasServerSummaryForVariant,
  ])

  const {
    data,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['summary', variant, effectivePurpose, idForCache, contentPayload.length, length],
    enabled: enabled,
    initialData:
      variant === 'cluster' && hasServerSummaryForVariant ? cleanedClusterSummary : undefined,
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
              purpose: effectivePurpose,
              length,
            }
          : { articleId: idForCache, content: contentPayload, purpose: effectivePurpose }

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
    setHasRequested(true)
    void refetch()
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
