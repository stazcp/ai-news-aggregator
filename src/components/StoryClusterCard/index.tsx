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
  const latestArticle = cluster.articles[0] // Assuming articles are sorted by date
  const hasImages = !!cluster?.imageUrls?.length

  return (
    <section className="mb-16 border-b border-border pb-16 last:border-b-0">
      {/* Story Header */}
      <header className="mb-6">
        <div className="flex items-center gap-4 mb-3">
          <Badge variant="secondary">{isFirst ? 'Breaking News' : 'Top Story'}</Badge>
          <span className="text-sm text-muted-foreground">
            {sourceCount} source{sourceCount !== 1 ? 's' : ''} •{' '}
            {new Date(latestArticle.publishedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight mb-4">
          {cluster.clusterTitle}
        </h1>
      </header>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {hasImages ? (
          <div className="lg:col-span-1">
            <ImageCollage cluster={cluster} />
          </div>
        ) : (
          <SourceArticleList articles={cluster.articles} />
        )}

        {/* Right Column: AI Summary with Lazy Loading */}
        <div className="lg:col-span-2">
          <ClusterSummary cluster={cluster} eager={isFirst} />
        </div>
        {hasImages && (
          <div className="lg:col-span-3">{<SourceArticleList articles={cluster.articles} />}</div>
        )}
      </div>
    </section>
  )
}
