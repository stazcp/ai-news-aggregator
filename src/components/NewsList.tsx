import React from 'react'
import { Article } from '@/types'
import StoryClusterCard from './StoryClusterCard'
import { StoryCluster } from '@/types'
import FeaturedArticles from './NewsList/FeaturedArticles'
import MoreHeadlines from './NewsList/MoreHeadlines'
import SectionDivider from './NewsList/SectionDivider'

interface NewsListProps {
  storyClusters: StoryCluster[]
  unclusteredArticles: Article[]
}

export default function NewsList({ storyClusters, unclusteredArticles }: NewsListProps) {
  // Separate articles with and without images for better layout
  const MIN_W = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_WIDTH ?? '320')
  const MIN_H = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_HEIGHT ?? '200')

  const articlesWithImages = unclusteredArticles.filter((article) => {
    // Only promote to Featured when we have a valid image URL AND known sufficient dimensions.
    const hasUrl =
      article.urlToImage &&
      !article.urlToImage.includes('placehold.co') &&
      article.urlToImage.trim() !== ''
    if (!hasUrl) return false
    if (!article.imageWidth || !article.imageHeight) return false
    return article.imageWidth >= MIN_W && article.imageHeight >= MIN_H
  })

  const articlesWithoutImages = unclusteredArticles.filter((article) => {
    const missingUrl =
      !article.urlToImage ||
      article.urlToImage.includes('placehold.co') ||
      article.urlToImage.trim() === ''
    const unknownDims = !article.imageWidth || !article.imageHeight
    const tooSmall =
      !!article.imageWidth &&
      !!article.imageHeight &&
      (article.imageWidth < MIN_W || article.imageHeight < MIN_H)
    return missingUrl || unknownDims || tooSmall
  })

  return (
    <div className="space-y-10 lg:space-y-12">
      {storyClusters.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className="h-6 w-1 rounded-full bg-accent"></span>
            AI-Generated Clusters
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {storyClusters.map((cluster, index) => (
              <StoryClusterCard key={index} cluster={cluster} isFirst={index === 0} />
            ))}
          </div>
        </section>
      )}
      {storyClusters.length > 0 && unclusteredArticles.length > 0 && <SectionDivider />}
      {unclusteredArticles.length > 0 && (
        <div className="space-y-8">
          <FeaturedArticles articles={articlesWithImages} />
          <MoreHeadlines articles={articlesWithoutImages} />
        </div>
      )}
    </div>
  )
}
