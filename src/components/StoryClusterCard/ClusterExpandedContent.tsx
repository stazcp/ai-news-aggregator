'use client'

import { useEffect, useState } from 'react'
import { StoryCluster } from '@/types'
import ImageCollage from './ImageCollage'
import RelatedCoveragePills from './RelatedCoveragePills'
import ClusterSummary from '@/components/Summary/ClusterSummary'
import SourceArticleList from './SourceArticleList'

interface ClusterExpandedContentProps {
  cluster: StoryCluster
  relatedClusters?: StoryCluster[]
  onRelatedClick?: (id: string) => void
  variant?: 'card' | 'modal'
}

export default function ClusterExpandedContent({
  cluster,
  relatedClusters,
  onRelatedClick,
  variant = 'card',
}: ClusterExpandedContentProps) {
  const [hasImages, setHasImages] = useState((cluster.imageUrls?.length ?? 0) > 0)
  useEffect(() => setHasImages((cluster.imageUrls?.length ?? 0) > 0), [cluster.imageUrls])
  const articles = cluster.articles || []
  const isModal = variant === 'modal'

  return (
    <div className={`flex flex-col ${isModal ? 'gap-8 p-5 sm:p-7' : 'gap-6 p-6'}`}>
      <div
        className={`grid gap-6 ${
          hasImages
            ? isModal
              ? 'xl:grid-cols-[minmax(32rem,1.2fr)_minmax(26rem,0.9fr)] xl:items-start'
              : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch'
            : ''
        }`}
      >
        {hasImages && (
          <ImageCollage
            cluster={cluster}
            variant={variant}
            onChangeCount={(count) => setHasImages(count > 0)}
          />
        )}
        <div className="flex flex-col gap-6 lg:h-full lg:justify-between">
          <ClusterSummary cluster={cluster} eager />
        </div>
      </div>

      {relatedClusters && relatedClusters.length > 0 && (
        <RelatedCoveragePills clusters={relatedClusters} onRelatedClick={onRelatedClick} />
      )}

      <SourceArticleList
        articles={articles}
        collapsible={!isModal}
        showHeader={isModal}
        variant={variant}
      />
    </div>
  )
}
