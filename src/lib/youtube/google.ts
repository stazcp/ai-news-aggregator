// Server-side Google OAuth + YouTube Data API helpers.
// Plain fetch() only — no googleapis dependency. Never log or expose access tokens.
import {
  GOOGLE_OAUTH_AUTH_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_OAUTH_TOKENINFO_URL,
  YOUTUBE_API_BASE,
  YOUTUBE_READONLY_SCOPE,
} from './constants'
import type { YouTubeChannel } from '@/types'

// Short-lived httpOnly cookie holding the OAuth CSRF state during the redirect dance
export const YT_OAUTH_STATE_COOKIE = 'yt_oauth_state'

// Safety cap on subscription pagination (50 per page => 1000 channels max)
const MAX_SUBSCRIPTION_PAGES = 20

export const GOOGLE_ENV_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] as const

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** Names of the Google OAuth env vars that are missing/empty. Empty array = fully configured. */
export function missingGoogleEnvVars(): string[] {
  return GOOGLE_ENV_VARS.filter((name) => {
    const value = process.env[name]
    return !value || value.trim() === ''
  })
}

/** Returns the OAuth config, or null when any env var is unset (degrade gracefully, never crash). */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  if (missingGoogleEnvVars().length > 0) return null
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    redirectUri: process.env.GOOGLE_REDIRECT_URI!.trim(),
  }
}

/** Typed error for non-OK Google responses. Message never contains tokens. */
export class GoogleApiError extends Error {
  readonly status: number
  /** Google's machine-readable reason (e.g. 'quotaExceeded', 'authError'), when the body provides one. */
  readonly reason?: string

  constructor(status: number, message: string, reason?: string) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
    this.reason = reason
  }
}

/** YouTube Data API 403 reasons that indicate quota exhaustion rather than a bad/expired token. */
export const QUOTA_ERROR_REASONS = ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded']

/**
 * Build the Google consent URL for the youtube.readonly scope.
 * access_type=online: no refresh token is issued or stored.
 * Throws GoogleApiError(503) when env vars are unset — callers should pre-check.
 */
export function buildAuthUrl(state: string): string {
  const config = getGoogleOAuthConfig()
  if (!config) {
    throw new GoogleApiError(503, `Google OAuth is not configured (missing: ${missingGoogleEnvVars().join(', ')})`)
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: YOUTUBE_READONLY_SCOPE,
    state,
    access_type: 'online',
    prompt: 'consent',
  })
  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`
}

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
}

/**
 * Exchange an authorization code for a short-lived access token.
 * Throws GoogleApiError on config/network/HTTP/shape problems (never includes token material).
 */
export async function exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
  const config = getGoogleOAuthConfig()
  if (!config) {
    throw new GoogleApiError(503, `Google OAuth is not configured (missing: ${missingGoogleEnvVars().join(', ')})`)
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })

  if (!response.ok) {
    // Google returns {error, error_description}; surface only the short error code
    const body = await response.json().catch(() => ({}))
    const reason = typeof body?.error === 'string' ? body.error : 'token_exchange_failed'
    throw new GoogleApiError(response.status, `Google token exchange failed: ${reason}`)
  }

  const data = await response.json().catch(() => null)
  if (!data || typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
    throw new GoogleApiError(502, 'Google token exchange returned an unexpected response shape')
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    token_type: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
    scope: typeof data.scope === 'string' ? data.scope : undefined,
  }
}

/**
 * Verify that an access token is live and was issued to THIS app's OAuth client
 * (tokeninfo `aud` check). Used as proof of ownership for mutating endpoints.
 * Returns false for invalid/expired/foreign tokens, or when OAuth is unconfigured.
 * Throws GoogleApiError(502) when Google cannot be reached (callers fail closed).
 */
export async function verifyAccessToken(accessToken: string): Promise<boolean> {
  const config = getGoogleOAuthConfig()
  if (!config) return false

  let response: Response
  try {
    // POST form body keeps the token out of URLs (and any URL-based logging)
    response = await fetch(GOOGLE_OAUTH_TOKENINFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: accessToken }).toString(),
    })
  } catch {
    throw new GoogleApiError(502, 'Google tokeninfo request failed')
  }

  // Non-OK means the token is invalid or expired
  if (!response.ok) return false

  const data = await response.json().catch(() => null)
  return typeof data?.aud === 'string' && data.aud === config.clientId
}

interface SubscriptionItem {
  snippet?: {
    title?: string
    resourceId?: { channelId?: string }
    thumbnails?: { default?: { url?: string } }
  }
}

interface SubscriptionListResponse {
  items?: SubscriptionItem[]
  nextPageToken?: string
}

/**
 * List ALL of the user's YouTube subscriptions, following nextPageToken.
 * Throws GoogleApiError on non-OK responses (401 => token expired/invalid).
 */
export async function fetchAllSubscriptions(accessToken: string): Promise<YouTubeChannel[]> {
  const channels: YouTubeChannel[] = []
  let pageToken: string | undefined

  for (let page = 0; page < MAX_SUBSCRIPTION_PAGES; page++) {
    const params = new URLSearchParams({
      part: 'snippet',
      mine: 'true',
      maxResults: '50',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const response = await fetch(`${YOUTUBE_API_BASE}/subscriptions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as {
        error?: { errors?: Array<{ reason?: string }> }
      } | null
      const reason = errBody?.error?.errors?.[0]?.reason
      throw new GoogleApiError(
        response.status,
        `YouTube subscriptions request failed (HTTP ${response.status})`,
        reason
      )
    }

    const data = (await response.json().catch(() => ({}))) as SubscriptionListResponse
    for (const item of data.items ?? []) {
      const id = item?.snippet?.resourceId?.channelId
      const title = item?.snippet?.title
      if (typeof id !== 'string' || id === '' || typeof title !== 'string' || title === '') continue

      const channel: YouTubeChannel = { id, title }
      const thumbnail = item?.snippet?.thumbnails?.default?.url
      if (typeof thumbnail === 'string' && thumbnail !== '') channel.thumbnail = thumbnail
      channels.push(channel)
    }

    pageToken = data.nextPageToken
    if (!pageToken) break
  }

  return channels
}
