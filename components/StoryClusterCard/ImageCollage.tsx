'use client'

import NextImage from 'next/image'
import { StoryCluster } from '@/types'
import { useEffect, useMemo, useState } from 'react'

const ImageCollage = ({ cluster }: { cluster: StoryCluster }) => {
  if (!cluster.imageUrls || cluster.imageUrls.length === 0) {
    return null
  }

  // Get articles that have images, in the same order as imageUrls
  const articlesWithImages =
    cluster.articles
      ?.filter((article) => article.urlToImage && !article.urlToImage.includes('placehold.co'))
      .slice(0, 4) || []

  // Load intrinsic aspect ratios for the first few images to drive layout decisions
  const [aspectRatios, setAspectRatios] = useState<number[]>([])
  const [failedIdx, setFailedIdx] = useState<Set<number>>(new Set())
  useEffect(() => {
    let isCancelled = false
    const urls = (cluster.imageUrls || []).slice(0, 4)
    if (urls.length === 0) return
    Promise.all(
      urls.map(
        (url) =>
          new Promise<number>((resolve) => {
            const img = new globalThis.Image()
            img.onload = () => {
              const ratio =
                img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1
              resolve(ratio || 1)
            }
            img.onerror = () => resolve(1)
            img.src = url
          })
      )
    ).then((ratios) => {
      if (!isCancelled) setAspectRatios(ratios)
    })
    return () => {
      isCancelled = true
    }
  }, [cluster.imageUrls])

  const layoutForIndex = useMemo(() => {
    const count = cluster.imageUrls?.length || 0
    // Determine hero orientation from first image when available
    const firstRatio = aspectRatios[0] ?? 1
    const isLandscapeHero = firstRatio > 1.2
    const isPortraitHero = firstRatio < 0.8

    return (index: number): string => {
      // Defaults
      if (count === 1) return ' col-span-2 row-span-2'
      if (count === 2) {
        const r0 = aspectRatios[0] ?? 1
        const r1 = aspectRatios[1] ?? 1
        const bothLandscape = r0 > 1.2 && r1 > 1.2
        if (bothLandscape) {
          // Stack landscape images top/bottom to preserve width
          return ' col-span-2 row-span-1'
        }
        // Default side-by-side columns
        return ' col-span-1 row-span-2'
      }
      if (count === 3) {
        if (isLandscapeHero) {
          // Wide hero on top, two squares below
          return index === 0 ? ' col-span-2 row-span-1' : ' col-span-1 row-span-1'
        }
        if (isPortraitHero) {
          // Tall hero on left, two squares on right
          return index === 0 ? ' col-span-1 row-span-2' : ' col-span-1 row-span-1'
        }
        // Neutral: fall back to tall-left composition
        return index === 0 ? ' col-span-1 row-span-2' : ' col-span-1 row-span-1'
      }
      // 4 or more: uniform grid cells
      return ' col-span-1 row-span-1'
    }
  }, [aspectRatios, cluster.imageUrls])

  // Client-side URL upscaling removed. We rely solely on server-side resolution in clusterService.

  return (
    <div className="mb-4 grid grid-cols-2 grid-rows-2 gap-2 h-80 lg:h-96 xl:h-[500px] rounded-lg overflow-hidden border">
      {cluster.imageUrls.map((url, index) => {
        const layoutClass = layoutForIndex(index)
        let className = 'w-full h-full' + layoutClass
        const srcToUse = url

        // Get the corresponding article for this image
        const correspondingArticle = articlesWithImages[index]
        const isFailed = failedIdx.has(index)

        return (
          <div key={url} className={className}>
            {isFailed ? (
              <div className="w-full h-full bg-muted" />
            ) : correspondingArticle ? (
              <a
                href={correspondingArticle.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full group relative overflow-hidden rounded-sm"
              >
                <NextImage
                  src={srcToUse}
                  alt={`${cluster.clusterTitle} - ${correspondingArticle.source.name}`}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-110"
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  priority={index === 0}
                  onError={() => {
                    setFailedIdx((prev) => {
                      if (prev.has(index)) return prev
                      const next = new Set(prev)
                      next.add(index)
                      return next
                    })
                  }}
                />
                {/* Overlay with source name on hover */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                  <div className="text-white">
                    <p className="text-xs font-medium">{correspondingArticle.source.name}</p>
                    <p className="text-xs opacity-75 line-clamp-2 mt-1">
                      {correspondingArticle.title}
                    </p>
                  </div>
                </div>
                {/* External link icon */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </div>
              </a>
            ) : (
              <NextImage
                src={srcToUse}
                alt={`${cluster.clusterTitle} - Image ${index + 1}`}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 33vw, 100vw"
                priority={index === 0}
                onError={() => {
                  setFailedIdx((prev) => {
                    if (prev.has(index)) return prev
                    const next = new Set(prev)
                    next.add(index)
                    return next
                  })
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ImageCollage
