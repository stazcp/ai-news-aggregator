export interface Article {
  id: string
  title: string
  description?: string
  content?: string
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

export interface StoryCluster {
  clusterTitle: string
  articleIds: string[]
  summary?: string
  articles?: Article[]
  imageUrls?: string[]
  // Optional, topic-aware summary data provided by parent for client summary generation
  summarySeed?: string
  summaryKey?: string
}

export interface NewsResponse {
  articles: Article[]
  totalResults: number
  page: number
}
