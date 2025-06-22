'use client'

import { Article } from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const SourceArticle = ({ article }: { article: Article }) => (
  <a
    href={article.url}
    target="_blank"
    rel="noopener noreferrer"
    className="block p-3 rounded-lg bg-secondary border hover:bg-accent/10 transition-colors"
  >
    <p className="font-semibold text-sm text-foreground truncate">{article.title}</p>
    <p className="text-xs text-muted-foreground">{article.source.name}</p>
  </a>
)

const SourceArticleList = ({ articles }: { articles: Article[] }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!articles || articles.length === 0) {
    return null
  }

  const visibleArticles = isExpanded ? articles : articles.slice(0, 3)

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-muted-foreground mb-2">Sources in this story:</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleArticles.map((article) => (
          <SourceArticle key={article.id} article={article} />
        ))}
      </div>

      {articles.length > 3 && (
        <footer className="text-center mt-4">
          <Button variant="link" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? 'Show Less' : `Show ${articles.length - 3} More Sources...`}
          </Button>
        </footer>
      )}
    </div>
  )
}

export default SourceArticleList
