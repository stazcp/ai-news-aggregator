/**
 * Google News URL Decoder
 *
 * Google News RSS feed <link> elements contain obfuscated redirect URLs
 * (e.g., https://news.google.com/rss/articles/CBMi...) instead of the
 * original article URLs. This module decodes them.
 *
 * Approach:
 * 1. Try base64 decoding (works for older-format URLs with CBMi prefix)
 * 2. Try following HTTP redirects
 * 3. Fall back to the Google News URL as-is (still functional, just redirects)
 */

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
 */
async function tryFollowRedirect(googleNewsUrl: string): Promise<string | null> {
  try {
    const response = await fetch(googleNewsUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
      },
      signal: AbortSignal.timeout(5000),
    })

    // Check for redirect
    const location = response.headers.get('location')
    if (location && !location.includes('news.google.com')) {
      return location
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
 */
export async function decodeGoogleNewsUrls(
  urls: string[],
  options: { concurrency?: number; timeoutMs?: number } = {}
): Promise<Map<string, string>> {
  const { concurrency = 5, timeoutMs = 8000 } = options
  const results = new Map<string, string>()

  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const promises = batch.map(async (url) => {
      // Try base64 decode first (fastest, no network)
      const base64Result = tryBase64Decode(url)
      if (base64Result) {
        results.set(url, base64Result)
        return
      }

      // Try HTTP redirect
      const redirectResult = await tryFollowRedirect(url)
      if (redirectResult) {
        results.set(url, redirectResult)
        return
      }

      // Fall back to Google News URL (still works, just redirects user)
      results.set(url, url)
    })

    await Promise.race([
      Promise.allSettled(promises),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ])

    // Ensure all URLs in this batch have a result (timeout fallback)
    for (const url of batch) {
      if (!results.has(url)) {
        results.set(url, url)
      }
    }
  }

  return results
}
