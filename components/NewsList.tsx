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
  const articlesWithImages = unclusteredArticles.filter(
    (article) =>
      article.urlToImage &&
      !article.urlToImage.includes('placehold.co') &&
      article.urlToImage.trim() !== ''
  )

  const articlesWithoutImages = unclusteredArticles.filter(
    (article) =>
      !article.urlToImage ||
      article.urlToImage.includes('placehold.co') ||
      article.urlToImage.trim() === ''
  )

  return (
    <div className="space-y-12">
      {storyClusters.map((cluster, index) => (
        <StoryClusterCard key={index} cluster={cluster} isFirst={index === 0} />
      ))}

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
