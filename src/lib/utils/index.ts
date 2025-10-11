import { Article, StoryCluster } from '@/types'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { computeKeywordScore } from '../topics'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Simple hash function for generating deterministic IDs from strings
 * Uses bit shifting and character codes to create collision-resistant hashes
 */
export function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36) // Convert to base36 string
}

export const getParamString = (v: string | string[] | undefined): string | undefined => {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v[0]
  return undefined
}

// Aliases to map UI topic names to feed categories
const CATEGORY_ALIASES: Record<string, string[]> = {
  'Artificial Intelligence': ['AI', 'Artificial Intelligence'],
  Technology: ['Technology'],
  Business: ['Business'],
  Science: ['Science'],
  World: ['World', 'World News'],
  Politics: ['Politics', 'US Politics'],
  Climate: ['Environment', 'Climate'],
  Health: ['Health'],
  Crypto: ['Crypto', 'Cryptocurrency'],
}

function categoryMatches(topic: string, category?: string): boolean {
  if (!category) return false
  const t = topic.toLowerCase()
  const c = category.toLowerCase()
  const aliases = (CATEGORY_ALIASES[topic] || [topic]).map((x) => x.toLowerCase())
  return c === t || aliases.includes(category) || aliases.includes(c)
}

function getDominantCategoryFromCluster(cluster: StoryCluster): string | undefined {
  const freq = new Map<string, number>()
  for (const a of cluster.articles || []) {
    if (!a?.category) continue
    freq.set(a.category, (freq.get(a.category) || 0) + 1)
  }
  let best: string | undefined
  let bestCount = -1
  for (const [cat, count] of freq.entries()) {
    if (count > bestCount) {
      best = cat
      bestCount = count
    }
  }
  return best
}

export const filterByTopic = (
  clusters: StoryCluster[],
  unclustered: Article[],
  topic: string | undefined
) => {
  if (!topic) return { clusters, unclustered }

  const clusterOk = (c: StoryCluster) => {
    const dominant = getDominantCategoryFromCluster(c) || c.articles?.[0]?.category
    return categoryMatches(topic, dominant)
  }

  const articleOk = (a: Article) => categoryMatches(topic, a.category)

  return {
    clusters: clusters.filter(clusterOk).sort((a, b) => {
      const ta = [
        a.clusterTitle,
        ...(a.articles || []).map((x) => `${x.title} ${x.description || ''}`),
      ].join(' ')
      const tb = [
        b.clusterTitle,
        ...(b.articles || []).map((x) => `${x.title} ${x.description || ''}`),
      ].join(' ')
      return computeKeywordScore(topic, tb) - computeKeywordScore(topic, ta)
    }),
    unclustered: unclustered
      .filter(articleOk)
      .sort(
        (a, b) =>
          computeKeywordScore(topic, `${b.title} ${b.description || ''}`) -
          computeKeywordScore(topic, `${a.title} ${a.description || ''}`)
      ),
  }
}

export interface CategorySummaryPayload {
  id: string
  content: string
  articleCount: number
}

/**
 * Build a normalized payload for category-level summaries using top clusters and headlines.
 */
export function buildCategorySummaryPayload(
  label: string,
  clusters: StoryCluster[],
  unclustered: Article[],
  options?: {
    maxClusters?: number
    maxArticlesPerCluster?: number
    maxStandaloneArticles?: number
  }
): CategorySummaryPayload | null {
  const topicLabel = label.trim() || 'Trending'
  if (!clusters.length && !unclustered.length) return null

  const { maxClusters = 4, maxArticlesPerCluster = 3, maxStandaloneArticles = 4 } = options || {}

  const seen = new Set<string>()
  const orderedArticles: Article[] = []
  const addArticle = (article: Article | undefined) => {
    if (!article?.id) return
    if (seen.has(article.id)) return
    seen.add(article.id)
    orderedArticles.push(article)
  }

  const sanitize = (input: string | undefined, fallback = ''): string =>
    (input || fallback)
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const truncate = (input: string, max = 260) =>
    input.length <= max ? input : `${input.slice(0, max - 3)}...`

  const clusterSections: string[] = []
  const topClusters = clusters.slice(0, Math.max(0, maxClusters))

  topClusters.forEach((cluster, index) => {
    const lines: string[] = []
    lines.push(`${index + 1}. ${cluster.clusterTitle}`)

    const articles = (cluster.articles || []).slice(0, Math.max(1, maxArticlesPerCluster))
    articles.forEach((article) => {
      addArticle(article)
      const snippet = truncate(
        sanitize(article.description || article.content || '', 'No description provided.'),
        220
      )
      const source = article.source?.name ? ` (${article.source.name})` : ''
      lines.push(`- ${article.title}${source}: ${snippet}`)
    })

    if (cluster.summary) {
      lines.push(`Summary cue: ${truncate(sanitize(cluster.summary), 280)}`)
    }

    clusterSections.push(lines.join('\n'))
  })

  const standaloneLines: string[] = []
  for (const article of unclustered) {
    if (standaloneLines.length >= Math.max(0, maxStandaloneArticles)) break
    const before = seen.size
    addArticle(article)
    if (seen.size === before) continue
    const snippet = truncate(
      sanitize(article.description || article.content || '', 'No description provided.'),
      220
    )
    const source = article.source?.name ? ` (${article.source.name})` : ''
    standaloneLines.push(`- ${article.title}${source}: ${snippet}`)
  }

  if (orderedArticles.length === 0) return null

  const sections: string[] = []
  sections.push(`Topic: ${topicLabel}`)

  if (clusterSections.length) {
    sections.push('Top story groups:\n' + clusterSections.join('\n\n'))
  }

  if (standaloneLines.length) {
    sections.push('Additional headlines:\n' + standaloneLines.join('\n'))
  }

  const content = sections.join('\n\n')

  if (!content || content.length < 40) return null

  const signature = orderedArticles.map((a) => a.id).join('|')
  const cacheId = `category-${simpleHash(`${topicLabel}|${signature}`)}`

  return {
    id: cacheId,
    content,
    articleCount: orderedArticles.length,
  }
}

/**
 * Get the cache TTL from the environment variable
 * @returns The cache TTL in seconds
 */
export const getCacheTtl = (): number => {
  const ttl = Number(process.env.CACHE_TTL_SECONDS)
  return isNaN(ttl) ? 43200 : ttl
}
