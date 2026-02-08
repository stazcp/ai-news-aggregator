/**
 * Google News Helpers
 *
 * All Google-News-specific logic lives here so `newsService.ts` stays generic:
 *   - URL decoding (base64 / redirect fallback)
 *   - Publisher extraction from RSS <source> tag or title suffix
 *   - Title cleaning (strip " - Publisher" suffix)
 *   - Post-decode source.url backfill
 */

import type { Article } from '@/types'

const GOOGLE_NEWS_ARTICLE_PREFIX = 'https://news.google.com/rss/articles/'

/**
 * Check if a feed URL is from Google News (to apply special handling).
 */
export function isGoogleNewsFeed(feedUrl: string): boolean {
  try {
    const u = new URL(feedUrl)
    return u.hostname === 'news.google.com'
  } catch {
    return false
  }
}

/**
 * Extract the source/publisher name from a Google News RSS item title.
 * Google News titles are formatted as "Headline - Publisher Name".
 */
export function extractPublisherFromTitle(title: string): string | null {
  const lastDash = title.lastIndexOf(' - ')
  if (lastDash > 0 && lastDash < title.length - 3) {
    return title.substring(lastDash + 3).trim()
  }
  return null
}

/**
 * Try to decode a Google News article URL using base64 decoding.
 * Works for older-format URLs where the article ID starts with "CBMi".
 */
function tryBase64Decode(googleNewsUrl: string): string | null {
  try {
    const articlePath = googleNewsUrl.replace(GOOGLE_NEWS_ARTICLE_PREFIX, '')
    // Remove any query parameters
    const articleId = articlePath.split('?')[0]

    // Try base64 decode
    const decoded = Buffer.from(articleId, 'base64')
    // The decoded bytes contain a protobuf-encoded URL
    // The URL typically starts after a few header bytes
    const str = decoded.toString('utf-8')

    // Look for http:// or https:// in the decoded string
    const httpIndex = str.indexOf('http')
    if (httpIndex >= 0) {
      // Extract the URL - it continues until a non-URL character or end of string
      const urlPart = str.substring(httpIndex)
      // Find the end of the URL (protobuf may have trailing bytes)
      const match = urlPart.match(/^https?:\/\/[^\x00-\x1f\s"<>]+/)
      if (match) {
        return match[0]
      }
    }
  } catch {
    // Base64 decode failed, not an older format URL
  }
  return null
}

/**
 * Try to resolve a Google News URL by following HTTP redirects.
 * Uses HEAD to avoid downloading the full response body — we only need
 * the status code and Location header to detect a 302 redirect.
 * @param timeoutMs  Per-request timeout (default 1 500 ms)
 */
async function tryFollowRedirect(
  googleNewsUrl: string,
  timeoutMs: number = 1500
): Promise<string | null> {
  try {
    const response = await fetch(googleNewsUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    // Check for redirect — reject any Google-owned intermediate pages
    // (consent.google.com, accounts.google.de, google.co.jp/url, etc.)
    // Uses a regex that matches all Google ccTLDs (google.com, google.de,
    // google.co.uk, google.com.au, …) and their subdomains.
    const location = response.headers.get('location')
    if (location) {
      try {
        const host = new URL(location).hostname.toLowerCase()
        const isGoogleDomain = /(?:^|\.)google\.[a-z.]+$/.test(host)
        if (!isGoogleDomain) {
          return location
        }
      } catch {
        // Malformed location header — ignore
      }
    }
  } catch {
    // Redirect follow failed
  }
  return null
}

/**
 * Decode a batch of Google News article URLs.
 * Returns a Map of original Google News URL -> decoded URL.
 * URLs that can't be decoded are mapped to themselves.
 *
 * Uses a two-phase approach to stay within time budgets:
 *   Phase 1 – base64 decode (synchronous, instant, no I/O)
 *   Phase 2 – HTTP redirect fallback with a hard total-time cap
 *
 * The total time budget (`totalTimeoutMs`, default 4 s) prevents this from
 * exceeding the 15 s outer feed timeout in `fetchAllNews`.
 * `fetchRSSFeed` passes a dynamic budget based on time already spent on
 * RSS parsing, so the decode phase never causes the outer timeout to fire.
 */
export async function decodeGoogleNewsUrls(
  urls: string[],
  options: {
    concurrency?: number
    perRequestTimeoutMs?: number
    totalTimeoutMs?: number
  } = {}
): Promise<Map<string, string>> {
  const { concurrency = 10, perRequestTimeoutMs = 1500, totalTimeoutMs = 4000 } = options
  const results = new Map<string, string>()

  // ── Phase 1: base64 decode (free, no network) ──────────────────────
  const needsNetwork: string[] = []
  for (const url of urls) {
    const base64Result = tryBase64Decode(url)
    if (base64Result) {
      results.set(url, base64Result)
    } else {
      needsNetwork.push(url)
    }
  }

  if (needsNetwork.length === 0) return results

  // ── Phase 2: HTTP redirect with a hard total time budget ───────────
  const startTime = Date.now()

  for (let i = 0; i < needsNetwork.length; i += concurrency) {
    const elapsed = Date.now() - startTime
    if (elapsed >= totalTimeoutMs) break // budget exhausted

    const batch = needsNetwork.slice(i, i + concurrency)
    const remainingMs = totalTimeoutMs - elapsed
    const batchRequestTimeout = Math.min(perRequestTimeoutMs, remainingMs)

    const promises = batch.map(async (url) => {
      const redirectResult = await tryFollowRedirect(url, batchRequestTimeout)
      results.set(url, redirectResult || url)
    })

    // Race batch against remaining time budget
    await Promise.race([
      Promise.allSettled(promises),
      new Promise((resolve) => setTimeout(resolve, remainingMs)),
    ])

    // Map any URLs that didn't resolve in time to themselves
    for (const url of batch) {
      if (!results.has(url)) {
        results.set(url, url)
      }
    }
  }

  // Ensure every input URL has a mapping (handles budget-exhausted remainder)
  for (const url of urls) {
    if (!results.has(url)) {
      results.set(url, url)
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Higher-level helpers used by newsService to keep Google News logic here
// ---------------------------------------------------------------------------

/**
 * Extract publisher name & URL from a Google News RSS item's <source> tag
 * and/or the " - Publisher" title suffix.
 *
 * @param item        The raw RSS item (typed loosely because rss-parser output varies)
 * @param fallbackName  Default source name when extraction fails (e.g. feed title)
 * @param fallbackUrl   Default source URL when extraction fails (e.g. feed link)
 * @returns `{ sourceName, sourceUrl }` for the article
 */
export function extractGoogleNewsSource(
  item: Record<string, any>,
  fallbackName: string,
  fallbackUrl: string
): { sourceName: string; sourceUrl: string } {
  let sourceName = fallbackName
  let sourceUrl = fallbackUrl

  const itemSource = item.source
  if (itemSource) {
    if (typeof itemSource === 'string') {
      sourceName = itemSource
    } else if (typeof itemSource === 'object') {
      sourceName = itemSource._ || itemSource['#text'] || itemSource['$']?.url || sourceName
      if (itemSource['$']?.url) sourceUrl = itemSource['$'].url
    }
  }

  // Fallback: extract publisher from title ("Headline - Publisher")
  // Also handle case where sourceName is a URL instead of a readable name
  const isUrlSource = sourceName.startsWith('http') || sourceName.includes('://')
  if (sourceName === 'Google News' || sourceName.includes('news.google.com') || isUrlSource) {
    const fromTitle = extractPublisherFromTitle(item.title || '')
    if (fromTitle) {
      sourceName = fromTitle
    } else if (isUrlSource) {
      // Last resort: extract readable name from URL hostname
      try {
        const host = new URL(sourceName).hostname.replace(/^www\./, '')
        sourceName = host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1)
      } catch {
        // Keep as-is if URL parsing fails
      }
    }
  }

  return { sourceName, sourceUrl }
}

/**
 * Strip the " - Publisher" suffix that Google News appends to titles.
 */
export function cleanGoogleNewsTitle(rawTitle: string): string {
  const lastDash = rawTitle.lastIndexOf(' - ')
  if (lastDash > 0) {
    return rawTitle.substring(0, lastDash).trim()
  }
  return rawTitle
}

/**
 * After URL decoding, backfill `article.source.url` with the decoded article's
 * origin when the current source URL is missing or still points at news.google.com.
 * This ensures the per-domain diversity cap in clusterService uses the real
 * publisher domain.
 *
 * @param totalTimeoutMs  Hard cap on network time spent decoding URLs (default 4 s).
 *                        Callers should pass a dynamic budget based on elapsed time.
 */
export async function decodeAndBackfillGoogleNewsArticles(
  articles: Article[],
  options?: { totalTimeoutMs?: number }
): Promise<void> {
  const googleUrls = articles
    .filter((a) => a.url.includes('news.google.com/rss/articles/'))
    .map((a) => a.url)

  if (googleUrls.length === 0) return

  const decoded = await decodeGoogleNewsUrls(googleUrls, {
    totalTimeoutMs: options?.totalTimeoutMs,
  })
  for (const article of articles) {
    const realUrl = decoded.get(article.url)
    if (realUrl && realUrl !== article.url) {
      article.url = realUrl
      // Backfill source.url with decoded origin so per-domain diversity cap
      // uses publisher domain when RSS had no <source url> or it was news.google.com
      try {
        const decodedOrigin = new URL(realUrl).origin
        const current = article.source?.url
        const currentIsGoogle = current && new URL(current).hostname === 'news.google.com'
        if (!current || currentIsGoogle) {
          article.source = {
            name: article.source?.name ?? 'Unknown',
            url: decodedOrigin,
          }
        }
      } catch {
        // ignore URL parse errors
      }
    }
  }
}
