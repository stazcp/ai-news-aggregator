'use client'

import { StoryCluster } from '@/types'

interface RelatedCoveragePillsProps {
  clusters: StoryCluster[]
  onRelatedClick?: (id: string) => void
}

export default function RelatedCoveragePills({ clusters, onRelatedClick }: RelatedCoveragePillsProps) {
  if (!clusters.length) return null

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <p className="text-xs text-muted-foreground mb-2">Related Coverage</p>
      <div className="flex flex-wrap gap-2">
        {clusters.map((rc, i) => (
          <button
            key={i}
            type="button"
            title={rc.clusterTitle}
            onClick={() => rc.id && onRelatedClick?.(rc.id)}
            className="group/pill inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-muted/40 text-xs hover:bg-accent/10 hover:border-accent/60 hover:shadow-sm transition-all duration-200 cursor-pointer"
          >
            <span className="truncate max-w-[240px] group-hover/pill:max-w-[400px] transition-all duration-200">
              {rc.clusterTitle}
            </span>
            <span className="text-muted-foreground shrink-0">
              · {rc.articles?.length ?? rc.articleIds.length}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
