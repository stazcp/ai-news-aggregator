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
      {/* Render Clustered Stories First */}
      {storyClusters.map((cluster, index) => (
        <StoryClusterCard key={index} cluster={cluster} isFirst={index === 0} />
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

      {/* Render Individual Stories with Mixed Layout */}
      {unclusteredArticles.length > 0 && (
        <div className="space-y-8">
          {/* Featured Articles with Images */}
          {articlesWithImages.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-accent rounded-full"></span>
                Featured Stories
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {articlesWithImages.map((article, index) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    showSummary={true}
                    eager={index < 2} // Eager load first 2 featured articles
                  />
                ))}
              </div>
            </div>
          )}

          {/* Compact Articles without Images */}
          {articlesWithoutImages.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-muted rounded-full"></span>
                More Headlines
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {articlesWithoutImages.map((article, index) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    showSummary={index < 4} // Show summary for first 4 compact articles only
                    eager={false} // Lazy load compact articles
                  />
                ))}
              </div>
            </div>
          )}

          {/* Alternative: Mixed layout if you prefer all articles together */}
          {/* Uncomment this section and comment the above if you want mixed layout */}
          {/*
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 auto-rows-min">
            {unclusteredArticles.map((article, index) => {
              const hasImage = article.urlToImage && 
                !article.urlToImage.includes('placehold.co') && 
                article.urlToImage.trim() !== ''
              
              return (
                <div 
                  key={article.id} 
                  className={hasImage ? 'col-span-1 sm:col-span-2 md:col-span-2 lg:col-span-2' : 'col-span-1'}
                >
                  <ArticleCard
                    article={article}
                    showSummary={true}
                    eager={index < 2}
                  />
                </div>
              )
            })}
          </div>
          */}
        </div>
      )}
    </div>
  )
}
