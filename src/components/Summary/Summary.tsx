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
  const { elementRef, isIntersecting, summary, isLoading, error, handleRetry, topicMatches, requestSummary } =
    useLazySummary({
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
            <Button size="sm" variant="outline" onClick={requestSummary}>
              Summarize with AI
            </Button>
            <span className="text-xs text-muted-foreground">On‑demand to save tokens</span>
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
