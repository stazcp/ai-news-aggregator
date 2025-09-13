import React from 'react'
import { Article } from '@/types'
import ArticleCard from '@/components/ArticleCard'

interface FeaturedArticlesProps {
  articles: Article[]
}

export default function FeaturedArticles({ articles }: FeaturedArticlesProps) {
  if (!articles.length) return null

  // Track articles that lose their image at render time; sort them last
  const [demoted, setDemoted] = React.useState<Set<string>>(new Set())
  const handleNoImage = (id: string) => {
    setDemoted((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }
  const [withImg, noImg] = React.useMemo(() => {
    const a: Article[] = []
    const b: Article[] = []
    for (const x of articles) (demoted.has(x.id) ? b : a).push(x)
    return [a, b]
  }, [articles, demoted])

  return (
    <section>
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-accent rounded-full"></span>
        Featured Stories
      </h3>
      {/* Primary featured grid (image cards only) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-6 items-start mb-6">
        {withImg.map((article, index) => (
          <ArticleCard
            key={article.id}
            article={article}
            showSummary={true}
            eager={index < 2}
            onNoImage={handleNoImage}
          />
        ))}
      </div>

      {/* Demoted (no-image) featured items grouped in a tighter 2-up grid */}
      {noImg.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {noImg.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              showSummary={false}
              eager={false}
            />
          ))}
        </div>
      )}
    </section>
  )
}
