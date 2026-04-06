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
    wVelocity?: number
    velocityWindowHours?: number
    severityMultipliers?: Record<string, number>
  }
): number {
  const wArticles = options?.wArticles ?? envNumber('SCORE_W_ARTICLES', ENV_DEFAULTS.scoreWArticles)
  const wDomains = options?.wDomains ?? envNumber('SCORE_W_DOMAINS', ENV_DEFAULTS.scoreWDomains)
  const wImages = options?.wImages ?? envNumber('SCORE_W_IMAGES', ENV_DEFAULTS.scoreWImages)
  const wVelocity = options?.wVelocity ?? envNumber('SCORE_W_VELOCITY', ENV_DEFAULTS.scoreWVelocity)
  const velocityWindowHours =
    options?.velocityWindowHours ??
    envNumber('SCORE_VELOCITY_WINDOW_HOURS', ENV_DEFAULTS.scoreVelocityWindowHours)
  const severityMultipliers = options?.severityMultipliers ?? {
    'War/Conflict': envNumber('SEVERITY_MULT_WAR', ENV_DEFAULTS.severityMultWar),
    'Mass Casualty/Deaths': envNumber('SEVERITY_MULT_DEATHS', ENV_DEFAULTS.severityMultDeaths),
    'National Politics': envNumber('SEVERITY_MULT_POLITICS', ENV_DEFAULTS.severityMultPolitics),
    'Economy/Markets': envNumber('SEVERITY_MULT_ECONOMY', ENV_DEFAULTS.severityMultEconomy),
    'Tech/Business': envNumber('SEVERITY_MULT_TECH', ENV_DEFAULTS.severityMultTech),
    Other: 1.0,
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

  // Velocity: ratio of articles published within the window × log of their count
  // High velocity = story is actively gaining coverage right now
  const now = Date.now()
  const windowMs = velocityWindowHours * 3.6e6
  const recentCount = articles.filter((a) => {
    try {
      return now - new Date(a.publishedAt).getTime() <= windowMs
    } catch {
      return false
    }
  }).length
  const velocity = n > 0 ? recentCount / n : 0
  const hotBoost = velocity * Math.log(1 + recentCount)

  const base =
    wArticles * Math.log(1 + n) +
    wDomains * Math.log(1 + domains) +
    wImages * imageBonus +
    wVelocity * hotBoost

  // Severity nudges the outcome but cannot overpower a cold story
  const multiplier = severityMultipliers[c.severity?.label || 'Other'] ?? 1.0
  return base * multiplier
}
