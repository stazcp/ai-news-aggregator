import { LoadingSpinner } from '@/components/ui'
import { useLazySummary } from '@/hooks/useLazySummary'
import { StoryCluster } from '@/types'
import { SummaryBase } from './SummaryBase'

interface ClusterSummaryProps {
  cluster: StoryCluster
  eager?: boolean
}

export default function ClusterSummary({ cluster, eager = false }: ClusterSummaryProps) {
  const { elementRef, isIntersecting, summary, isLoading, error, handleRetry, topicMatches } =
    useLazySummary({
      cluster,
      eager,
      variant: 'cluster',
    })

  const headerBadge = (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full border border-accent/20">
        <span className="text-accent text-sm">✨</span>
        <span className="text-sm font-medium text-accent">AI Analysis</span>
      </div>
    </div>
  )

  return (
    <SummaryBase
      elementRef={elementRef}
      isLoading={isLoading}
      error={error}
      isIntersecting={isIntersecting && topicMatches}
      eager={eager}
      className="space-y-4"
      headerBadge={headerBadge}
      loadingContent={<LoadingSpinner variant="cluster" articleCount={cluster?.articles?.length} />}
      placeholderContent={
        <p className="text-lg text-muted-foreground">
          AI-powered analysis will load when this section becomes visible
        </p>
      }
    >
      {summary ? (
        <>
          <div className="prose prose-lg max-w-none">
            <p className="text-lg leading-relaxed text-foreground font-medium">{summary}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
            <div className="w-1 h-1 bg-accent rounded-full animate-pulse"></div>
            <span>Generated from {cluster?.articles?.length || 0} sources using AI</span>
          </div>
        </>
      ) : (
        // Fallback paragraph constructed from top article titles when summary not yet available
        <div className="prose prose-lg max-w-none">
          <p className="text-base leading-relaxed text-muted-foreground">
            {(cluster.articles || [])
              .slice(0, 3)
              .map((a) => a.title)
              .join(' • ')}
          </p>
        </div>
      )}
    </SummaryBase>
  )
}
