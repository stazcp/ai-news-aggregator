import Parser from 'rss-parser'
import { Article } from '@/types'
import rssConfig from './rss-feeds.json'
import { getCachedData, setCachedData } from './cache'
import { inferImageDimsFromUrl } from './imageProviders'
import { normalizeImageUrl } from './normalizeImageUrl'

// Simple log gating for feed operations
const FEED_LOG_LEVEL = (process.env.FEED_LOG_LEVEL || 'warn').toLowerCase()
const LEVELS: Record<string, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 }
function log(level: 'error' | 'warn' | 'info' | 'debug', ...args: any[]) {
  if ((LEVELS[FEED_LOG_LEVEL] ?? 2) >= (LEVELS[level] ?? 2)) {
    // Map to console
    if (level === 'error') console.error(...args)
    else if (level === 'warn') console.warn(...args)
    else console.log(...args)
  }
}

const parser = new Parser({
  timeout: 10000, // Increased timeout
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
  },
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
      ['media:group', 'media:group'],
      ['image', 'image'],
    ],
  },
})

// Import sources from JSON configuration and derive categories/feeds
const SOURCES_CONFIG = rssConfig.sources as Record<
  string,
  {
    name: string
    feeds: Array<{
      id: string
      category: string
      url: string
    }>
  }
>

// Flatten all feeds into a single array for backward compatibility
const SOURCES = Object.values(SOURCES_CONFIG).flatMap((source) =>
  source.feeds.map((feed) => ({
    id: feed.id,
    name: `${source.name} ${feed.category}`,
    category: feed.category,
    url: feed.url,
  }))
)

const SOURCE_CATEGORIES: string[] = Array.from(new Set(SOURCES.map((s) => s.category)))

const RSS_FEEDS: Record<string, string[]> = SOURCE_CATEGORIES.reduce(
  (acc: Record<string, string[]>, category: string) => {
    acc[category] = SOURCES.filter((s) => s.category === category).map((s) => s.url)
    return acc
  },
  {}
)

// Helper function to extract image URL from HTML content
function extractImageFromContent(content: string | undefined): string | null {
  if (!content) return null

  try {
    // Simple regex to find first img tag with src attribute
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
    return imgMatch ? imgMatch[1] : null
  } catch (error) {
    console.warn('Error extracting image from content:', error)
    return null
  }
}

// Helper function to validate URL
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// Helper function to safely get feed title with fallback
function getFeedTitle(feed: any, fallbackUrl: string): string {
  try {
    return feed.title || feed.description || new URL(fallbackUrl).hostname || 'Unknown Source'
  } catch {
    return 'Unknown Source'
  }
}

// Keep track of failing feeds to avoid repeated attempts
const failedFeedsCache = new Map<string, { count: number; lastFailed: Date }>()
const MAX_FAILURE_COUNT = 3
const FAILURE_COOLDOWN = 30 * 60 * 1000 // 30 minutes

function shouldSkipFeed(url: string): boolean {
  const failureInfo = failedFeedsCache.get(url)
  if (!failureInfo) return false

  // Skip if failed too many times and still in cooldown period
  if (failureInfo.count >= MAX_FAILURE_COUNT) {
    const timeSinceLastFailure = Date.now() - failureInfo.lastFailed.getTime()
    if (timeSinceLastFailure < FAILURE_COOLDOWN) {
      console.log(`⏭️ Skipping ${url} (failed ${failureInfo.count} times, cooling down)`)
      return true
    } else {
      // Reset failure count after cooldown
      failedFeedsCache.delete(url)
    }
  }
  return false
}

function recordFeedFailure(url: string): void {
  const existing = failedFeedsCache.get(url)
  if (existing) {
    failedFeedsCache.set(url, {
      count: existing.count + 1,
      lastFailed: new Date(),
    })
  } else {
    failedFeedsCache.set(url, {
      count: 1,
      lastFailed: new Date(),
    })
  }
}

export async function fetchRSSFeed(url: string, category: string): Promise<Article[]> {
  log('info', `🔄 Fetching RSS feed: ${url} (category: ${category})`)

  // Validate URL first
  if (!isValidUrl(url)) {
    console.error(`❌ Invalid URL: ${url}`)
    return []
  }

  // Skip feeds that have been failing consistently
  if (shouldSkipFeed(url)) {
    return []
  }

  try {
    log('debug', `📡 Parsing URL: ${url}`)

    // Use simple, reliable headers like the test script
    const simpleParser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
      },
      customFields: {
        item: [
          ['media:content', 'media:content'],
          ['media:thumbnail', 'media:thumbnail'],
          ['media:group', 'media:group'],
          ['image', 'image'],
        ],
      },
    })

    let effectiveUrl = url
    let feed
    try {
      feed = await simpleParser.parseURL(effectiveUrl)
    } catch (e: any) {
      const msg = e?.message || ''
      try {
        const host = new URL(effectiveUrl).hostname
        const allowList: string[] = (rssConfig as any)?.imageHostnames?.httpFallbacks || []
        const isAllowed = allowList.some((h) => host === h || host.endsWith(h.replace(/^\*\./, '')))
        const looksHtml = /Non-whitespace before first tag|Status code 406|Status code 403/i.test(msg)
        if (looksHtml && isAllowed && effectiveUrl.startsWith('https://')) {
          const httpUrl = effectiveUrl.replace(/^https:/, 'http:')
          log('warn', `⚠️ HTTPS feed failed (${host}); retrying over HTTP: ${httpUrl}`)
          effectiveUrl = httpUrl
          feed = await simpleParser.parseURL(effectiveUrl)
        } else {
          throw e
        }
      } catch (inner) {
        throw e
      }
    }

    log(
      'info',
      `✅ Parsed: "${getFeedTitle(feed, effectiveUrl)}" items=${feed.items?.length || 0}`
    )

    if (!feed.items || feed.items.length === 0) {
      console.warn(`⚠️ No items found in feed: ${url}`)
      return []
    }

    const getImage = (item: (typeof feed.items)[0]) => {
      try {
        // Priority 1: media:thumbnail (BBC format)
        if (item['media:thumbnail']) {
          const thumbnail = item['media:thumbnail']
          // BBC format: media:thumbnail has $ property with url
          if (thumbnail && typeof thumbnail === 'object') {
            const thumbnailUrl = thumbnail['$']?.url || thumbnail.$?.url || thumbnail.url
            if (thumbnailUrl && isValidUrl(thumbnailUrl)) {
              const normalizedUrl = normalizeImageUrl(thumbnailUrl, 976)
              log('debug', `🖼️ [${getFeedTitle(feed, url)}] media:thumbnail ${normalizedUrl}`)
              return normalizedUrl
            }
          }
        }

        // Priority 2: enclosure (common format)
        if (item.enclosure?.url && isValidUrl(item.enclosure.url)) {
          const normalizedUrl = normalizeImageUrl(item.enclosure.url, 976)
          log('debug', `🖼️ [${getFeedTitle(feed, url)}] enclosure ${normalizedUrl}`)
          return normalizedUrl
        }

        // Priority 3: media:content (some feeds)
        if (item['media:content']) {
          const mediaContent = item['media:content']
          const imageUrl =
            typeof mediaContent === 'object' && mediaContent['$']?.url
              ? mediaContent['$'].url
              : mediaContent.url
          if (imageUrl && isValidUrl(imageUrl)) {
            const normalizedUrl = normalizeImageUrl(imageUrl, 976)
            log('debug', `🖼️ [${getFeedTitle(feed, url)}] media:content ${normalizedUrl}`)
            return normalizedUrl
          }
        }

        // Priority 4: media:group (complex media)
        if (item['media:group']) {
          const mediaGroup = item['media:group']
          if (mediaGroup && typeof mediaGroup === 'object') {
            // Check for thumbnail in media group
            if (mediaGroup['media:thumbnail']) {
              const groupThumbnail = mediaGroup['media:thumbnail']
              if (groupThumbnail) {
                const groupThumbnailUrl =
                  groupThumbnail['$']?.url || groupThumbnail.$?.url || groupThumbnail.url
                if (groupThumbnailUrl && isValidUrl(groupThumbnailUrl)) {
                  const normalizedUrl = normalizeImageUrl(groupThumbnailUrl, 976)
                  console.log(
                    `🖼️ [${getFeedTitle(feed, url)}] media:group thumbnail ${normalizedUrl}`
                  )
                  return normalizedUrl
                }
              }
            }
            // Check for content in media group
            if (mediaGroup['media:content']) {
              const groupContent = mediaGroup['media:content']
              if (groupContent) {
                const groupContentUrl =
                  groupContent['$']?.url || groupContent.$?.url || groupContent.url
                if (groupContentUrl && isValidUrl(groupContentUrl)) {
                  const normalizedUrl = normalizeImageUrl(groupContentUrl, 976)
                  console.log(
                    `🖼️ [${getFeedTitle(feed, url)}] media:group content ${normalizedUrl}`
                  )
                  return normalizedUrl
                }
              }
            }
          }
        }

        // Priority 5: Extract from HTML content
        const extractedImage = extractImageFromContent(item.content || item.contentSnippet)
        if (extractedImage && isValidUrl(extractedImage)) {
          const normalizedUrl = normalizeImageUrl(extractedImage, 976)
          log('debug', `🖼️ [${getFeedTitle(feed, url)}] extracted ${normalizedUrl}`)
          return normalizedUrl
        }

        log('debug', `🚫 [${getFeedTitle(feed, url)}] No image for: ${item.title?.substring(0, 50)}...`)
        return null
      } catch (error) {
        console.warn(`Warning: Error getting image for item: ${item.title}`, error)
        return null
      }
    }

    const getImageDimensions = (item: (typeof feed.items)[0]): { width?: number; height?: number } => {
      try {
        // media:thumbnail
        if (item['media:thumbnail']) {
          const t = item['media:thumbnail']
          const w = Number(t['$']?.width || t.width)
          const h = Number(t['$']?.height || t.height)
          if (w > 0 && h > 0) return { width: w, height: h }
        }
        // media:content
        if (item['media:content']) {
          const mc = item['media:content']
          const w = Number(mc['$']?.width || mc.width)
          const h = Number(mc['$']?.height || mc.height)
          if (w > 0 && h > 0) return { width: w, height: h }
        }
        // media:group
        if (item['media:group']) {
          const mg = item['media:group']
          if (mg['media:thumbnail']) {
            const gt = mg['media:thumbnail']
            const w = Number(gt['$']?.width || gt.width)
            const h = Number(gt['$']?.height || gt.height)
            if (w > 0 && h > 0) return { width: w, height: h }
          }
          if (mg['media:content']) {
            const gc = mg['media:content']
            const w = Number(gc['$']?.width || gc.width)
            const h = Number(gc['$']?.height || gc.height)
            if (w > 0 && h > 0) return { width: w, height: h }
          }
        }
      } catch {}
      return {}
    }

    const PER_FEED_LIMIT = parseInt(process.env.FEED_ITEMS_PER_FEED || '5', 10)
    const articles: Article[] = feed.items
      .slice(0, PER_FEED_LIMIT)
      .map((item, index) => {
        try {
          const imageUrl = getImage(item) || ''
          let dims = getImageDimensions(item)
          if ((!dims.width && !dims.height) && imageUrl) {
            const inferred = inferImageDimsFromUrl(imageUrl)
            if (inferred.width || inferred.height) {
              dims = inferred
            }
          }
          const article: Article = {
            id: `${category.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${index}`,
            title: item.title?.trim() || 'Untitled Article',
            description: item.contentSnippet?.trim() || item.summary?.trim() || '',
            content: item.content?.trim() || item.contentSnippet?.trim() || '',
            url: item.link?.trim() || '',
            urlToImage: imageUrl,
            imageWidth: dims.width,
            imageHeight: dims.height,
            publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
            source: {
              name: getFeedTitle(feed, url),
              url: (feed && 'link' in feed ? feed.link : null) || url,
            },
            category,
          }
          return article
        } catch (error) {
          console.warn(`Warning: Error processing article from ${url}:`, error)
          return null
        }
      })
      .filter((article): article is Article => article !== null) // Remove null entries

    log('info', `✅ Processed ${articles.length} articles from ${url}`)

    // Return articles with original image URLs - let Next.js Image handle optimization
    return articles
  } catch (error) {
    // Enhanced error logging with more context and better error serialization
    let errorDetails: any = {
      category,
      url,
      timestamp: new Date().toISOString(),
    }

    if (error instanceof Error) {
      errorDetails.message = error.message
      errorDetails.name = error.name
      errorDetails.stack = error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
    } else if (typeof error === 'object' && error !== null) {
      // Handle cases where error might be an object but not an Error instance
      errorDetails.error_object = JSON.stringify(error, Object.getOwnPropertyNames(error))
    } else {
      errorDetails.message = String(error)
    }

    // Special handling for common network errors
    if (errorDetails.message?.includes('ENOTFOUND')) {
      errorDetails.error_type = 'DNS_RESOLUTION_FAILED'
      errorDetails.help = 'The domain could not be resolved. Feed may be offline or URL incorrect.'
    } else if (errorDetails.message?.includes('timeout')) {
      errorDetails.error_type = 'TIMEOUT'
      errorDetails.help = 'Request timed out. Feed server may be slow or overloaded.'
    } else if (errorDetails.message?.includes('ECONNREFUSED')) {
      errorDetails.error_type = 'CONNECTION_REFUSED'
      errorDetails.help = 'Connection was refused. Feed server may be down.'
    }

    log('error', `❌ Error fetching RSS feed ${url}:`, errorDetails)

    // Record this failure for future reference
    recordFeedFailure(url)

    // Don't throw error, just return empty array to prevent breaking the app
    return []
  }
}

export async function fetchAllNews(): Promise<Article[]> {
  log('info', `🚀 Fetching news from ${Object.keys(RSS_FEEDS).length} categories`)

  // Check cache first to avoid expensive RSS fetching
  const cached = await getCachedData('all-news')
  if (cached && cached.length > 0) {
    console.log(`✅ Returning ${cached.length} cached articles`)
    return cached
  }

  const allArticles: Article[] = []
  const failedFeeds: string[] = []
  const successfulFeeds: string[] = []

  // Batch RSS feeds to prevent overwhelming servers and avoid connection exhaustion
  const allFeeds: Array<{ url: string; category: string }> = []

  const FEED_BLOCKLIST = (process.env.FEED_BLOCKLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const [category, feeds] of Object.entries(RSS_FEEDS)) {
    log('info', `📂 Category: ${category} (${feeds.length} feeds)`)
    for (const feedUrl of feeds) {
      if (FEED_BLOCKLIST.some((b) => (feedUrl || '').includes(b))) {
        console.log(`🚫 Skipping blocked feed: ${feedUrl}`)
        continue
      }
      allFeeds.push({ url: feedUrl, category })
    }
  }

  log('info', `⏰ Fetching ${allFeeds.length} RSS feeds in batches...`)

  // Process feeds in smaller batches to prevent connection exhaustion
  const BATCH_SIZE = 8 // Reduced from unlimited to 8 concurrent requests
  const results: Array<{ articles: Article[]; url: string; category: string }> = []

  for (let i = 0; i < allFeeds.length; i += BATCH_SIZE) {
    const batch = allFeeds.slice(i, i + BATCH_SIZE)
    log('info', `🔄 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allFeeds.length / BATCH_SIZE)} (${batch.length})`)

    const batchPromises = batch.map(async ({ url, category }) => {
      try {
        const articles = await fetchRSSFeed(url, category)
        return { articles, url, category }
      } catch (error) {
        console.error(`Failed to fetch ${url}:`, error)
        return { articles: [], url, category }
      }
    })

    const batchResults = await Promise.allSettled(
      batchPromises.map((promise) =>
        Promise.race([
          promise,
          new Promise<{ articles: Article[]; url: string; category: string }>(
            (_, reject) => setTimeout(() => reject(new Error('Feed timeout')), 15000) // Reduced timeout
          ),
        ])
      )
    )

    // Process batch results
    batchResults.forEach((result, batchIndex) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        const { url, category } = batch[batchIndex]
        log('warn', `Feed promise rejected for ${url}:`, result.reason)
        results.push({ articles: [], url, category })
      }
    })

    // Small delay between batches to be respectful to servers
    if (i + BATCH_SIZE < allFeeds.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  // Process results
  try {
    results.forEach((result) => {
      const { articles, url, category } = result
      if (articles.length > 0) {
        allArticles.push(...articles)
        successfulFeeds.push(url)
      } else {
        failedFeeds.push(url)
      }
    })

    log('info', `📊 Feed Results: ok=${successfulFeeds.length} fail=${failedFeeds.length} items=${allArticles.length}`)

    if (failedFeeds.length > 0) {
      log('warn', `  Failed feed URLs:`, failedFeeds.slice(0, 5))
    }
  } catch (error) {
    log('error', '❌ Critical error in feed fetching process:', error)
    // Even if there's a critical error, continue with whatever articles we have
  }

  // Always return articles, even if some feeds failed
  if (allArticles.length === 0) {
    log('warn', '⚠️ No articles were successfully fetched from any feed')
    return []
  }

  log('debug', `🔄 Sorting ${allArticles.length} articles by publish date`)
  const GLOBAL_LIMIT = parseInt(process.env.NEWS_GLOBAL_LIMIT || '100', 10)
  const sortedAll = allArticles
    .filter((article) => article && article.title) // Remove any invalid articles
    .sort((a, b) => {
      try {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      } catch {
        return 0 // If date parsing fails, maintain original order
      }
    })

  // Dedupe by canonical URL or (source+title) before applying global limit
  const seenKeys = new Set<string>()
  const canonicalKey = (a: Article) => {
    try {
      if (a.url) {
        const u = new URL(a.url)
        return `${u.origin}${u.pathname}`.toLowerCase()
      }
    } catch {}
    // Fallback: dedupe tied to host (prefer a.source.url host), never cross-host
    let host = ''
    try {
      if (a.source?.url) host = new URL(a.source.url).hostname.replace(/^www\./, '').toLowerCase()
    } catch {}
    return `${host}|${(a.title || '').toLowerCase().trim()}`
  }
  const deduped: Article[] = []
  for (const a of sortedAll) {
    const key = canonicalKey(a)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    deduped.push(a)
  }
  const sortedArticles = deduped.slice(0, GLOBAL_LIMIT)

  const articlesWithPlaceholders = sortedArticles.map((article) => {
    try {
      const hasValidImage =
        article.urlToImage && article.urlToImage.trim() !== '' && isValidUrl(article.urlToImage)

      if (!hasValidImage) {
        const encodedSourceName = encodeURIComponent(article.source.name || 'News')
        article.urlToImage = `https://placehold.co/600x400/27272a/a1a1aa?text=${encodedSourceName}`
      }
      return article
    } catch (error) {
      log('warn', 'Warning: Error processing article placeholder:', error)
      return article
    }
  })

  log('info', `✅ Final articles: ${articlesWithPlaceholders.length}`)

  // Cache the results for 15 minutes to reduce server load
  if (articlesWithPlaceholders.length > 0) {
    await setCachedData('all-news', articlesWithPlaceholders, 900) // 15 minutes
    log('info', `💾 Cached ${articlesWithPlaceholders.length} articles`)
  }

  return articlesWithPlaceholders
}

// Export configuration for use in other components
export { SOURCE_CATEGORIES, SOURCES }
