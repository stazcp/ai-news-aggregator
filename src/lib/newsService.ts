import Parser from 'rss-parser'
import { Article } from '@/types'
import rssConfig from './rss-feeds.json'
import { getCachedData, setCachedData } from './cache'
import { normalizeImageUrl } from './normalizeImageUrl'

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
  console.log(`🔄 Fetching RSS feed: ${url} (category: ${category})`)

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
    console.log(`📡 Parsing URL: ${url}`)

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

    const feed = await simpleParser.parseURL(url)

    console.log(
      `✅ Successfully parsed feed: "${getFeedTitle(feed, url)}" with ${feed.items?.length || 0} items`
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
              console.log(`🖼️ [${getFeedTitle(feed, url)}] Found media:thumbnail: ${normalizedUrl}`)
              return normalizedUrl
            }
          }
        }

        // Priority 2: enclosure (common format)
        if (item.enclosure?.url && isValidUrl(item.enclosure.url)) {
          const normalizedUrl = normalizeImageUrl(item.enclosure.url, 976)
          console.log(`🖼️ [${getFeedTitle(feed, url)}] Found enclosure image: ${normalizedUrl}`)
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
            console.log(`🖼️ [${getFeedTitle(feed, url)}] Found media:content: ${normalizedUrl}`)
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
                    `🖼️ [${getFeedTitle(feed, url)}] Found media:group thumbnail: ${normalizedUrl}`
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
                    `🖼️ [${getFeedTitle(feed, url)}] Found media:group content: ${normalizedUrl}`
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
          console.log(`🖼️ [${getFeedTitle(feed, url)}] Extracted from content: ${normalizedUrl}`)
          return normalizedUrl
        }

        console.log(
          `🚫 [${getFeedTitle(feed, url)}] No image found for: ${item.title?.substring(0, 50)}...`
        )
        return null
      } catch (error) {
        console.warn(`Warning: Error getting image for item: ${item.title}`, error)
        return null
      }
    }

    const articles: Article[] = feed.items
      .slice(0, 5) // Increased from 2 to 5 articles per feed for better coverage
      .map((item, index) => {
        try {
          const article: Article = {
            id: `${category.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${index}`,
            title: item.title?.trim() || 'Untitled Article',
            description: item.contentSnippet?.trim() || item.summary?.trim() || '',
            content: item.content?.trim() || item.contentSnippet?.trim() || '',
            url: item.link?.trim() || '',
            urlToImage: getImage(item) || '',
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

    console.log(`✅ Successfully processed ${articles.length} articles from ${url}`)

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

    console.error(`❌ Error fetching RSS feed ${url}:`, errorDetails)

    // Record this failure for future reference
    recordFeedFailure(url)

    // Don't throw error, just return empty array to prevent breaking the app
    return []
  }
}

export async function fetchAllNews(): Promise<Article[]> {
  console.log(`🚀 Starting to fetch all news from ${Object.keys(RSS_FEEDS).length} categories`)

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

  for (const [category, feeds] of Object.entries(RSS_FEEDS)) {
    console.log(`📂 Processing category: ${category} (${feeds.length} feeds)`)
    for (const feedUrl of feeds) {
      allFeeds.push({ url: feedUrl, category })
    }
  }

  console.log(`⏰ Fetching ${allFeeds.length} RSS feeds in batches...`)

  // Process feeds in smaller batches to prevent connection exhaustion
  const BATCH_SIZE = 8 // Reduced from unlimited to 8 concurrent requests
  const results: Array<{ articles: Article[]; url: string; category: string }> = []

  for (let i = 0; i < allFeeds.length; i += BATCH_SIZE) {
    const batch = allFeeds.slice(i, i + BATCH_SIZE)
    console.log(
      `🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allFeeds.length / BATCH_SIZE)} (${batch.length} feeds)`
    )

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
        console.warn(`Feed promise rejected for ${url}:`, result.reason)
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

    console.log(`📊 Feed Results Summary:`)
    console.log(`  ✅ Successful feeds: ${successfulFeeds.length}`)
    console.log(`  ❌ Failed feeds: ${failedFeeds.length}`)
    console.log(`  📄 Total articles fetched: ${allArticles.length}`)

    if (failedFeeds.length > 0) {
      console.log(`  Failed feed URLs:`, failedFeeds.slice(0, 5)) // Show first 5 failed feeds
    }
  } catch (error) {
    console.error('❌ Critical error in feed fetching process:', error)
    // Even if there's a critical error, continue with whatever articles we have
  }

  // Always return articles, even if some feeds failed
  if (allArticles.length === 0) {
    console.warn('⚠️ No articles were successfully fetched from any feed')
    return []
  }

  console.log(`🔄 Sorting ${allArticles.length} articles by publish date`)
  const sortedArticles = allArticles
    .filter((article) => article && article.title) // Remove any invalid articles
    .sort((a, b) => {
      try {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      } catch {
        return 0 // If date parsing fails, maintain original order
      }
    })
    .slice(0, 100) // Global limit: only keep top 100 most recent articles to prevent performance issues

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
      console.warn('Warning: Error processing article placeholder:', error)
      return article
    }
  })

  console.log(`✅ Final result: ${articlesWithPlaceholders.length} articles processed successfully`)

  // Cache the results for 15 minutes to reduce server load
  if (articlesWithPlaceholders.length > 0) {
    await setCachedData('all-news', articlesWithPlaceholders, 900) // 15 minutes
    console.log(`💾 Cached ${articlesWithPlaceholders.length} articles for future use`)
  }

  return articlesWithPlaceholders
}

// Export configuration for use in other components
export { SOURCE_CATEGORIES, SOURCES }
