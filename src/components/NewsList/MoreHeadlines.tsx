import React from 'react'
import { Article } from '@/types'
import ArticleCard from '@/components/ArticleCard'

interface MoreHeadlinesProps {
  articles: Article[]
}

export default function MoreHeadlines({ articles }: MoreHeadlinesProps) {
  if (!articles.length) return null

  const MIN_W = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_WIDTH ?? '320')
  const MIN_H = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_HEIGHT ?? '200')
  const THUMB_W = Number(process.env.NEXT_PUBLIC_THUMB_IMAGE_WIDTH ?? '160')
  const THUMB_H = Number(process.env.NEXT_PUBLIC_THUMB_IMAGE_HEIGHT ?? '120')

  const big: Article[] = []
  const thumb: Article[] = []
  const none: Article[] = []
  for (const a of articles) {
    const hasUrl = a.urlToImage && a.urlToImage.trim() !== '' && !a.urlToImage.includes('placehold.co')
    const w = a.imageWidth || 0
    const h = a.imageHeight || 0
    if (hasUrl && w >= MIN_W && h >= MIN_H) big.push(a)
    else if (hasUrl && ((w >= THUMB_W && h >= THUMB_H) || (!w && !h))) thumb.push(a)
    else none.push(a)
  }
  const ordered: Array<{ a: Article; v: 'default' | 'thumb' | 'none' }> = [
    ...big.map((a) => ({ a, v: 'default' as const })),
    ...thumb.map((a) => ({ a, v: 'thumb' as const })),
    ...none.map((a) => ({ a, v: 'none' as const })),
  ]

  return (
    <section>
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-muted rounded-full"></span>
        More Headlines
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4 items-start">
        {ordered.map(({ a, v }, index) => (
          <ArticleCard
            key={a.id}
            article={a}
            eager={false}
            imageVariant={v === 'thumb' ? 'thumb' : 'default'}
          />
        ))}
      </div>
    </section>
  )
}
