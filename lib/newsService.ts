import Parser from 'rss-parser'
import { Article } from '@/types'

const parser = new Parser({
  timeout: 5000, // 5 second timeout
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregator/1.0)',
  },
  customFields: {
    item: [['media:content', 'media:content']],
  },
})

// Using more reliable RSS feeds based on research
const RSS_FEEDS = {
  // technology: ['https://hnrss.org/frontpage'],
  // general: ['http://rss.cnn.com/rss/cnn_topstories.rss'], // More reliable CNN feed
  World: ['https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
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

    // Add extra timeout wrapper to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 8000)
    })

    const parsePromise = parser.parseURL(url)
    const feed = await Promise.race([parsePromise, timeoutPromise])

    console.log(
      `✅ Successfully parsed feed: "${feed.title}" with ${feed.items?.length || 0} items`
    )

    if (!feed.items || feed.items.length === 0) {
      console.warn(`⚠️ No items found in feed: ${url}`)
      return []
    }

    const getImage = (item: (typeof feed.items)[0]) => {
      if (item.enclosure?.url) return item.enclosure.url
      if (item['media:content'] && typeof item['media:content'] === 'object') {
        return item['media:content']['$']?.url || item['media:content'].url
      }
      extractImageFromContent(item.content)
      return ''
    }

    const articles = feed.items.slice(0, 10).map((item, index) => ({
      // Limit to 10 articles per feed
      id: `${category}-${Date.now()}-${index}`,
      title: item.title || '',
      description: item.contentSnippet || item.summary || '',
      content: item.content || item.contentSnippet || '',
      url: item.link || '',
      urlToImage: getImage(item),
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

  // Wait for all feeds to complete (or fail) with a global timeout
  try {
    const results = await Promise.allSettled(feedPromises)

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allArticles.push(...result.value)
      }
    })

    console.log(`📊 Successfully fetched ${allArticles.length} articles from RSS feeds`)
  } catch (error) {
    console.error('❌ Error in feed fetching process:', error)
  }

  console.log(`🔄 Sorting ${allArticles.length} articles by publish date`)
  const sortedArticles = allArticles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )

  const articlesWithPlaceholders = sortedArticles.map((article) => {
    const hasValidImage =
      article.urlToImage &&
      article.urlToImage.trim() !== '' &&
      (article.urlToImage.startsWith('http://') || article.urlToImage.startsWith('https://'))

    if (!hasValidImage) {
      article.urlToImage = `https://placehold.co/600x400/27272a/a1a1aa?text=${encodeURIComponent(
        article.source.name
      )}`
    }
    return article
  })

  console.log(`✅ Final result: ${articlesWithPlaceholders.length} articles processed successfully`)
  return articlesWithPlaceholders
}

export const SOURCE_CATEGORIES = ['Technology', 'Business', 'World News', 'Science']

export const SOURCES = [
  { id: 'hn', name: 'Hacker News', category: 'Technology', url: 'https://hnrss.org/frontpage' },
  {
    id: 'nyt',
    name: 'The New York Times',
    category: 'World News',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  },
  {
    id: 'verge',
    name: 'The Verge',
    category: 'Technology',
    url: 'https://www.theverge.com/rss/index.xml',
  },
  // ...and so on, for dozens of sources
]
