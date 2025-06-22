'use client'

import { StoryCluster, Article } from '@/types'
import { useState } from 'react'

const SourceArticle = ({ article }: { article: Article }) => (
  <a
    href={article.url}
    target="_blank"
    rel="noopener noreferrer"
    className="block p-3 rounded-lg bg-[var(--card-background)] border border-[var(--card-border)] hover:bg-[var(--accent)]/10 transition-colors"
  >
    <p className="font-semibold text-sm text-[var(--foreground)] truncate">{article.title}</p>
    <p className="text-xs text-[var(--muted-foreground)]">{article.source.name}</p>
  </a>
)

export default function StoryClusterCard({ cluster }: { cluster: StoryCluster }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!cluster.articles || cluster.articles.length === 0) {
    return null
  }

  const visibleArticles = isExpanded ? cluster.articles : cluster.articles.slice(0, 3)

  return (
    <section className="mb-12 p-6 bg-[var(--card-background)] border border-[var(--card-border)] rounded-2xl shadow-lg shadow-black/10">
      <header className="mb-4">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">{cluster.clusterTitle}</h2>
      </header>

      <div
        className="p-4 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20"
        style={{ animation: 'pulse-border 3s infinite' }}
      >
        <h4 className="flex items-center text-sm font-semibold text-[var(--accent)] mb-2">
          <span className="mr-2">✨</span>
          Synthesized AI Summary
        </h4>
        <p className="text-md text-[var(--muted-foreground)] leading-relaxed">{cluster.summary}</p>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-[var(--muted-foreground)] mb-2">
          Sources in this story:
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleArticles.map((article) => (
            <SourceArticle key={article.id} article={article} />
          ))}
        </div>
      </div>

      {cluster.articles.length > 3 && (
        <footer className="text-center mt-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            {isExpanded ? 'Show Less' : `Show ${cluster.articles.length - 3} More Sources...`}
          </button>
        </footer>
      )}
    </section>
  )
}
