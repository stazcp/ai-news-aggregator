'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Article } from '@/types'
import LazySummary from './LazySummary'
import { Badge } from '@/components/ui'

interface ArticleCardProps {
  article: Article
  showSummary?: boolean
  eager?: boolean // For eager loading of summaries
}

export default function ArticleCard({
  article,
  showSummary = true,
  eager = false,
}: ArticleCardProps) {
  // Check if article has a valid image (not a placeholder)
  const hasValidImage =
    article.urlToImage &&
    !article.urlToImage.includes('placehold.co') &&
    article.urlToImage.trim() !== ''

  // Render compact card for articles without images
  if (!hasValidImage) {
    return (
      <article className="group flex flex-col bg-card rounded-lg overflow-hidden border transition-all duration-300 hover:border-accent hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 min-h-[280px]">
        <div className="p-4 flex flex-col flex-grow">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Badge variant="outline" className="text-accent border-accent/20 bg-accent/10">
              {article.category}
            </Badge>
            <span>•</span>
            <span className="truncate text-xs">{article.source.name}</span>
          </div>

          <h3 className="text-base font-bold mb-2 flex-grow line-clamp-4 text-foreground leading-tight">
            {article.title}
          </h3>

          <time className="text-xs text-muted-foreground mb-3">
            {new Date(article.publishedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </time>

          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{article.description}</p>

          {showSummary && (
            <LazySummary
              articleId={article.id}
              content={article.content ?? ''}
              eager={eager}
              className="text-xs"
            />
          )}

          <footer className="mt-auto pt-3">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
            >
              Read Article →
            </a>
          </footer>
        </div>
      </article>
    )
  }

  // Render full-size card for articles with images
  return (
    <article className="group flex flex-col bg-card rounded-xl overflow-hidden border transition-all duration-300 hover:border-accent hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1">
      <div className="relative h-56 lg:h-64">
        <Image
          src={article.urlToImage || ''}
          alt={article.title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          onError={(e) => {
            console.warn(`Failed to load image for article: ${article.title}`)
            // Don't hide the container anymore, let the component re-render as compact
          }}
        />
      </div>

      <div className="p-6 flex flex-col flex-grow">
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <Badge variant="outline" className="text-accent border-accent/20 bg-accent/10">
            {article.category}
          </Badge>
          <span>•</span>
          <span className="truncate">{article.source.name}</span>
        </div>

        <h3 className="text-lg font-bold mb-2 flex-grow line-clamp-3 text-foreground">
          {article.title}
        </h3>

        <time className="text-xs text-muted-foreground mb-4">
          {new Date(article.publishedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>

        <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{article.description}</p>

        {showSummary && (
          <LazySummary articleId={article.id} content={article.content ?? ''} eager={eager} />
        )}

        <footer className="mt-auto pt-4">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm font-semibold text-accent hover:underline"
          >
            Read Full Article →
          </a>
        </footer>
      </div>
    </article>
  )
}
