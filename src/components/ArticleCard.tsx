'use client'

import { useState } from 'react'
import { Article } from '@/types'
import { Card, CardContent } from '@/components/ui'
import ArticleImage from './ArticleCard/ArticleImage'
import ArticleHeader from './ArticleCard/ArticleHeader'
import ArticleContent from './ArticleCard/ArticleContent'
import ArticleFooter from './ArticleCard/ArticleFooter'

interface ArticleCardProps {
  article: Article
  eager?: boolean // For eager loading of summaries
  onNoImage?: (id: string) => void
  imageVariant?: 'default' | 'thumb'
}

export default function ArticleCard({
  article,
  eager = false,
  onNoImage,
  imageVariant = 'default',
}: ArticleCardProps) {
  const [imageError, setImageError] = useState(false)

  // Check if article has a valid image (not a placeholder)
  const hasValidImage =
    article.urlToImage &&
    !article.urlToImage.includes('placehold.co') &&
    article.urlToImage.trim() !== '' &&
    !imageError

  // Render compact card for articles without images or failed/too-small images
  if (!hasValidImage) {
    return (
      <Card className="group flex flex-col overflow-hidden transition-all duration-300 hover:border-accent hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5">
        {/* Compact content: no flex-grow so the card doesn't stretch to image-card height */}
        <CardContent className="p-4 flex flex-col">
          <ArticleHeader
            category={article.category}
            sourceName={article.source.name}
            publishedAt={article.publishedAt}
            variant="compact"
          />

          <ArticleContent article={article} eager={eager} variant="compact" />

          <ArticleFooter url={article.url} variant="compact" />
        </CardContent>
      </Card>
    )
  }

  // Render full-size card for articles with images
  return (
    <Card className="group flex flex-col overflow-hidden transition-all duration-300 hover:border-accent hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1">
      <div className={`relative ${imageVariant === 'thumb' ? 'h-36 lg:h-40' : 'h-56 lg:h-64'}`}>
        <ArticleImage
          src={article.urlToImage || ''}
          alt={article.title}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setImageError(true)}
          onNoImage={() => {
            setImageError(true)
            onNoImage?.(article.id)
          }}
        />
      </div>

      <CardContent className="p-6 flex flex-col flex-grow">
        <ArticleHeader
          category={article.category}
          sourceName={article.source.name}
          publishedAt={article.publishedAt}
          variant="full"
        />

        <ArticleContent article={article} eager={eager} variant="full" />

        <ArticleFooter url={article.url} variant="full" />
      </CardContent>
    </Card>
  )
}
