'use client'

import Image from 'next/image'
import { useState } from 'react'
import { ENV_DEFAULTS, envNumber } from '@/lib/config/env'

interface ArticleImageProps {
  src: string
  alt: string
  className?: string
  onError?: () => void
  onNoImage?: () => void
}

export default function ArticleImage({ src, alt, className = '', onError, onNoImage }: ArticleImageProps) {
  const MIN_W = envNumber(
    'NEXT_PUBLIC_MIN_IMAGE_WIDTH',
    ENV_DEFAULTS.articleCardMinImageWidth
  )
  const MIN_H = envNumber(
    'NEXT_PUBLIC_MIN_IMAGE_HEIGHT',
    ENV_DEFAULTS.articleCardMinImageHeight
  )
  const QUALITY = envNumber('NEXT_PUBLIC_IMAGE_QUALITY', ENV_DEFAULTS.nextPublicImageQuality)
  const [tooSmall, setTooSmall] = useState(false)

  const handleError = () => {
    console.warn(`Failed to load image for article: ${alt}`)
    setTooSmall(true)
    onError?.()
    onNoImage?.()
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget as HTMLImageElement
    const nw = img?.naturalWidth || 0
    const nh = img?.naturalHeight || 0
    // Only enforce if we have valid dimensions
    if (nw > 0 && nh > 0 && (nw < MIN_W || nh < MIN_H)) {
      setTooSmall(true)
      onNoImage?.()
    }
  }

  if (tooSmall) {
    return <div className={`w-full h-full bg-muted ${className}`} />
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      quality={QUALITY}
      className={`object-cover transition-transform duration-300 group-hover:scale-105 ${className}`}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      onError={handleError}
      onLoad={handleLoad}
    />
  )
}
