'use client'

import React, { useState, useMemo } from 'react'
import { StoryCluster } from '@/types'
import ImageCollage from './ImageCollage'
import ClusterSummary from '@/components/Summary/ClusterSummary'
import SourceArticleList from './SourceArticleList'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui/button'
import NextImage from 'next/image'
import { useLazySummary } from '@/hooks/useLazySummary'

interface StoryClusterCardProps {
  cluster: StoryCluster
  isFirst?: boolean // Indicates if this is the first story (above-the-fold)
  onExpansionChange?: (expanded: boolean) => void
}

export default function StoryClusterCard({
  cluster,
  isFirst = false,
  onExpansionChange,
}: StoryClusterCardProps) {
  if (!cluster.articles || cluster.articles.length === 0) return null

  const sourceCount = cluster.articles.length
  const latestArticle = cluster.articles[0]
  const [hasImages, setHasImages] = useState<boolean>((cluster?.imageUrls?.length || 0) > 0)
  const [isExpanded, setIsExpanded] = useState<boolean>(isFirst)
  const [showSources, setShowSources] = useState<boolean>(false)

  const publishedLabel = useMemo(() => {
    try {
      return new Date(latestArticle.publishedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }, [latestArticle?.publishedAt])

  const heroImage = useMemo(() => {
    const MIN_W = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_WIDTH ?? '320')
    const MIN_H = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_HEIGHT ?? '200')
    const allowLowResThumb = !isExpanded
    const articles = cluster.articles || []
    for (const article of articles) {
      const url = article.urlToImage
      if (!url || url.includes('placehold.co')) continue
      if (!allowLowResThumb) {
        if (article.imageWidth && article.imageWidth < MIN_W) continue
        if (article.imageHeight && article.imageHeight < MIN_H) continue
      }
      return {
        url,
        alt: `${cluster.clusterTitle} – ${article.source?.name || 'Source image'}`,
      }
    }
    // Fallback: pick the first non-placeholder cluster image URL
    const fallbackUrl = (cluster.imageUrls || []).find((u) => u && !u.includes('placehold.co'))
    if (fallbackUrl) {
      return { url: fallbackUrl, alt: `${cluster.clusterTitle} preview image` }
    }
    return null
  }, [cluster.articles, cluster.clusterTitle, cluster.imageUrls, isExpanded])

  const clusterBadge = (
    <Badge variant="secondary" className="uppercase tracking-wide">
      {isFirst ? 'Breaking' : 'Top Story'}
    </Badge>
  )

  const clusterMeta = (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
      <span>
        Related coverage · {sourceCount} stor{sourceCount !== 1 ? 'ies' : 'y'}
      </span>
      {publishedLabel && <span>Updated {publishedLabel}</span>}
    </div>
  )

  const toggleButton = !isFirst ? (
    <Button
      size="sm"
      variant={isExpanded ? 'ghost' : 'outline'}
      onClick={() => {
        const newExpanded = !isExpanded
        setIsExpanded(newExpanded)
        onExpansionChange?.(newExpanded)
      }}
      className="h-8 px-3 text-xs"
      aria-expanded={isExpanded}
    >
      {isExpanded ? 'Collapse story' : `Open ${sourceCount} related stories`}
    </Button>
  ) : null

  // Short summary for collapsed state (lazy-loaded)
  const { elementRef: shortRef, summary: shortSummary } = useLazySummary({
    cluster,
    variant: 'cluster',
    length: 'short',
    disabled: false,
    eager: isFirst || !isExpanded,
  })

  const collapsedContent = (
    <CardContent className="p-0">
      <div
        ref={shortRef}
        className={`flex flex-col gap-3 p-3 ${
          heroImage ? 'sm:flex-row sm:items-center sm:gap-4 ' : ''
        }`}
      >
        {heroImage && (
          <div className="sm:w-36">
            <div className="relative h-24 overflow-hidden rounded-lg sm:h-20">
              <NextImage
                src={heroImage!.url}
                alt={heroImage!.alt}
                fill
                sizes="(min-width: 640px) 20vw, 70vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                priority={isFirst}
              />
              <div className="absolute left-0 top-0 rounded-br-lg bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                Cluster
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          {shortSummary && (
            <p className="text-[13px] md:text-sm text-foreground/90 line-clamp-3 md:line-clamp-4">
              {shortSummary}
            </p>
          )}
        </div>
      </div>
    </CardContent>
  )

  const expandedContent = (
    <CardContent className="p-0">
      <div className="flex flex-col gap-6 p-6">
        <div
          className={`grid gap-6 ${
            hasImages
              ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch'
              : ''
          }`}
        >
          {hasImages && (
            <ImageCollage cluster={cluster} onChangeCount={(count) => setHasImages(count > 0)} />
          )}
          <div className="flex flex-col gap-6 lg:h-full lg:justify-between">
            <ClusterSummary cluster={cluster} eager />
          </div>
        </div>

        {/* Collapsible Sources */}
        <div className="border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            aria-expanded={showSources}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-accent transition-colors cursor-pointer"
          >
            Coverage from {sourceCount} sources
            <span className={`transition-transform ${showSources ? 'rotate-180' : ''}`} aria-hidden>
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>
        </div>
        {showSources && (
          <SourceArticleList articles={cluster.articles} className="pt-2" showHeader={false} />
        )}
      </div>
    </CardContent>
  )

  const cardInteractiveProps = !isExpanded && {
    role: 'button' as const,
    tabIndex: 0,
    'aria-expanded': false,
    'aria-label': `Open cluster: ${cluster.clusterTitle}`,
    onClick: () => {
      setIsExpanded(true)
      onExpansionChange?.(true)
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setIsExpanded(true)
        onExpansionChange?.(true)
      }
    },
  }

  return (
    <section>
      <Card
        className={
          'relative h-full overflow-hidden border-border/60 shadow-sm transition-all duration-200 hover:border-border hover:shadow-md hover:ring-1 hover:ring-accent/30 ' +
          (!isExpanded ? 'group cursor-pointer focus-visible:ring-2 focus-visible:ring-ring' : '')
        }
        {...cardInteractiveProps}
      >
        {!isExpanded && !isFirst && (
          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite] dark:via-white/5" />
          </div>
        )}
        <CardHeader
          className={`gap-3 border-b border-border/60 bg-muted/40 backdrop-blur ${
            isExpanded ? '' : 'p-4 sm:p-5'
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {clusterBadge}
                {cluster.severity?.label && (
                  <span className="inline-flex items-center rounded-full border border-border/60 px-3 py-1 text-[11px] uppercase tracking-wide text-foreground/70">
                    {cluster.severity.label}
                  </span>
                )}
              </div>
              <CardTitle
                className={`${
                  isExpanded ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
                } font-semibold leading-tight text-foreground`}
              >
                {cluster.clusterTitle}
              </CardTitle>
              {isExpanded ? (
                shortSummary ? (
                  <p className="text-sm text-muted-foreground line-clamp-2">{shortSummary}</p>
                ) : (
                  clusterMeta
                )
              ) : null}
            </div>
            <div className="flex items-start justify-end sm:pt-1">{toggleButton}</div>
          </div>
        </CardHeader>
        {isExpanded ? expandedContent : collapsedContent}
      </Card>
    </section>
  )
}
