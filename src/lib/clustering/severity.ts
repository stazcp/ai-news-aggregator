import { StoryCluster } from '@/types'
import { ENV_DEFAULTS, envNumber } from '@/lib/config/env'
import rssConfig from '../news/rss-feeds.json'

type CategoryMeta =
  | { level: number; label: string }
  | { ambiguous: true }

const CATEGORY_META: Record<string, CategoryMeta> =
  (rssConfig as any).categoryMeta ?? {}

/**
 * Derive severity from the dominant feed category of the cluster's articles.
 * Returns the mapped severity when the category is unambiguous, or level 0
 * with ambiguous=true when the category needs LLM classification.
 * Unknown categories (not in categoryMeta) are also treated as ambiguous.
 */
export function computeSeverity(c: StoryCluster): {
  level: number
  label: string
  reasons: string[]
  ambiguous: boolean
} {
  const articles = c.articles || []

  // Tally article categories to find dominant one
  const counts = new Map<string, number>()
  for (const a of articles) {
    if (a.category) counts.set(a.category, (counts.get(a.category) || 0) + 1)
  }

  let dominantCategory = ''
  let maxCount = 0
  for (const [cat, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      dominantCategory = cat
    }
  }

  const meta = dominantCategory ? CATEGORY_META[dominantCategory] : undefined

  if (!meta || 'ambiguous' in meta) {
    return { level: 0, label: 'Other', reasons: [], ambiguous: true }
  }

  return {
    level: meta.level,
    label: meta.label,
    reasons: [dominantCategory],
    ambiguous: false,
  }
}

export function isAmbiguousCategory(c: StoryCluster): boolean {
  return computeSeverity(c).ambiguous
}

export function scoreCluster(
  c: StoryCluster,
  options?: {
    wArticles?: number
    wDomains?: number
    wImages?: number
    wRecency?: number
    severityBoosts?: Record<string, number>
  }
): number {
  const wArticles = options?.wArticles ?? envNumber('SCORE_W_ARTICLES', ENV_DEFAULTS.scoreWArticles)
  const wDomains = options?.wDomains ?? envNumber('SCORE_W_DOMAINS', ENV_DEFAULTS.scoreWDomains)
  const wImages = options?.wImages ?? envNumber('SCORE_W_IMAGES', ENV_DEFAULTS.scoreWImages)
  const wRecency = options?.wRecency ?? envNumber('SCORE_W_RECENCY', ENV_DEFAULTS.scoreWRecency)
  const severityBoosts = options?.severityBoosts ?? {
    'War/Conflict': envNumber('SEVERITY_BOOST_WAR', ENV_DEFAULTS.severityBoostWar),
    'Mass Casualty/Deaths': envNumber('SEVERITY_BOOST_DEATHS', ENV_DEFAULTS.severityBoostDeaths),
    'National Politics': envNumber('SEVERITY_BOOST_POLITICS', ENV_DEFAULTS.severityBoostPolitics),
    'Economy/Markets': envNumber('SEVERITY_BOOST_ECONOMY', ENV_DEFAULTS.severityBoostEconomy),
    'Tech/Business': envNumber('SEVERITY_BOOST_TECH', ENV_DEFAULTS.severityBoostTech),
    Other: envNumber('SEVERITY_BOOST_OTHER', ENV_DEFAULTS.severityBoostOther),
  }

  const articles = c.articles || []
  const n = articles.length
  const domains = new Set(
    articles
      .map((a) => {
        try {
          return new URL(a.url).hostname.replace(/^www\./, '')
        } catch {
          return ''
        }
      })
      .filter(Boolean)
  ).size
  const images = (c.imageUrls || []).length
  const BONUS_GE2 = envNumber('SCORE_IMAGE_BONUS_GE2', ENV_DEFAULTS.scoreImageBonusGe2)
  const BONUS_GE1 = envNumber('SCORE_IMAGE_BONUS_GE1', ENV_DEFAULTS.scoreImageBonusGe1)
  const PENALTY_NONE = envNumber('SCORE_IMAGE_PENALTY_NONE', ENV_DEFAULTS.scoreImagePenaltyNone)
  const imageBonus = images >= 2 ? BONUS_GE2 : images >= 1 ? BONUS_GE1 : PENALTY_NONE

  let recency = 0
  try {
    const latest = Math.max(...articles.map((a) => new Date(a.publishedAt).getTime()))
    const hours = Math.max(0, (Date.now() - latest) / 36e5)
    recency = Math.exp(-hours / 24)
  } catch {
    recency = 0
  }

  const base =
    wArticles * Math.log(1 + n) +
    wDomains * Math.log(1 + domains) +
    wImages * imageBonus +
    wRecency * recency

  const boost = severityBoosts[c.severity?.label || 'Other'] ?? 0
  return base + boost
}
