import { AISummaryTitle, LoadingSpinner } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { useLazySummary } from '@/hooks/useLazySummary'
import { SummaryBase } from './SummaryBase'

interface SummaryProps {
  articleId: string
  content: string
  eager?: boolean
  className?: string
}

export default function Summary({
  articleId,
  content,
  eager = false,
  className = '',
}: SummaryProps) {
  const ON_DEMAND = (process.env.NEXT_PUBLIC_SUMMARY_ON_DEMAND || 'true').toLowerCase() === 'true'
  const {
    elementRef,
    isIntersecting,
    summary,
    isLoading,
    error,
    handleRetry,
    topicMatches,
    requestSummary,
  } = useLazySummary({
    articleId,
    content,
    eager,
    variant: 'article',
    mode: ON_DEMAND ? 'manual' : 'auto',
  })

  const baseClasses = 'mt-4 p-4 rounded-lg border'
  const containerClasses = `${baseClasses} ${className}`

  return (
    <SummaryBase
      elementRef={elementRef}
      isLoading={isLoading}
      error={error}
      isIntersecting={isIntersecting && topicMatches}
      eager={eager}
      className={`${containerClasses} ${summary ? 'bg-accent/10' : ''}`}
      loadingContent={<LoadingSpinner variant="article" />}
      placeholderContent={
        ON_DEMAND ? (
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={requestSummary}
              className="relative overflow-hidden bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200 text-purple-700 hover:from-purple-100 hover:to-blue-100 hover:border-purple-300 hover:text-purple-800 transition-all duration-300 hover:shadow-md hover:shadow-purple-100 dark:from-purple-950/30 dark:to-blue-950/30 dark:border-purple-800 dark:text-purple-300 dark:hover:from-purple-900/40 dark:hover:to-blue-900/40 dark:hover:border-purple-700 dark:hover:text-purple-200 dark:hover:shadow-purple-900/20"
            >
              <span className="relative z-10">
                <span className="font-medium">✨ Summarize with AI</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite] dark:via-white/10"></div>
            </Button>
          </div>
        ) : (
          <>
            <AISummaryTitle />
            <p className="text-sm text-muted-foreground">
              AI summary will load when this section becomes visible
            </p>
          </>
        )
      }
    >
      {summary ? (
        <>
          <AISummaryTitle />
          <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
        </>
      ) : null}
    </SummaryBase>
  )
}
