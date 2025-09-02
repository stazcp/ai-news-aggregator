'use client'

import { Article } from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '../ui'

const SourceArticle = ({ article, index }: { article: Article; index: number }) => (
  <a
    href={article.url}
    target="_blank"
    rel="noopener noreferrer"
    className="group block p-4 rounded-lg bg-background border hover:border-accent/50 transition-all duration-200 hover:shadow-md"
  >
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-sm font-medium text-accent">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground group-hover:text-accent transition-colors line-clamp-2 mb-1">
          {article.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{article.source.name}</span>
          <span>•</span>
          <span>
            {new Date(article.publishedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </div>
    </div>
  </a>
)

const SourceArticleList = ({ articles }: { articles: Article[] }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const sourceCount = articles.length
  if (!articles || articles.length === 0) {
    return null
  }

  const visibleArticles = isExpanded ? articles : articles.slice(0, 4)

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Coverage from {sourceCount} Sources</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 bg-accent rounded-full"></div>
            Live Coverage
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {visibleArticles.map((article, index) => (
            <SourceArticle key={article.id} article={article} index={index} />
          ))}

          {articles.length > 4 && (
            <div className="pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full"
              >
                {isExpanded ? 'Show Less' : `View ${articles.length - 4} More Sources`}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default SourceArticleList
