'use client'

import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { StoryCluster } from '@/types'
import { Badge } from '@/components/ui'
import { formatPublishedLabel } from '@/lib/utils'
import ClusterExpandedContent from './ClusterExpandedContent'

interface RelatedStoryModalProps {
  cluster: StoryCluster | null
  relatedClusters?: StoryCluster[]
  onClose: () => void
  onRelatedClick?: (id: string) => void
}

export default function RelatedStoryModal({
  cluster,
  relatedClusters,
  onClose,
  onRelatedClick,
}: RelatedStoryModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (cluster) {
      if (!dialog.open) dialog.showModal()
      contentRef.current?.scrollTo({ top: 0 })
    } else {
      if (dialog.open) dialog.close()
    }
  }, [cluster])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) onClose()
    },
    [onClose]
  )

  const handleCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault()
      onClose()
    },
    [onClose]
  )

  const publishedLabel = useMemo(
    () => formatPublishedLabel(cluster?.articles?.[0]?.publishedAt),
    [cluster?.articles]
  )

  if (!cluster) return null

  const sourceCount = (cluster.articles || []).length

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 m-0 h-dvh w-dvw max-h-dvh max-w-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex open:items-center open:justify-center"
    >
      <div
        ref={contentRef}
        className="relative mx-auto my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl border border-border/60 bg-card text-foreground shadow-2xl sm:my-8 sm:max-h-[calc(100dvh-4rem)]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border/60 bg-muted/40 backdrop-blur px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <Badge variant="secondary" className="uppercase tracking-wide">
                  Related Story
                </Badge>
                {cluster.severity?.label && (
                  <span className="inline-flex items-center rounded-full border border-border/60 px-3 py-1 text-[11px] uppercase tracking-wide text-foreground/70">
                    {cluster.severity.label}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
                {cluster.clusterTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
                <span>
                  Related coverage · {sourceCount} source{sourceCount !== 1 ? 's' : ''}
                </span>
                {publishedLabel && <span>Updated {publishedLabel}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body — shared with StoryClusterCard expanded state */}
        <ClusterExpandedContent
          cluster={cluster}
          relatedClusters={relatedClusters}
          onRelatedClick={onRelatedClick}
        />
      </div>
    </dialog>
  )
}
