'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Article } from '@/types'
import LazySummary from './LazySummary'

interface ArticleCardProps {
  article: Article
  showSummary?: boolean
}

export default function ArticleCard({ article, showSummary = true }: ArticleCardProps) {
  const hasValidImage =
    article.urlToImage &&
    article.urlToImage.trim() !== '' &&
    (article.urlToImage.startsWith('http://') || article.urlToImage.startsWith('https://'))

  return (
    <article className="group flex flex-col bg-[var(--card-background)] rounded-xl overflow-hidden border border-[var(--card-border)] transition-all duration-300 hover:border-[var(--accent)] hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1">
      {hasValidImage && (
        <div className="relative h-48">
          <Image
            src={article.urlToImage}
            alt={article.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            onError={(e) => console.log('Image Error:', e)}
          />
        </div>
      )}

      <div className="p-6 flex flex-col flex-grow">
        <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)] mb-3">
          <span className="inline-block px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] rounded-md font-medium border border-[var(--accent)]/20">
            {article.category}
          </span>
          <span>•</span>
          <span className="truncate">{article.source.name}</span>
        </div>

        <h3 className="text-lg font-bold mb-2 flex-grow line-clamp-3 text-[var(--foreground)]">
          {article.title}
        </h3>

        <time className="text-xs text-[var(--muted-foreground)] mb-4">
          {new Date(article.publishedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>

        <p className="text-sm text-[var(--muted-foreground)] line-clamp-3 mb-4">
          {article.description}
        </p>

        {showSummary && <LazySummary articleId={article.id} content={article.content} />}

        <footer className="mt-auto pt-4">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            Read Full Article →
          </a>
        </footer>
      </div>
    </article>
  )
}
