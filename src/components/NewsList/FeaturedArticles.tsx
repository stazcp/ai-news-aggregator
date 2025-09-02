import React from 'react'
import { Article } from '@/types'
import ArticleCard from '@/components/ArticleCard'

interface FeaturedArticlesProps {
  articles: Article[]
}

export default function FeaturedArticles({ articles }: FeaturedArticlesProps) {
  if (!articles.length) return null

  return (
    <section>
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-accent rounded-full"></span>
        Featured Stories
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {articles.map((article, index) => (
          <ArticleCard key={article.id} article={article} showSummary={true} eager={index < 2} />
        ))}
      </div>
    </section>
  )
}
