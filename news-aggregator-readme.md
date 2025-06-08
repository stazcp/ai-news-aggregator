# AI News Aggregator with SSR

A high-performance news aggregation platform with AI-powered summaries, built to demonstrate advanced frontend engineering concepts including SSR, performance optimization, and modern tooling.

## 🚀 Tech Stack

- **Frontend**: Next.js 14 + TypeScript
- **AI**: Groq API (Mixtral-8x7b model)
- **Styling**: Tailwind CSS
- **Data Sources**: RSS feeds + News API
- **Performance**: Built-in Next.js optimization + Redis caching
- **Deployment**: Vercel with edge functions

## ⚡ Quick Start

### Prerequisites

```bash
node >= 18
npm or yarn
```

### 1. Project Setup

```bash
npx create-next-app@latest ai-news-aggregator --typescript --tailwind --eslint --app
cd ai-news-aggregator
```

### 2. Install Dependencies

```bash
npm install rss-parser axios cheerio redis ioredis
npm install -D @types/rss-parser webpack-bundle-analyzer
```

### 3. Environment Variables

Create `.env.local`:

```env
# Required
GROQ_API_KEY=your_groq_api_key_here
NEWS_API_KEY=your_newsapi_key_here

# Optional (for caching)
REDIS_URL=your_redis_url_here

# For bundle analysis
ANALYZE=false
```

**Get API Keys:**

- Groq: [https://console.groq.com](https://console.groq.com) (Free tier: 30 req/min)
- News API: [https://newsapi.org](https://newsapi.org) (Free tier: 1000 req/day)

### 4. Project Structure

```
├── app/
│   ├── api/
│   │   ├── news/route.ts          # Fetch news feeds
│   │   ├── summarize/route.ts     # AI summarization
│   │   └── health/route.ts        # Performance monitoring
│   ├── article/
│   │   └── [id]/page.tsx          # SSR article pages
│   ├── category/
│   │   └── [slug]/page.tsx        # SSG category pages
│   ├── page.tsx                   # Homepage (SSG)
│   └── layout.tsx
├── components/
│   ├── ArticleCard.tsx
│   ├── NewsList.tsx
│   ├── SearchBar.tsx
│   └── PerformanceMetrics.tsx
├── lib/
│   ├── groq.ts                    # AI service
│   ├── newsService.ts             # RSS parsing
│   ├── cache.ts                   # Caching layer
│   └── performance.ts             # Performance utilities
└── types/
    └── index.ts                   # TypeScript definitions
```

## 🏗️ Implementation Steps

### Step 1: Basic Next.js Setup (Day 1)

**1.1 Configure next.config.js:**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  images: {
    domains: ['images.unsplash.com', 'cdn.cnn.com', 'www.bbc.com'],
  },
  serverExternalPackages: ['rss-parser'],
}

module.exports = nextConfig
```

**1.2 Create TypeScript definitions:**

```typescript
// src/types/index.ts
export interface Article {
  id: string
  title: string
  description: string
  content: string
  url: string
  urlToImage: string
  publishedAt: string
  source: {
    name: string
    url: string
  }
  category: string
  summary?: string
}

export interface NewsResponse {
  articles: Article[]
  totalResults: number
  page: number
}
```

### Step 2: News Service & RSS Integration (Day 1-2)

**2.1 Create news service:**

```typescript
// src/lib/newsService.ts
import Parser from 'rss-parser'
import { Article } from '@/types'

const parser = new Parser()

const RSS_FEEDS = {
  technology: ['https://feeds.feedburner.com/oreilly/radar', 'https://hnrss.org/frontpage'],
  business: ['https://feeds.a.dj.com/rss/RSSWorldNews.xml'],
  general: ['https://rss.cnn.com/rss/edition.rss', 'https://feeds.bbci.co.uk/news/rss.xml'],
}

export async function fetchRSSFeed(url: string, category: string): Promise<Article[]> {
  try {
    const feed = await parser.parseURL(url)
    return feed.items.map((item, index) => ({
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
  } catch (error) {
    console.error(`Error fetching RSS feed ${url}:`, error)
    return []
  }
}

export async function fetchAllNews(): Promise<Article[]> {
  const allArticles: Article[] = []

  for (const [category, feeds] of Object.entries(RSS_FEEDS)) {
    for (const feedUrl of feeds) {
      const articles = await fetchRSSFeed(feedUrl, category)
      allArticles.push(...articles)
    }
  }

  return allArticles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}
```

**2.2 Create API route:**

```typescript
// src/app/api/news/route.ts
import { NextResponse } from 'next/server'
import { fetchAllNews } from '@/lib/newsService'
import { getCachedData, setCachedData } from '@/lib/cache'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const cacheKey = `news-${category || 'all'}-${page}-${limit}`

  // Try cache first
  let articles = await getCachedData(cacheKey)

  if (!articles) {
    articles = await fetchAllNews()
    await setCachedData(cacheKey, articles, 300) // 5 min cache
  }

  // Filter and paginate
  const filtered = category ? articles.filter((a) => a.category === category) : articles

  const startIndex = (page - 1) * limit
  const paginatedArticles = filtered.slice(startIndex, startIndex + limit)

  return NextResponse.json({
    articles: paginatedArticles,
    totalResults: filtered.length,
    page,
    totalPages: Math.ceil(filtered.length / limit),
  })
}
```

### Step 3: Groq AI Integration (Day 2-3)

**3.1 Create Groq service:**

```typescript
// src/lib/groq.ts
export interface GroqResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

export class GroqService {
  private apiKey: string
  private baseURL = 'https://api.groq.com/openai/v1/chat/completions'

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY!
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is required')
    }
  }

  async summarizeArticle(content: string, maxLength: number = 150): Promise<string> {
    try {
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mixtral-8x7b-32768',
          messages: [
            {
              role: 'system',
              content:
                'You are a professional news summarizer. Create concise, informative summaries.',
            },
            {
              role: 'user',
              content: `Summarize this article in ${maxLength} characters or less. Focus on the key facts and main points:\n\n${content}`,
            },
          ],
          max_tokens: 100,
          temperature: 0.3,
        }),
      })

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`)
      }

      const data: GroqResponse = await response.json()
      return data.choices[0]?.message?.content?.trim() || 'Summary not available'
    } catch (error) {
      console.error('Error summarizing article:', error)
      return 'Summary not available'
    }
  }

  async batchSummarize(
    articles: Array<{ id: string; content: string }>
  ): Promise<Record<string, string>> {
    const summaries: Record<string, string> = {}

    // Process in batches to respect rate limits
    const batchSize = 5
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize)
      const promises = batch.map(async (article) => {
        const summary = await this.summarizeArticle(article.content)
        return { id: article.id, summary }
      })

      const results = await Promise.allSettled(promises)
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          summaries[batch[index].id] = result.value.summary
        }
      })

      // Rate limiting delay
      if (i + batchSize < articles.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    return summaries
  }
}
```

**3.2 Create summarization API:**

```typescript
// src/app/api/summarize/route.ts
import { NextResponse } from 'next/server'
import { GroqService } from '@/lib/groq'
import { getCachedData, setCachedData } from '@/lib/cache'

const groq = new GroqService()

export async function POST(request: Request) {
  try {
    const { articleId, content } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const cacheKey = `summary-${articleId}`

    // Check cache first
    let summary = await getCachedData(cacheKey)

    if (!summary) {
      summary = await groq.summarizeArticle(content)
      await setCachedData(cacheKey, summary, 3600) // 1 hour cache
    }

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('Summarization error:', error)
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }
}
```

### Step 4: SSR/SSG Implementation (Day 3-4)

**4.1 Homepage (SSG):**

```typescript
// src/app/page.tsx
import { fetchAllNews } from '@/lib/newsService'
import NewsList from '@/components/NewsList'
import { Article } from '@/types'

export const revalidate = 300 // Revalidate every 5 minutes

export default async function HomePage() {
  const articles = await fetchAllNews()
  const featuredArticles = articles.slice(0, 20)

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Latest News</h1>
      <NewsList articles={featuredArticles} />
    </div>
  )
}

export async function generateMetadata() {
  return {
    title: 'AI News Aggregator - Latest News with AI Summaries',
    description: 'Get the latest news with AI-powered summaries. Fast, accurate, and up-to-date.',
  }
}
```

**4.2 Article pages (SSR):**

```typescript
// src/app/article/[id]/page.tsx
import { notFound } from 'next/navigation'
import { fetchAllNews } from '@/lib/newsService'
import { GroqService } from '@/lib/groq'
import { Article } from '@/types'

const groq = new GroqService()

interface ArticlePageProps {
  params: { id: string }
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const articles = await fetchAllNews()
  const article = articles.find((a) => a.id === params.id)

  if (!article) {
    notFound()
  }

  // Generate summary server-side
  const summary = await groq.summarizeArticle(article.content)

  return (
    <article className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{article.title}</h1>
        <div className="flex items-center gap-4 text-gray-600 mb-4">
          <span>{article.source.name}</span>
          <span>•</span>
          <time>{new Date(article.publishedAt).toLocaleDateString()}</time>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg">
          <h2 className="font-semibold mb-2">AI Summary:</h2>
          <p className="text-gray-700">{summary}</p>
        </div>
      </header>

      {article.urlToImage && (
        <img
          src={article.urlToImage}
          alt={article.title}
          className="w-full h-64 object-cover rounded-lg mb-6"
        />
      )}

      <div className="prose max-w-none">
        <p className="text-lg leading-relaxed">{article.content}</p>
      </div>

      <footer className="mt-8 pt-4 border-t">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Read full article at {article.source.name} →
        </a>
      </footer>
    </article>
  )
}

export async function generateMetadata({ params }: ArticlePageProps) {
  const articles = await fetchAllNews()
  const article = articles.find((a) => a.id === params.id)

  if (!article) {
    return { title: 'Article not found' }
  }

  return {
    title: article.title,
    description: article.description,
    openGraph: {
      title: article.title,
      description: article.description,
      images: article.urlToImage ? [article.urlToImage] : [],
    },
  }
}
```

**4.3 Category pages (SSG):**

```typescript
// src/app/category/[slug]/page.tsx
import { fetchAllNews } from '@/lib/newsService'
import NewsList from '@/components/NewsList'

interface CategoryPageProps {
  params: { slug: string }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const articles = await fetchAllNews()
  const categoryArticles = articles.filter((a) => a.category === params.slug)

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8 capitalize">{params.slug} News</h1>
      <NewsList articles={categoryArticles} />
    </div>
  )
}

export async function generateStaticParams() {
  return [{ slug: 'technology' }, { slug: 'business' }, { slug: 'general' }]
}

export const revalidate = 600 // 10 minutes
```

### Step 5: Performance Optimization (Day 4-5)

**5.1 Caching layer:**

```typescript
// src/lib/cache.ts
import { Redis } from 'ioredis'

let redis: Redis | null = null

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL)
}

// In-memory fallback
const memoryCache = new Map<string, { data: any; expires: number }>()

export async function getCachedData(key: string): Promise<any> {
  if (redis) {
    const data = await redis.get(key)
    return data ? JSON.parse(data) : null
  }

  // Memory cache fallback
  const cached = memoryCache.get(key)
  if (cached && cached.expires > Date.now()) {
    return cached.data
  }

  return null
}

export async function setCachedData(key: string, data: any, ttlSeconds: number): Promise<void> {
  if (redis) {
    await redis.setex(key, ttlSeconds, JSON.stringify(data))
  } else {
    // Memory cache fallback
    memoryCache.set(key, {
      data,
      expires: Date.now() + ttlSeconds * 1000,
    })
  }
}
```

**5.2 Bundle analysis configuration:**

```javascript
// Add to next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  // ... existing config
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
})
```

**5.3 Performance monitoring component:**

```typescript
// src/components/PerformanceMetrics.tsx
'use client'

import { useEffect, useState } from 'react'

export default function PerformanceMetrics() {
  const [metrics, setMetrics] = useState<{
    fcp: number | null
    lcp: number | null
    cls: number | null
  }>({
    fcp: null,
    lcp: null,
    cls: null,
  })

  useEffect(() => {
    // Measure Core Web Vitals
    if (typeof window !== 'undefined' && 'performance' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            setMetrics((prev) => ({ ...prev, fcp: entry.startTime }))
          } else if (entry.entryType === 'largest-contentful-paint') {
            setMetrics((prev) => ({ ...prev, lcp: entry.startTime }))
          } else if (entry.entryType === 'layout-shift') {
            if (!(entry as any).hadRecentInput) {
              setMetrics((prev) => ({
                ...prev,
                cls: (prev.cls || 0) + (entry as any).value,
              }))
            }
          }
        }
      })

      observer.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] })

      return () => observer.disconnect()
    }
  }, [])

  if (process.env.NODE_ENV !== 'development') return null

  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-2 rounded text-xs">
      <div>FCP: {metrics.fcp ? `${Math.round(metrics.fcp)}ms` : 'measuring...'}</div>
      <div>LCP: {metrics.lcp ? `${Math.round(metrics.lcp)}ms` : 'measuring...'}</div>
      <div>CLS: {metrics.cls ? metrics.cls.toFixed(3) : 'measuring...'}</div>
    </div>
  )
}
```

### Step 6: Components & UI (Day 5-6)

**6.1 Article Card Component:**

```typescript
// src/components/ArticleCard.tsx
import Link from 'next/link'
import Image from 'next/image'
import { Article } from '@/types'

interface ArticleCardProps {
  article: Article
  showSummary?: boolean
}

export default function ArticleCard({ article, showSummary = false }: ArticleCardProps) {
  return (
    <article className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      {article.urlToImage && (
        <div className="relative h-48">
          <Image
            src={article.urlToImage}
            alt={article.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            onError={(e) => {
              console.log('banana',e)
            }}
          />
        </div>
      )}

      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
            {article.category}
          </span>
          <span>•</span>
          <span>{article.source.name}</span>
          <span>•</span>
          <time>{new Date(article.publishedAt).toLocaleDateString()}</time>
        </div>

        <h3 className="text-xl font-semibold mb-2 line-clamp-2">
          <Link href={`/article/${article.id}`} className="hover:text-blue-600 transition-colors">
            {article.title}
          </Link>
        </h3>

        <p className="text-gray-700 line-clamp-3 mb-4">{article.description}</p>

        {showSummary && article.summary && (
          <div className="bg-yellow-50 p-3 rounded border-l-4 border-yellow-400 mb-4">
            <p className="text-sm text-gray-700">
              <strong>AI Summary:</strong> {article.summary}
            </p>
          </div>
        )}

        <Link
          href={`/article/${article.id}`}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          Read more →
        </Link>
      </div>
    </article>
  )
}
```

### Step 7: Deployment & Performance Analysis (Day 6-7)

**7.1 Deploy to Vercel:**

```bash
npm install -g vercel
vercel --prod
```

**7.2 Performance testing scripts:**

```json
// Add to package.json scripts
{
  "scripts": {
    "analyze": "ANALYZE=true npm run build",
    "lighthouse": "lighthouse http://localhost:3000 --output html --output-path ./lighthouse-report.html",
    "perf:build": "npm run build && npm run analyze"
  }
}
```

## 🎯 Interview Demonstration Points

### SSR vs CSR Comparison

- **Homepage**: SSG for better SEO and cache efficiency
- **Article pages**: SSR for dynamic content and social sharing
- **Interactive features**: CSR for real-time updates

### Performance Optimizations

- **Bundle size**: Code splitting, tree shaking, dynamic imports
- **Caching**: Multi-layer (Redis, Next.js, CDN)
- **Images**: Next.js Image optimization
- **Core Web Vitals**: Real-time monitoring

### Architecture Decisions

- **API design**: RESTful with proper caching headers
- **Error handling**: Graceful degradation
- **Rate limiting**: Groq API batch processing
- **Data flow**: Server → Cache → Client optimization

## 📊 Performance Benchmarks to Show

- **Page load times**: SSR vs CSR comparison
- **Bundle sizes**: Before/after optimization
- **API response times**: With/without caching
- **Core Web Vitals**: FCP, LCP, CLS scores
- **Lighthouse scores**: Performance, SEO, Accessibility

## 🔧 Development Commands

```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Performance analysis
npm run analyze
npm run lighthouse

# Bundle size analysis
npm run perf:build
```

## 🚀 Optional Enhancements

If you finish early, consider adding:

- Search functionality with debouncing
- Infinite scroll with React Query
- Dark mode toggle
- PWA capabilities
- Error boundary components
- Unit tests with Jest
- E2E tests with Playwright

---

**Time Estimate**: 5-7 days for core features, 7-10 days with enhancements

This project perfectly demonstrates senior frontend engineering skills while being achievable in a short timeframe. The combination of SSR benefits, AI integration, and modern tooling makes it an impressive portfolio piece for interviews.
