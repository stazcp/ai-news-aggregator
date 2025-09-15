'use client'

import NextImage from 'next/image'
import { StoryCluster, Article } from '@/types'
import { useEffect, useMemo, useState } from 'react'

const ImageCollage = ({
  cluster,
  onChangeCount,
}: {
  cluster: StoryCluster
  onChangeCount?: (count: number) => void
}) => {
  if (!cluster.imageUrls || cluster.imageUrls.length === 0) {
    return null
  }

  // Build quick lookup from URL -> article
  const articlesByUrl = useMemo(() => {
    const map = new Map<string, Article>()
    for (const a of cluster.articles || []) {
      if (a?.urlToImage && !a.urlToImage.includes('placehold.co')) {
        map.set(a.urlToImage, a)
      }
    }
    return map
  }, [cluster.articles])

  // Keep a live list of usable URLs; when an image fails or is too small, remove it
  const initialUrls = useMemo(
    () => (cluster.imageUrls || []).filter(Boolean).slice(0, 4),
    [cluster.imageUrls]
  )
  const [urls, setUrls] = useState<string[]>(initialUrls)
  useEffect(() => setUrls(initialUrls), [initialUrls])
  useEffect(() => {
    onChangeCount?.(urls.length)
  }, [urls, onChangeCount])

  // Load intrinsic aspect ratios for the first few images to drive layout decisions
  const [aspectRatios, setAspectRatios] = useState<number[]>([])
  useEffect(() => {
    let isCancelled = false
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
  }, [urls])

  const layoutForIndex = useMemo(() => {
    const count = urls.length || 0
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
  }, [aspectRatios, urls])

  // Client-side URL upscaling removed. We rely solely on server-side resolution in clusterService.

  if (urls.length === 0) return null

  return (
    <div className="mb-4 grid grid-cols-2 grid-rows-2 gap-2 h-80 lg:h-96 xl:h-[500px] rounded-lg overflow-hidden border">
      {urls.map((url, index) => {
        const layoutClass = layoutForIndex(index)
        let className = 'w-full h-full' + layoutClass
        const srcToUse = url
        const MIN_W = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_WIDTH ?? '320')
        const MIN_H = Number(process.env.NEXT_PUBLIC_MIN_IMAGE_HEIGHT ?? '200')
        const QUALITY = Number(process.env.NEXT_PUBLIC_IMAGE_QUALITY ?? '85')
        const correspondingArticle = articlesByUrl.get(url)

        return (
          <div key={url} className={className}>
            {correspondingArticle ? (
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
                  quality={QUALITY}
                  className="object-cover transition-transform duration-300 group-hover:scale-110"
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  priority={index === 0}
                  onError={() => setUrls((prev) => prev.filter((u) => u !== url))}
                  onLoad={(e) => {
                    const el = e.currentTarget as HTMLImageElement
                    const nw = el?.naturalWidth || 0
                    const nh = el?.naturalHeight || 0
                    if (nw > 0 && nh > 0 && (nw < MIN_W || nh < MIN_H))
                      setUrls((prev) => prev.filter((u) => u !== url))
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
                quality={QUALITY}
                className="object-cover"
                sizes="(min-width: 1024px) 33vw, 100vw"
                priority={index === 0}
                onError={() => setUrls((prev) => prev.filter((u) => u !== url))}
                onLoad={(e) => {
                  const el = e.currentTarget as HTMLImageElement
                  const nw = el?.naturalWidth || 0
                  const nh = el?.naturalHeight || 0
                  if (nw > 0 && nh > 0 && (nw < MIN_W || nh < MIN_H))
                    setUrls((prev) => prev.filter((u) => u !== url))
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
