'use client'

import Image from 'next/image'
import { useState } from 'react'

interface ArticleImageProps {
  src: string
  alt: string
  className?: string
  onError?: () => void
}

export default function ArticleImage({ src, alt, className = '', onError }: ArticleImageProps) {
  const MIN_W = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_WIDTH ?? '480')
  const MIN_H = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_HEIGHT ?? '300')
  const QUALITY = Number(process.env.NEXT_PUBLIC_IMAGE_QUALITY ?? '85')
  const [tooSmall, setTooSmall] = useState(false)

  const handleError = () => {
    console.warn(`Failed to load image for article: ${alt}`)
    setTooSmall(true)
    onError?.()
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget as HTMLImageElement
    const nw = img?.naturalWidth || 0
    const nh = img?.naturalHeight || 0
    // Only enforce if we have valid dimensions
    if (nw > 0 && nh > 0 && (nw < MIN_W || nh < MIN_H)) {
      setTooSmall(true)
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
