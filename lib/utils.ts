import { Article, StoryCluster } from '@/types'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { TOPIC_KEYWORDS } from './topics'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getParamString = (v: string | string[] | undefined): string | undefined => {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v[0]
  return undefined
}

export const filterByTopic = (
  clusters: StoryCluster[],
  unclustered: Article[],
  topic: string | undefined
) => {
  if (!topic) return { clusters, unclustered }
  const needles = (TOPIC_KEYWORDS[topic] || [topic.toLowerCase()]).map((s) => s.toLowerCase())
  const textHas = (text: string) => needles.some((n) => text.toLowerCase().includes(n))

  return {
    clusters: clusters.filter(
      (c) =>
        textHas(c.clusterTitle) ||
        (c.articles || []).some(
          (a) => textHas(a.title) || (a.description && textHas(a.description))
        )
    ),
    unclustered: unclustered.filter(
      (a) => textHas(a.title) || (a.description && textHas(a.description))
    ),
  }
}
