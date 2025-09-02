// lib/topics.ts
import { Article, StoryCluster } from '@/types'

export const TOPIC_KEYWORDS: Record<string, string[]> = {
  'Artificial Intelligence': [
    'ai',
    'artificial intelligence',
    'gpt',
    'llama',
    'mistral',
    'claude',
    'openai',
    'anthropic',
    'xai',
    'deepmind',
    'groq',
  ],
  'Social Media': [
    'twitter',
    'x.com',
    ' x ',
    'facebook',
    'meta',
    'instagram',
    'tiktok',
    'snapchat',
    'youtube',
    'reddit',
    'social media',
  ],
  Technology: [
    'tech',
    'software',
    'hardware',
    'semiconductor',
    'chip',
    'gpu',
    'tpu',
    'iphone',
    'android',
    'cloud',
    'saas',
  ],
  Business: [
    'startup',
    'earnings',
    'ipo',
    'merger',
    'acquisition',
    'funding',
    'revenue',
    'valuation',
    'venture',
  ],
  Science: ['science', 'research', 'study', 'paper', 'experiment', 'peer-reviewed', 'arxiv'],
  Climate: ['climate', 'emissions', 'carbon', 'warming', 'wildfire', 'hurricane', 'storm'],
  Health: ['health', 'covid', 'vaccine', 'disease', 'who', 'cdc'],
  'US Politics': [
    'congress',
    'senate',
    'house',
    'biden',
    'trump',
    'gop',
    'democrats',
    'republicans',
    'white house',
  ],
  World: [
    'israel',
    'gaza',
    'ukraine',
    'russia',
    'china',
    'europe',
    'asia',
    'africa',
    'middle east',
    'war',
    'conflict',
  ],
  Sports: ['soccer', 'nfl', 'nba', 'mlb', 'premier league', 'match', 'game'],
}

function recencyWeight(publishedAt: string): number {
  try {
    const hours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 36e5)
    return Math.exp(-hours / 24)
  } catch {
    return 0.5
  }
}

function textIncludesAny(text: string, needles: string[]): boolean {
  const t = text.toLowerCase()
  return needles.some((n) => t.includes(n))
}

export function matchesTopic(topic: string, text: string): boolean {
  const keywords = TOPIC_KEYWORDS[topic] || [topic.toLowerCase()]
  return textIncludesAny(text, keywords)
}

export function computeTrendingTopics(
  articles: Article[],
  clusters: StoryCluster[],
  limit = 10
): string[] {
  const scores = new Map<string, number>()
  const bump = (topic: string, w: number) => scores.set(topic, (scores.get(topic) || 0) + w)

  for (const c of clusters) {
    const latest = c.articles?.[0]?.publishedAt || ''
    const w = recencyWeight(latest) * 2
    const text = [c.clusterTitle, ...(c.articles?.map((a) => a.title) || [])].join(' ')
    for (const topic of Object.keys(TOPIC_KEYWORDS)) {
      if (matchesTopic(topic, text)) bump(topic, w)
    }
  }

  for (const a of articles) {
    const w = recencyWeight(a.publishedAt)
    const text = `${a.title} ${a.description || ''}`
    for (const topic of Object.keys(TOPIC_KEYWORDS)) {
      if (matchesTopic(topic, text)) bump(topic, w)
    }
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .slice(0, limit)
}

/**
 * Fallback: derive topics from article.categories when keyword-based trending is empty.
 * Picks the most frequent categories as pseudo-topics.
 */
export function computeCategoryFallbackTopics(
  articles: Article[],
  clusters: StoryCluster[],
  limit = 10
): string[] {
  const allArticles: Article[] = [...articles, ...clusters.flatMap((c) => c.articles || [])]
  const freq = new Map<string, number>()
  for (const a of allArticles) {
    if (!a?.category) continue
    freq.set(a.category, (freq.get(a.category) || 0) + 1)
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, limit)
}
