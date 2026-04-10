'use client'

import { StoryCluster } from '@/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface RelatedCoveragePillsProps {
  clusters: StoryCluster[]
  onRelatedClick?: (id: string) => void
}

export default function RelatedCoveragePills({
  clusters,
  onRelatedClick,
}: RelatedCoveragePillsProps) {
  if (!clusters.length) return null

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <p className="text-xs text-muted-foreground mb-2">Related Coverage</p>
      <div className="flex flex-wrap gap-2">
        {clusters.map((rc, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => rc.id && onRelatedClick?.(rc.id)}
                className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs transition-[background-color,border-color,box-shadow] duration-200 hover:bg-accent/10 hover:border-accent/60 hover:shadow-sm cursor-pointer"
              >
                <span className="min-w-0 truncate max-w-[240px]">{rc.clusterTitle}</span>
                <span className="text-muted-foreground shrink-0">
                  · {rc.articles?.length ?? rc.articleIds.length}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm">
              {rc.clusterTitle}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
