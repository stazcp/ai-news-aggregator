import { NextRequest, NextResponse } from 'next/server'
import {
  fetchAllSubscriptions,
  GoogleApiError,
  missingGoogleEnvVars,
  QUOTA_ERROR_REASONS,
} from '@/lib/youtube/google'
import { YT_ACCESS_TOKEN_COOKIE } from '@/lib/youtube/constants'
import { isProjectPaused } from '@/lib/config/projectState'

// List the signed-in user's YouTube subscriptions using the short-lived
// access token cookie. The token is never logged or returned.
export async function GET(request: NextRequest) {
  if (isProjectPaused()) {
    return NextResponse.json(
      { error: 'Project paused. YouTube subscriptions have been disabled.' },
      { status: 410 }
    )
  }

  // 503 (not 401) when OAuth is unconfigured, so the picker shows setup
  // instructions instead of a Connect button that cannot work.
  const missing = missingGoogleEnvVars()
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Google OAuth is not configured. Set the following environment variables: ${missing.join(', ')}`,
        missing,
      },
      { status: 503 }
    )
  }

  const accessToken = request.cookies.get(YT_ACCESS_TOKEN_COOKIE)?.value
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Not connected to YouTube. Visit /api/youtube/auth to sign in.' },
      { status: 401 }
    )
  }

  try {
    const channels = await fetchAllSubscriptions(accessToken)
    return NextResponse.json({ channels })
  } catch (error) {
    // A 403 with a quota reason is not an auth problem: keep the cookie and
    // surface a retry-later error instead of a misleading re-auth loop.
    if (
      error instanceof GoogleApiError &&
      error.status === 403 &&
      error.reason &&
      QUOTA_ERROR_REASONS.includes(error.reason)
    ) {
      return NextResponse.json(
        { error: 'YouTube API quota exceeded. Try again later.' },
        { status: 429 }
      )
    }

    if (error instanceof GoogleApiError && (error.status === 401 || error.status === 403)) {
      const response = NextResponse.json(
        { error: 'YouTube session expired or was revoked. Sign in again via /api/youtube/auth.' },
        { status: 401 }
      )
      // Drop the stale token cookie
      response.cookies.set(YT_ACCESS_TOKEN_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      })
      return response
    }

    const message = error instanceof GoogleApiError ? error.message : 'unknown error'
    console.error('Failed to fetch YouTube subscriptions:', message)
    return NextResponse.json({ error: 'Failed to fetch YouTube subscriptions' }, { status: 502 })
  }
}
