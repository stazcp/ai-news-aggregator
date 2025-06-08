import Parser from 'rss-parser'
import { Article } from '@/types'

const parser = new Parser({
  timeout: 5000, // 5 second timeout
  headers: {
    'User-Agent': 'AI News Aggregator/1.0',
  },
})

// Simplified RSS feeds - using more reliable sources
const RSS_FEEDS = {
  technology: ['https://hnrss.org/frontpage'],
  general: ['https://rss.cnn.com/rss/edition.rss'],
}

// Helper function to extract image URL from HTML content
function extractImageFromContent(content: string | undefined): string | null {
  if (!content) return null

  // Simple regex to find first img tag with src attribute
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
  return imgMatch ? imgMatch[1] : null
}

export async function fetchRSSFeed(url: string, category: string): Promise<Article[]> {
  console.log(`🔄 Fetching RSS feed: ${url} (category: ${category})`)

  try {
    console.log(`📡 Parsing URL: ${url}`)
    const feed = await parser.parseURL(url)

    console.log(
      `✅ Successfully parsed feed: "${feed.title}" with ${feed.items?.length || 0} items`
    )

    if (!feed.items || feed.items.length === 0) {
      console.warn(`⚠️ No items found in feed: ${url}`)
      return []
    }

    const articles = feed.items.map((item, index) => ({
      id: `${category}-${Date.now()}-${index}`,
      title: item.title || '',
      description: item.contentSnippet || item.summary || '',
      content: item.content || item.contentSnippet || '',
      url: item.link || '',
      urlToImage: item.enclosure?.url || extractImageFromContent(item.content) || '',
      publishedAt: item.pubDate || new Date().toISOString(),
      source: {
        name: feed.title || 'Unknown',
        url: feed.link || url,
      },
      category,
    }))

    console.log(`✅ Successfully processed ${articles.length} articles from ${url}`)
    return articles
  } catch (error) {
    console.error(`❌ Error fetching RSS feed ${url}:`, error)
    return []
  }
}

export async function fetchAllNews(): Promise<Article[]> {
  console.log(`🚀 Starting to fetch all news from ${Object.keys(RSS_FEEDS).length} categories`)
  const allArticles: Article[] = []

  // Try to fetch real RSS feeds with Promise.allSettled for better error handling
  const feedPromises: Promise<Article[]>[] = []

  for (const [category, feeds] of Object.entries(RSS_FEEDS)) {
    console.log(`📂 Processing category: ${category} (${feeds.length} feeds)`)

    for (const feedUrl of feeds) {
      feedPromises.push(fetchRSSFeed(feedUrl, category))
    }
  }

  // Wait for all feeds to complete (or fail)
  const results = await Promise.allSettled(feedPromises)

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value)
    }
  })

  console.log(`📊 Successfully fetched ${allArticles.length} articles from RSS feeds`)

  console.log(`🔄 Sorting ${allArticles.length} articles by publish date`)
  const sortedArticles = allArticles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )

  console.log(`✅ Final result: ${sortedArticles.length} articles sorted successfully`)
  return sortedArticles
}
