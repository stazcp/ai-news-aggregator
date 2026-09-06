import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeCodeForToken,
  GoogleApiError,
  missingGoogleEnvVars,
  YT_OAUTH_STATE_COOKIE,
} from '@/lib/youtube/google'
import { YT_ACCESS_TOKEN_COOKIE } from '@/lib/youtube/constants'
import { isProjectPaused } from '@/lib/config/projectState'

// Where the user lands after the OAuth dance (the channel picker page)
const PICKER_PATH = '/channels'

function redirectToPicker(request: NextRequest, errorCode?: string): NextResponse {
  const url = new URL(PICKER_PATH, request.url)
  if (errorCode) url.searchParams.set('error', errorCode)
  const response = NextResponse.redirect(url, 302)
  // The state cookie is single-use: always clear it
  response.cookies.set(YT_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}

// Google redirects here with ?code&state (or ?error). Verifies the CSRF state,
// exchanges the code for a short-lived access token, and stores it ONLY in an
// httpOnly cookie whose Max-Age matches the token's expires_in. No refresh
// token is requested (access_type=online) and nothing is persisted server-side.
export async function GET(request: NextRequest) {
  if (isProjectPaused()) {
    // Redirect (not JSON): the user is mid-OAuth; land them on the picker page
    return redirectToPicker(request, 'project_paused')
  }

  if (missingGoogleEnvVars().length > 0) {
    return redirectToPicker(request, 'not_configured')
  }

  const { searchParams } = new URL(request.url)

  const oauthError = searchParams.get('error')
  if (oauthError) {
    // e.g. access_denied when the user cancels the consent screen
    return redirectToPicker(request, 'oauth_denied')
  }

  const code = searchParams.get('code')
  if (!code) {
    return redirectToPicker(request, 'missing_code')
  }

  const state = searchParams.get('state')
  const expectedState = request.cookies.get(YT_OAUTH_STATE_COOKIE)?.value
  if (!state || !expectedState || state !== expectedState) {
    return redirectToPicker(request, 'state_mismatch')
  }

  try {
    const token = await exchangeCodeForToken(code)
    const response = redirectToPicker(request)
    response.cookies.set(YT_ACCESS_TOKEN_COOKIE, token.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, Math.floor(token.expires_in)),
    })
    return response
  } catch (error) {
    // Never log token material; GoogleApiError messages contain none
    const message = error instanceof GoogleApiError ? error.message : 'unknown error'
    console.error('YouTube OAuth callback failed:', message)
    return redirectToPicker(request, 'token_exchange_failed')
  }
}
