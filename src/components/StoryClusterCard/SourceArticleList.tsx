'use client'

import { Article } from '@/types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const formatPublishedAt = (publishedAt: string) =>
  new Date(publishedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const summarizeArticleMeta = (article: Article) =>
  [article.description, article.content]
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?.replace(/\s+/g, ' ')
    .trim()

const SourceArticle = ({
  article,
  index,
  variant,
}: {
  article: Article
  index: number
  variant: 'card' | 'modal'
}) => {
  const isModal = variant === 'modal'
  const snippet = isModal ? summarizeArticleMeta(article) : undefined

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group block rounded-lg border border-border/60 bg-background/80 transition-all duration-200 hover:border-accent/50 hover:shadow-sm',
        isModal ? 'p-4 sm:p-5' : 'p-3'
      )}
    >
      <div className={cn('flex items-start gap-3', isModal && 'gap-4')}>
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full bg-accent/10 font-medium text-accent',
            isModal ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-sm'
          )}
        >
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'font-semibold text-foreground transition-colors group-hover:text-accent',
              isModal ? 'mb-2 line-clamp-3 text-lg leading-7' : 'mb-1 line-clamp-2 text-sm'
            )}
          >
            {article.title}
          </p>
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground',
              isModal ? 'text-base' : 'text-xs'
            )}
          >
            <span className="font-medium">{article.source.name}</span>
            <span aria-hidden>•</span>
            <span>{formatPublishedAt(article.publishedAt)}</span>
          </div>
          {snippet && (
            <p className="mt-3 line-clamp-3 text-base leading-7 text-muted-foreground">
              {snippet}
            </p>
          )}
        </div>
        <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
}

interface SourceArticleListProps {
  articles: Article[]
  className?: string
  showHeader?: boolean
  collapsible?: boolean
  variant?: 'card' | 'modal'
}

const SourceArticleList = ({
  articles,
  className,
  showHeader = true,
  collapsible = false,
  variant = 'card',
}: SourceArticleListProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRevealed, setIsRevealed] = useState(!collapsible)
  const sourceCount = articles.length
  const isModal = variant === 'modal'
  if (!articles || articles.length === 0) {
    return null
  }

  const visibleArticles = isExpanded ? articles : articles.slice(0, 4)
  const containerClassName = cn('flex flex-col gap-4', className)

  return (
    <div className={containerClassName}>
      {collapsible && (
        <div className="border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={() => setIsRevealed((v) => !v)}
            aria-expanded={isRevealed}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-accent transition-colors cursor-pointer"
          >
            Coverage from {sourceCount} sources
            <span className={`transition-transform ${isRevealed ? 'rotate-180' : ''}`} aria-hidden>
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>
        </div>
      )}

      {isRevealed && (
        <>
          {showHeader && !collapsible && (
            <div
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground',
                isModal && 'border-t border-border/60 pt-6'
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center gap-2 font-medium text-foreground',
                  isModal ? 'text-lg' : 'text-sm'
                )}
              >
                Coverage from {sourceCount} sources
                <span className="hidden sm:inline-flex h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              </span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Live updates</span>
            </div>
          )}

          <div className={cn(isModal ? 'space-y-3' : 'space-y-2')}>
            {visibleArticles.map((article, index) => (
              <SourceArticle key={article.id} article={article} index={index} variant={variant} />
            ))}
          </div>

          {articles.length > 4 && (
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full cursor-pointer"
              >
                {isExpanded ? 'Show Less' : `View ${articles.length - 4} More Sources`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SourceArticleList
