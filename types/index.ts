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
