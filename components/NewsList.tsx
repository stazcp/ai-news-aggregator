import React from 'react'
import { Article } from '@/types'
import ArticleCard from './ArticleCard'

interface NewsListProps {
  articles: Article[]
}

export default function NewsList({ articles }: NewsListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  )
}
