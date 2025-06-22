import React from 'react'
import { Article } from '@/types'
import ArticleCard from './ArticleCard'
import StoryClusterCard from './StoryClusterCard'
import { StoryCluster } from '@/types'

interface NewsListProps {
  storyClusters: StoryCluster[]
  unclusteredArticles: Article[]
}

export default function NewsList({ storyClusters, unclusteredArticles }: NewsListProps) {
  return (
    <div className="space-y-12">
      {/* Render Clustered Stories First */}
      {storyClusters.map((cluster, index) => (
        <StoryClusterCard key={index} cluster={cluster} />
      ))}

      {/* Divider */}
      {storyClusters.length > 0 && unclusteredArticles.length > 0 && (
        <div className="relative text-center my-16">
          <hr className="border-t border" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-4 text-sm font-medium text-muted-foreground">
            Individual Headlines
          </span>
        </div>
      )}

      {/* Render Individual Stories */}
      {unclusteredArticles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {unclusteredArticles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  )
}
