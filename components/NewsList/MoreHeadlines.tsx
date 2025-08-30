import React from 'react'
import { Article } from '@/types'
import ArticleCard from '@/components/ArticleCard'

interface MoreHeadlinesProps {
  articles: Article[]
}

export default function MoreHeadlines({ articles }: MoreHeadlinesProps) {
  if (!articles.length) return null

  return (
    <section>
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-muted rounded-full"></span>
        More Headlines
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {articles.map((article, index) => (
          <ArticleCard key={article.id} article={article} showSummary={index < 4} eager={false} />
        ))}
      </div>
    </section>
  )
}
