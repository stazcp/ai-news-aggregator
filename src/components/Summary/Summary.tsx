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

  const containerClasses = `rounded-lg border ${className}`

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
              className="relative overflow-hidden border border-border bg-card text-foreground hover:bg-muted transition-all duration-300 cursor-pointer"
            >
              <span className="relative z-10">
                <span className="font-medium relative z-10">✨ Summarize with AI</span>
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
