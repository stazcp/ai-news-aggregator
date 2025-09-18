// lib/topics.ts
import { Article, StoryCluster } from '@/types'

export const TOPIC_KEYWORDS: Record<string, string[]> = {
  Crypto: [
    'crypto',
    'cryptocurrency',
    'bitcoin',
    'btc',
    'ethereum',
    'eth',
    'blockchain',
    'defi',
    'stablecoin',
    'token',
    'web3',
    'nft',
    'solana',
    'binance',
    'coinbase',
  ],
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function keywordToRegex(keyword: string): RegExp {
  const k = keyword.trim()
  const escaped = escapeRegExp(k)
  const shortOrAmbiguous =
    k.length <= 3 ||
    ['ai', 'x', 'gop', 'cdc', 'who', 'ipo', 'gpu', 'tpu', 'saas'].includes(k.toLowerCase())
  // Use word boundaries for short/ambiguous tokens to avoid false positives (e.g., 'ai' in 'said')
  if (shortOrAmbiguous && /^[a-z0-9]+$/i.test(k)) {
    return new RegExp(`\\b${escaped}\\b`, 'i')
  }
  // Otherwise do a case-insensitive substring match
  return new RegExp(escaped, 'i')
}

function textIncludesAny(text: string, needles: string[]): boolean {
  return needles.map(keywordToRegex).some((re) => re.test(text))
}

export function matchesTopic(topic: string, text: string): boolean {
  const keywords = TOPIC_KEYWORDS[topic] || [topic.toLowerCase()]
  return textIncludesAny(text, keywords)
}

/**
 * Computes a lightweight keyword relevance score for a given topic and text.
 * - Counts regex matches of topic keywords
 * - Short/ambiguous tokens use word boundaries (see keywordToRegex)
 */
export function computeKeywordScore(topic: string, text: string): number {
  const keywords = TOPIC_KEYWORDS[topic] || [topic.toLowerCase()]
  const regexes = keywords.map(keywordToRegex)
  let score = 0
  for (const re of regexes) {
    const matches = text.match(re)
    if (matches?.length) score += matches.length
  }
  return score
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

/**
 * Lists all distinct categories present across articles and clusters (no limit).
 */
export function listAllCategoriesPresent(
  articles: Article[],
  clusters: StoryCluster[]
): string[] {
  const set = new Set<string>()
  for (const a of articles) {
    if (a?.category) set.add(a.category)
  }
  for (const c of clusters) {
    for (const a of c.articles || []) {
      if (a?.category) set.add(a.category)
    }
  }
  return Array.from(set)
}
