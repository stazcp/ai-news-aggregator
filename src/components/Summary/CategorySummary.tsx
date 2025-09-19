import { useEffect, useMemo } from 'react'
import { Article, StoryCluster } from '@/types'
import { buildCategorySummaryPayload, simpleHash } from '@/lib/utils'
import { useLazySummary } from '@/hooks/useLazySummary'
import { SummaryBase } from './SummaryBase'
import { AISummaryTitle, LoadingSpinner, Badge } from '@/components/ui'
import { Button } from '@/components/ui/button'

interface CategorySummaryProps {
  topic?: string
  clusters: StoryCluster[]
  unclustered: Article[]
  onClose: () => void
}

export interface CategorySummaryRef {
  requestSummary: () => void
}

export function CategorySummary({ topic, clusters, unclustered, onClose }: CategorySummaryProps) {
  const isTrending = !topic
  const summaryTitle = isTrending ? 'Summary of the Day' : `${topic} Highlights`
  const buttonLabel = isTrending ? "Summarize today's news" : `Summarize ${topic}`
  const slugSource = topic?.trim() || 'trending'
  const slug =
    slugSource
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trending'

  const payload = useMemo(
    () =>
      buildCategorySummaryPayload(
        isTrending ? "Today's top stories" : slugSource,
        clusters,
        unclustered,
        {
          maxClusters: 4,
          maxArticlesPerCluster: 3,
          maxStandaloneArticles: 4,
        }
      ),
    [clusters, unclustered, slugSource, isTrending]
  )

  const mode: 'manual' = 'manual'

  const {
    elementRef,
    isIntersecting,
    summary,
    isLoading,
    error,
    topicMatches,
    requestSummary,
    handleRetry,
  } = useLazySummary({
    articleId: payload?.id || `category-${slug}-${simpleHash(slugSource)}`,
    content: payload?.content || '',
    eager: false,
    variant: 'article',
    mode,
    purpose: 'category',
  })

  // Hide the block when there is no meaningful content to summarize.
  if (!payload) {
    return null
  }

  const articleCountLabel = `${payload.articleCount} article${payload.articleCount === 1 ? '' : 's'} analyzed`

  useEffect(() => {
    requestSummary()
  }, [requestSummary])

  const hasSummary = Boolean(summary)
  const containerClass = !hasSummary
    ? 'flex justify-end'
    : 'rounded-2xl border border-border bg-card/60 backdrop-blur p-6 sm:p-7 shadow-sm'

  const errorContent = (
    <div className="inline-flex items-center gap-2">
      <Badge variant="outline" className="hidden sm:inline-flex text-xs text-destructive">
        Summary failed
      </Badge>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRetry}
        className="relative overflow-hidden border border-destructive/20 text-destructive hover:bg-destructive/10 transition-all duration-300 cursor-pointer"
      >
        <span className="relative z-10 font-medium">🔄 Retry Summary</span>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-destructive/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
      </Button>
    </div>
  )

  return (
    <section className="max-w-5xl mx-auto mb-12 w-full px-4 sm:px-6 lg:px-0">
      <SummaryBase
        elementRef={elementRef}
        isLoading={isLoading}
        error={error}
        isIntersecting={isIntersecting && topicMatches}
        eager={false}
        className={containerClass}
        loadingContent={<LoadingSpinner variant="cluster" articleCount={payload.articleCount} />}
        errorContent={errorContent}
      >
        {summary && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{summaryTitle}</Badge>
                <span className="text-xs text-muted-foreground">{articleCountLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="hidden sm:inline">AI-powered digest</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClose}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Hide summary
                </Button>
              </div>
            </div>
            <AISummaryTitle />
            <p className="text-base leading-relaxed text-foreground/90">{summary}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <span>{articleCountLabel}</span>
            </div>
          </div>
        )}
      </SummaryBase>
    </section>
  )
}

export default CategorySummary
