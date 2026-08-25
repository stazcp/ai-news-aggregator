// Source-name normalization — THESIS_TRACKER_SPEC.md §5 wants clean slugs
// ('reuters', 'ft') in articles.source instead of raw RSS feed titles like
// "Fortune | FORTUNE" or "World - CBSNews.com". The full original source
// object survives in raw_json, so this mapping is lossy by design.

// Hosts that aggregate many publishers — their hostname says nothing about
// the outlet, so URL-based derivation must fall through to the name.
const AGGREGATOR_HOSTS = new Set([
  'news.google.com',
  'feeds.feedburner.com',
  'feedproxy.google.com',
])

// Exact-hostname overrides where the registrable domain's main label is not
// the outlet (subdomain-hosted outlets).
const HOST_OVERRIDES: Record<string, string> = {
  'timesofindia.indiatimes.com': 'timesofindia',
  'news.ycombinator.com': 'hacker-news',
}

// Two-part public suffixes seen in the feed registry — enough to find the
// registrable domain's main label without a full public-suffix list.
const SECOND_LEVEL_SUFFIXES = new Set([
  'ac.uk', 'co.uk', 'org.uk', 'co.jp', 'co.in', 'co.kr', 'co.nz', 'co.za',
  'com.au', 'net.au', 'org.au', 'com.br', 'com.cn', 'com.hk', 'com.sg',
])

// Canonical-slug aliases, applied to slugs from BOTH derivation paths. Keys
// are either domain labels or kebab-cased outlet names; values are the
// canonical slug. Only widely used abbreviations (ft, wsj, bbc, nyt, ap,
// wapo, npr, scmp, dw) plus name-form → domain-label folds that keep Google
// News items (clean name, useless URL) consistent with direct-feed items.
const SLUG_ALIASES: Record<string, string> = {
  // widely used abbreviations
  'nytimes': 'nyt', 'the-new-york-times': 'nyt', 'new-york-times': 'nyt',
  'washingtonpost': 'wapo', 'the-washington-post': 'wapo', 'washington-post': 'wapo',
  'apnews': 'ap', 'ap-news': 'ap', 'associated-press': 'ap',
  'wall-street-journal': 'wsj', 'the-wall-street-journal': 'wsj',
  'financial-times': 'ft',
  'bbci': 'bbc', 'bbc-news': 'bbc',
  'south-china-morning-post': 'scmp',
  'deutsche-welle': 'dw',
  'theguardian': 'guardian', 'the-guardian': 'guardian',
  // name-form → domain-label folds
  'fox-news': 'foxnews', 'fox-business': 'foxbusiness',
  'cbs-news': 'cbsnews', 'nbc-news': 'nbcnews', 'abc-news': 'abcnews',
  'al-jazeera': 'aljazeera', 'sky-news': 'sky',
  'the-verge': 'theverge', 'the-hill': 'thehill', 'the-hill-news': 'thehill',
  'the-atlantic': 'theatlantic', 'the-hindu': 'thehindu',
  'the-independent': 'independent', 'the-independent-uk': 'independent',
  'new-york-post': 'nypost', 'business-insider': 'businessinsider',
  'the-daily-wire': 'dailywire', 'france-24': 'france24',
  'the-conversation': 'theconversation',
  'times-of-india': 'timesofindia', 'the-times-of-india': 'timesofindia',
  'android-central': 'androidcentral', 'android-police': 'androidpolice',
  'live-science': 'livescience', 'the-register': 'theregister',
  'yahoo-finance': 'yahoo', 'yahoo-sports': 'yahoo',
}

// Words that never identify an outlet on their own — used to discard feed
// title segments like "Top Stories" or "News | …" when picking the segment
// that names the publisher.
const GENERIC_WORDS = new Set([
  'news', 'latest', 'top', 'stories', 'story', 'breaking', 'headlines',
  'today', 'world', 'international', 'national', 'politics', 'business',
  'technology', 'tech', 'science', 'sports', 'us', 'uk', 'home', 'homepage',
  'front', 'page', 'feed', 'feeds', 'rss', 'articles', 'everything', 'just',
  'in', 'english', 'the', 'and', 'of', 'from', 'on', 'channel', 'update',
  'updates', 'video', 'videos',
])

function kebab(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function applyAlias(slug: string): string {
  return SLUG_ALIASES[slug] ?? slug
}

// Main label of the registrable domain: "rss.nytimes.com" → "nytimes",
// "feeds.bbci.co.uk" → "bbci".
function mainDomainLabel(hostname: string): string {
  const labels = hostname.split('.').filter(Boolean)
  if (labels.length <= 1) return labels[0] ?? ''
  const lastTwo = labels.slice(-2).join('.')
  if (SECOND_LEVEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels[labels.length - 3]
  }
  return labels[labels.length - 2]
}

function slugFromHostname(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host || AGGREGATOR_HOSTS.has(host)) return null
  const override = HOST_OVERRIDES[host]
  if (override) return override
  const slug = kebab(mainDomainLabel(host))
  return slug || null
}

function slugFromUrl(url: string): string | null {
  try {
    return slugFromHostname(new URL(url).hostname)
  } catch {
    return null
  }
}

function isAllGeneric(segment: string): boolean {
  const words = kebab(segment).split('-').filter(Boolean)
  return words.length === 0 || words.every((w) => GENERIC_WORDS.has(w))
}

function slugFromName(name: string): string | null {
  const clean = name.trim()
  if (!clean) return null

  // A domain-like token in the name ("World - CBSNews.com", "www.espn.com -
  // TOP") is the strongest outlet signal — treat it as a hostname.
  const domainMatch = clean.match(/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}/i)
  if (domainMatch) {
    const fromDomain = slugFromHostname(domainMatch[0])
    if (fromDomain) return fromDomain
  }

  // Split on feed-title separators: "|", " - " (hyphen/en/em dash), ": ", ">"
  const segments = clean
    .split(/\s*\|\s*|\s+[-–—]\s+|\s*>\s*|\s*:\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (segments.length === 0) return null

  // Prefer the segment that names the outlet: discard segments made only of
  // generic words ("Top Stories"), then take the shortest (fewest words,
  // earliest on ties) — outlet names are short, headline-ish noise is long.
  const candidates = segments.filter((s) => !isAllGeneric(s))
  const pool = candidates.length > 0 ? candidates : segments
  const best = pool.reduce((a, b) =>
    kebab(b).split('-').length < kebab(a).split('-').length ? b : a
  )
  return kebab(best) || null
}

/**
 * Deterministic, total mapping from a raw RSS source (feed title + URL) to a
 * clean outlet slug. URL hostname is the primary signal; the name is the
 * fallback (aggregator hosts like news.google.com carry a clean publisher
 * name but a useless URL). Never returns an empty string.
 */
export function sourceSlug(name: string, url?: string): string {
  const fromUrl = url ? slugFromUrl(url) : null
  if (fromUrl) return applyAlias(fromUrl)
  const fromName = slugFromName(name ?? '')
  return fromName ? applyAlias(fromName) : 'unknown'
}
