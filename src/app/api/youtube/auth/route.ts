import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { buildAuthUrl, missingGoogleEnvVars, YT_OAUTH_STATE_COOKIE } from '@/lib/youtube/google'
import { isProjectPaused } from '@/lib/config/projectState'

// Kick off the Google OAuth consent flow for the youtube.readonly scope.
// Stores a random CSRF state in a short-lived httpOnly cookie and 302s to Google.
export async function GET() {
  if (isProjectPaused()) {
    return NextResponse.json(
      { error: 'Project paused. YouTube sign-in has been disabled.' },
      { status: 410 }
    )
  }

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

  const state = randomUUID()
  const response = NextResponse.redirect(buildAuthUrl(state), 302)
  response.cookies.set(YT_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60, // 10 minutes: only needs to survive the consent redirect
  })
  return response
}
