'use client'

import React from 'react'
import { StoryCluster } from '@/types'
import ImageCollage from './ImageCollage'
import ClusterSummary from '@/components/Summary/ClusterSummary'
import SourceArticleList from './SourceArticleList'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'

interface StoryClusterCardProps {
  cluster: StoryCluster
  isFirst?: boolean // Indicates if this is the first story (above-the-fold)
}

export default function StoryClusterCard({ cluster, isFirst = false }: StoryClusterCardProps) {
  if (!cluster.articles || cluster.articles.length === 0) return null

  const sourceCount = cluster.articles.length
  const latestArticle = cluster.articles[0]
  const [hasImages, setHasImages] = React.useState<boolean>((cluster?.imageUrls?.length || 0) > 0)

  const publishedLabel = React.useMemo(() => {
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

  return (
    <section className="last:pb-0">
      <Card className="overflow-hidden border-border/60 shadow-sm transition-all duration-200 hover:border-border hover:shadow-md">
        <CardHeader className="gap-3 border-b border-border/60 bg-muted/40 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="secondary" className="uppercase tracking-wide">
              {isFirst ? 'Breaking' : 'Top Story'}
            </Badge>
            <span>
              {sourceCount} source{sourceCount !== 1 ? 's' : ''}
              {publishedLabel ? ` • ${publishedLabel}` : ''}
            </span>
            {cluster.severity?.label && (
              <span className="inline-flex items-center rounded-full border border-border/60 px-3 py-1 text-[11px] uppercase tracking-wide text-foreground/70">
                {cluster.severity.label}
              </span>
            )}
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-semibold leading-tight text-foreground">
            {cluster.clusterTitle}
          </CardTitle>
          {latestArticle?.description && (
            <p className="text-sm text-muted-foreground/80 line-clamp-2">
              {latestArticle.description}
            </p>
          )}
        </CardHeader>
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
                <ImageCollage
                  cluster={cluster}
                  onChangeCount={(count) => setHasImages(count > 0)}
                />
              )}
              <div className="flex flex-col gap-6 lg:h-full lg:justify-between">
                <ClusterSummary cluster={cluster} eager={isFirst} />
                {!hasImages && (
                  <SourceArticleList
                    articles={cluster.articles}
                    className="border-t border-border/60 pt-6"
                  />
                )}
              </div>
            </div>

            {hasImages && (
              <SourceArticleList
                articles={cluster.articles}
                className="border-t border-border/60 pt-6"
              />
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
