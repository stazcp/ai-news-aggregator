'use client'

import { StoryCluster } from '@/types'
import ImageCollage from './ImageCollage'
import SynthesizedSummary from './SynthesizedSummary'
import SourceArticleList from './SourceArticleList'

export default function StoryClusterCard({ cluster }: { cluster: StoryCluster }) {
  if (!cluster.articles || cluster.articles.length === 0) {
    return null
  }

  return (
    <section className="mb-12 p-6 bg-[var(--card-background)] border border-[var(--card-border)] rounded-2xl shadow-lg shadow-black/10">
      <header className="mb-4">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">{cluster.clusterTitle}</h2>
      </header>

      <ImageCollage cluster={cluster} />
      <SynthesizedSummary summary={cluster.summary} />
      <SourceArticleList articles={cluster.articles} />
    </section>
  )
}
