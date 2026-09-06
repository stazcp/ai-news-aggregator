import { NextRequest } from 'next/server'
import { GET } from '../route'

jest.mock('../../../../../lib/youtube/google', () => {
  const actual = jest.requireActual('../../../../../lib/youtube/google')
  return {
    ...actual,
    exchangeCodeForToken: jest.fn(),
    missingGoogleEnvVars: jest.fn().mockReturnValue([]),
  }
})

import { exchangeCodeForToken, GoogleApiError, missingGoogleEnvVars } from '../../../../../lib/youtube/google'
const mockExchange = exchangeCodeForToken as jest.MockedFunction<typeof exchangeCodeForToken>
const mockMissingEnv = missingGoogleEnvVars as jest.MockedFunction<typeof missingGoogleEnvVars>

function createRequest(params: Record<string, string>, stateCookie?: string) {
  const url = new URL('http://localhost:3000/api/youtube/callback')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const headers: Record<string, string> = {}
  if (stateCookie !== undefined) headers.cookie = `yt_oauth_state=${stateCookie}`
  return new NextRequest(url.toString(), { headers })
}

describe('/api/youtube/callback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockMissingEnv.mockReturnValue([])
    mockExchange.mockResolvedValue({
      access_token: 'ya29.secret-token',
      expires_in: 3599,
      token_type: 'Bearer',
    })
  })

  it('redirects to /channels?error=not_configured when env is unset', async () => {
    mockMissingEnv.mockReturnValue(['GOOGLE_CLIENT_ID'])

    const response = await GET(createRequest({ code: 'c', state: 's' }, 's'))

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/channels')
    expect(location.searchParams.get('error')).toBe('not_configured')
    expect(mockExchange).not.toHaveBeenCalled()
  })

  it('redirects with oauth_denied when Google returns an error param', async () => {
    const response = await GET(createRequest({ error: 'access_denied' }, 'state-1'))

    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('error')).toBe('oauth_denied')
    expect(mockExchange).not.toHaveBeenCalled()
  })

  it('redirects with missing_code when no code is present', async () => {
    const response = await GET(createRequest({ state: 'state-1' }, 'state-1'))

    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('error')).toBe('missing_code')
  })

  it('rejects a state mismatch without exchanging the code', async () => {
    const response = await GET(createRequest({ code: 'c', state: 'attacker-state' }, 'real-state'))

    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('error')).toBe('state_mismatch')
    expect(mockExchange).not.toHaveBeenCalled()
  })

  it('rejects when the state cookie is absent', async () => {
    const response = await GET(createRequest({ code: 'c', state: 'some-state' }))

    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('error')).toBe('state_mismatch')
    expect(mockExchange).not.toHaveBeenCalled()
  })

  it('exchanges the code, sets the httpOnly token cookie, and redirects to /channels', async () => {
    const response = await GET(createRequest({ code: 'auth-code', state: 'state-1' }, 'state-1'))

    expect(mockExchange).toHaveBeenCalledWith('auth-code')
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/channels')
    expect(location.searchParams.get('error')).toBeNull()

    const tokenCookie = response.cookies.get('yt_access_token')
    expect(tokenCookie).toBeDefined()
    expect(tokenCookie!.value).toBe('ya29.secret-token')
    expect(tokenCookie!.httpOnly).toBe(true)
    expect(tokenCookie!.sameSite).toBe('lax')
    expect(tokenCookie!.maxAge).toBe(3599)

    // State cookie is single-use: cleared on the response
    const stateCookie = response.cookies.get('yt_oauth_state')
    expect(stateCookie!.value).toBe('')
    expect(stateCookie!.maxAge).toBe(0)
  })

  it('redirects with token_exchange_failed when the exchange throws, without leaking the token', async () => {
    mockExchange.mockRejectedValue(new GoogleApiError(400, 'Google token exchange failed: invalid_grant'))
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(createRequest({ code: 'bad-code', state: 's1' }, 's1'))

    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('error')).toBe('token_exchange_failed')
    expect(response.cookies.get('yt_access_token')).toBeUndefined()
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('ya29')

    consoleSpy.mockRestore()
  })
})
