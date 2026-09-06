// Shared constants for the YouTube subscriptions feature

// Short-lived httpOnly cookie holding the Google OAuth access token
export const YT_ACCESS_TOKEN_COOKIE = 'yt_access_token'

// Google OAuth 2.0 endpoints
export const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_OAUTH_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo'

// Read-only YouTube scope (list subscriptions only)
export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

// YouTube Data API v3 base URL
export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

/** RSS feed URL for a YouTube channel's uploads */
export function channelFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
}

// YouTube channel ids are always "UC" + 22 URL-safe base64 characters
export const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/

// Bound on stored channel titles (real titles are far shorter; caps storage abuse)
export const MAX_CHANNEL_TITLE_LENGTH = 200

/**
 * Channel avatar URLs are rendered as <img src> for other page visitors, so only
 * accept https URLs on Google's avatar hosts (yt3.ggpht.com / *.googleusercontent.com).
 */
export function isAllowedThumbnailUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    return (
      url.hostname === 'yt3.ggpht.com' ||
      url.hostname === 'googleusercontent.com' ||
      url.hostname.endsWith('.googleusercontent.com') ||
      url.hostname.endsWith('.ggpht.com')
    )
  } catch {
    return false
  }
}
