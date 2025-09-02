import { AISummaryTitle, LoadingSpinner } from '@/components/ui'
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
  const { elementRef, isIntersecting, summary, isLoading, error, handleRetry, topicMatches } =
    useLazySummary({
      articleId,
      content,
      eager,
      variant: 'article',
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
        <>
          <AISummaryTitle />
          <p className="text-sm text-muted-foreground">
            AI summary will load when this section becomes visible
          </p>
        </>
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
