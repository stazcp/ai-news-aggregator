'use client'

import { StoryCluster } from '@/types'
import ImageCollage from './ImageCollage'
import SynthesizedSummary from './SynthesizedSummary'
import SourceArticleList from './SourceArticleList'

export default function StoryClusterCard({ cluster }: { cluster: StoryCluster }) {
  if (!cluster.articles || cluster.articles.length === 0) {
    return null
  }

  const sourceCount = cluster.articles.length
  const latestArticle = cluster.articles[0] // Assuming articles are sorted by date

  return (
    <section className="mb-16 border-b border-border pb-16 last:border-b-0">
      {/* Story Header */}
      <header className="mb-6">
        <div className="flex items-center gap-4 mb-3">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-accent/20 text-accent border border-accent/30">
            Top Story
          </span>
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
        {/* Left Column: Image Collage */}
        <div className="lg:col-span-1">
          <ImageCollage cluster={cluster} />
        </div>

        {/* Right Column: AI Summary */}
        <div className="lg:col-span-2">
          <SynthesizedSummary summary={cluster.summary} />
        </div>
      </div>

      {/* Source Articles Section */}
      <div className="bg-secondary/30 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            Coverage from {sourceCount} Sources
          </h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 bg-accent rounded-full"></div>
            Live Coverage
          </div>
        </div>
        <SourceArticleList articles={cluster.articles} />
      </div>
    </section>
  )
}
