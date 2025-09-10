import { StoryCluster } from '@/types'

// Simple keyword-based severity model; optional LLM can replace/augment later.
// Returns {level,label,reasons}. Higher level = higher severity.

const RULES: Array<{ label: string; level: number; patterns: RegExp[] }> = [
  {
    label: 'War/Conflict',
    level: 5,
    patterns: [
      /war|invasion|missile|airstrike|shelling|artillery|frontline|offensive|counteroffensive/i,
      /drone strike|ballistic|cruise missile|rocket attack/i,
      /mobilization|troops|military escalation|ceasefire/i,
    ],
  },
  {
    label: 'Mass Casualty/Deaths',
    level: 4,
    patterns: [
      /killed|dead|deaths|casualties|fatalities|mass shooting|stampede|crash|collapse/i,
      /earthquake|hurricane|typhoon|wildfire|floods?|tsunami|landslide/i,
      /outbreak|pandemic|epidemic/i,
    ],
  },
  {
    label: 'National Politics',
    level: 3,
    patterns: [/election|president|prime minister|parliament|congress|senate|cabinet|impeach/i],
  },
  {
    label: 'Economy/Markets',
    level: 2,
    patterns: [/inflation|recession|gdp|unemployment|interest rate|market crash|bond yield/i],
  },
  {
    label: 'Tech/Business',
    level: 1,
    patterns: [/iphone|launch|earnings|ipo|merger|acquisition|crypto|token|blockchain/i],
  },
]

function textFromCluster(c: StoryCluster): string {
  const titles = [c.clusterTitle || '', ...(c.articles || []).map((a) => a.title || '')]
  const briefs = (c.articles || []).map((a) => a.description || '').filter(Boolean)
  return [...titles, ...briefs].join(' \n ')
}

export function computeSeverity(c: StoryCluster): { level: number; label: string; reasons: string[] } {
  const text = textFromCluster(c)
  const reasons: string[] = []
  let bestLevel = 0
  let bestLabel = 'Other'

  for (const rule of RULES) {
    const matched = rule.patterns.some((re) => re.test(text))
    if (matched && rule.level > bestLevel) {
      bestLevel = rule.level
      bestLabel = rule.label
      reasons.push(rule.label)
    }
  }

  return { level: bestLevel, label: bestLabel, reasons }
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
  const wArticles = options?.wArticles ?? 0.6
  const wDomains = options?.wDomains ?? 0.8
  const wImages = options?.wImages ?? 0.4
  const wRecency = options?.wRecency ?? 0.3
  const severityBoosts = options?.severityBoosts ?? {
    'War/Conflict': 10,
    'Mass Casualty/Deaths': 7,
    'National Politics': 3,
    'Economy/Markets': 2,
    'Tech/Business': 1,
    Other: 0,
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
  const imageBonus = images >= 2 ? 2 : images >= 1 ? 1 : -1

  // Recency: boost clusters whose latest is within ~24h
  let recency = 0
  try {
    const latest = Math.max(...articles.map((a) => new Date(a.publishedAt).getTime()))
    const hours = Math.max(0, (Date.now() - latest) / 36e5)
    recency = Math.exp(-hours / 24) // 1.0 at now, ~0.37 at 24h
  } catch {
    recency = 0
  }

  const sizeScore = Math.log(1 + n) // diminishing returns
  const domainScore = domains
  const imageScore = imageBonus
  const recencyScore = recency

  const base = wArticles * sizeScore + wDomains * domainScore + wImages * imageScore + wRecency * recencyScore

  // Severity boost
  const sev = c.severity?.label || 'Other'
  const boost = severityBoosts[sev] ?? 0

  return base + boost
}

