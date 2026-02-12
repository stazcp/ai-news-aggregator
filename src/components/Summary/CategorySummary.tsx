import { useEffect, useMemo } from 'react'
import { StoryCluster } from '@/types'
import { buildCategorySummaryPayload, simpleHash } from '@/lib/utils'
import { useLazySummary } from '@/hooks/useLazySummary'
import { SummaryBase } from './SummaryBase'
import { AISummaryTitle, Badge, CategorySummaryContentSkeleton } from '@/components/ui'
import { Button } from '@/components/ui/button'

interface CategorySummaryProps {
  topic?: string
  clusters: StoryCluster[]
  isSummaryOpen: boolean
  onClose: () => void
}

export function CategorySummary({
  topic,
  clusters,
  isSummaryOpen,
  onClose,
}: CategorySummaryProps) {
  const isTrending = !topic
  const summaryTitle = isTrending ? 'Summary of the Day' : `${topic} Highlights`
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
        [], // No standalone articles - we only summarize clustered stories
        {
          maxClusters: 4,
          maxArticlesPerCluster: 3,
          maxStandaloneArticles: 0,
        }
      ),
    [clusters, slugSource, isTrending]
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
    disabled: !isSummaryOpen,
    variant: 'article',
    mode,
    purpose: 'category',
  })

  if (!payload) {
    return null
  }

  useEffect(() => {
    if (isSummaryOpen) {
      requestSummary()
    }
  }, [isSummaryOpen, requestSummary])

  if (!isSummaryOpen) {
    return null
  }

  const articleCountLabel = `${payload.articleCount} article${payload.articleCount === 1 ? '' : 's'} analyzed`

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
        className="rounded-2xl border border-border bg-card/60 backdrop-blur p-6 sm:p-7 shadow-sm"
        loadingContent={<CategorySummaryContentSkeleton />}
        errorContent={errorContent}
      >
        {summary ? (
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
        ) : null}
      </SummaryBase>
    </section>
  )
}

export default CategorySummary
