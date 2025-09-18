// lib/normalizeImageUrl.ts

/**
 * Normalizes BBC image URLs to get higher resolution versions
 * BBC often serves low-res images in RSS feeds, this upgrades them
 */
export function normalizeBBC(url: string, desired = 976): string {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('ichef.bbci.co.uk')) {
      // Handle different BBC URL patterns:
      // /ace/standard/240/ -> /ace/standard/976/
      // /news/624/ -> /news/976/
      // /images/ic/320x320/ -> /images/ic/976x976/
      u.pathname = u.pathname.replace(/\/ace\/standard\/\d+\//, `/ace/standard/${desired}/`)
      u.pathname = u.pathname.replace(/\/news\/\d+\//, `/news/${desired}/`)
      u.pathname = u.pathname.replace(
        /\/images\/ic\/\d+x\d+\//,
        `/images/ic/${desired}x${desired}/`
      )
      return u.toString()
    }
  } catch {
    // If URL parsing fails, return original
  }
  return url
}

/**
 * Normalizes image URLs from various news sources to get better quality images
 * Currently supports BBC, can be extended for other sources
 */
export function normalizeImageUrl(url: string, desiredWidth = 976): string {
  if (!url) return url

  try {
    const hostname = new URL(url).hostname

    // BBC images - upgrade to higher resolution
    if (hostname.endsWith('ichef.bbci.co.uk')) {
      return normalizeBBC(url, desiredWidth)
    }

    // Avoid generic query param upscaling because some providers use
    // similarly named params for signatures or non-size purposes.

    // Add other normalizers here as needed
    // if (hostname.endsWith('cnn.com')) {
    //   return normalizeCNN(url, desiredWidth)
    // }

    return url
  } catch {
    return url
  }
}
