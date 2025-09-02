import { Article, StoryCluster } from '@/types'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { TOPIC_KEYWORDS, computeKeywordScore } from './topics'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
