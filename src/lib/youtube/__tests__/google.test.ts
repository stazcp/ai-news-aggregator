import {
  buildAuthUrl,
  exchangeCodeForToken,
  fetchAllSubscriptions,
  getGoogleOAuthConfig,
  GoogleApiError,
  missingGoogleEnvVars,
  verifyAccessToken,
} from '../google'
import {
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_OAUTH_TOKENINFO_URL,
  YOUTUBE_API_BASE,
  YOUTUBE_READONLY_SCOPE,
} from '../constants'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('lib/youtube/google', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetAllMocks()
    process.env = { ...originalEnv }
    process.env.GOOGLE_CLIENT_ID = 'client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/youtube/callback'
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('missingGoogleEnvVars / getGoogleOAuthConfig', () => {
    it('returns empty array when all env vars are set', () => {
      expect(missingGoogleEnvVars()).toEqual([])
      expect(getGoogleOAuthConfig()).toEqual({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'http://localhost:3000/api/youtube/callback',
      })
    })

    it('reports missing and empty vars', () => {
      delete process.env.GOOGLE_CLIENT_ID
      process.env.GOOGLE_CLIENT_SECRET = '   '
      expect(missingGoogleEnvVars()).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])
      expect(getGoogleOAuthConfig()).toBeNull()
    })
  })

  describe('buildAuthUrl', () => {
    it('builds a consent URL with the youtube.readonly scope and online access', () => {
      const url = new URL(buildAuthUrl('my-state'))
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
      expect(url.searchParams.get('client_id')).toBe('client-id')
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/youtube/callback')
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('scope')).toBe(YOUTUBE_READONLY_SCOPE)
      expect(url.searchParams.get('state')).toBe('my-state')
      expect(url.searchParams.get('access_type')).toBe('online')
    })

    it('throws a typed 503 error when env is unset', () => {
      delete process.env.GOOGLE_CLIENT_ID
      expect(() => buildAuthUrl('s')).toThrow(GoogleApiError)
      try {
        buildAuthUrl('s')
      } catch (error) {
        expect((error as GoogleApiError).status).toBe(503)
      }
    })
  })

  describe('exchangeCodeForToken', () => {
    it('posts the code and returns the token payload', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ access_token: 'ya29.token', expires_in: 3599, token_type: 'Bearer' })
      )

      const token = await exchangeCodeForToken('auth-code')

      expect(token).toEqual({
        access_token: 'ya29.token',
        expires_in: 3599,
        token_type: 'Bearer',
        scope: undefined,
      })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe(GOOGLE_OAUTH_TOKEN_URL)
      const body = new URLSearchParams(init.body)
      expect(body.get('code')).toBe('auth-code')
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('client_secret')).toBe('client-secret')
    })

    it('throws GoogleApiError with the Google error code on non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400))

      try {
        await exchangeCodeForToken('bad-code')
        throw new Error('expected to throw')
      } catch (error) {
        expect(error).toBeInstanceOf(GoogleApiError)
        expect((error as GoogleApiError).status).toBe(400)
        expect((error as GoogleApiError).message).toContain('invalid_grant')
      }
    })

    it('throws on unexpected response shape', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ something: 'else' }))

      await expect(exchangeCodeForToken('code')).rejects.toThrow('unexpected response shape')
    })
  })

  describe('fetchAllSubscriptions', () => {
    function subscriptionItem(id: string, title: string, thumbnail?: string) {
      return {
        snippet: {
          title,
          resourceId: { channelId: id },
          thumbnails: thumbnail ? { default: { url: thumbnail } } : undefined,
        },
      }
    }

    it('pages through results following nextPageToken', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            items: [subscriptionItem('UC1', 'Channel One', 'https://t/1.jpg')],
            nextPageToken: 'page-2',
          })
        )
        .mockResolvedValueOnce(jsonResponse({ items: [subscriptionItem('UC2', 'Channel Two')] }))

      const channels = await fetchAllSubscriptions('token-abc')

      expect(channels).toEqual([
        { id: 'UC1', title: 'Channel One', thumbnail: 'https://t/1.jpg' },
        { id: 'UC2', title: 'Channel Two' },
      ])
      expect(mockFetch).toHaveBeenCalledTimes(2)

      const firstUrl = new URL(mockFetch.mock.calls[0][0])
      expect(firstUrl.origin + firstUrl.pathname).toBe(`${YOUTUBE_API_BASE}/subscriptions`)
      expect(firstUrl.searchParams.get('part')).toBe('snippet')
      expect(firstUrl.searchParams.get('mine')).toBe('true')
      expect(firstUrl.searchParams.get('maxResults')).toBe('50')
      expect(firstUrl.searchParams.get('pageToken')).toBeNull()
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-abc')

      const secondUrl = new URL(mockFetch.mock.calls[1][0])
      expect(secondUrl.searchParams.get('pageToken')).toBe('page-2')
    })

    it('skips malformed items', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          items: [
            { snippet: { title: 'No id', resourceId: {} } },
            { snippet: { resourceId: { channelId: 'UC-no-title' } } },
            subscriptionItem('UC-ok', 'Good Channel'),
          ],
        })
      )

      const channels = await fetchAllSubscriptions('token')
      expect(channels).toEqual([{ id: 'UC-ok', title: 'Good Channel' }])
    })

    it('throws GoogleApiError with status on non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: { code: 401 } }, 401))

      try {
        await fetchAllSubscriptions('expired-token')
        throw new Error('expected to throw')
      } catch (error) {
        expect(error).toBeInstanceOf(GoogleApiError)
        expect((error as GoogleApiError).status).toBe(401)
        // Security: message must never contain the access token
        expect((error as GoogleApiError).message).not.toContain('expired-token')
      }
    })
  })

  describe('verifyAccessToken', () => {
    it('accepts a live token issued to this OAuth client', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ aud: 'client-id', expires_in: '3000' }))

      await expect(verifyAccessToken('secret-token-value')).resolves.toBe(true)
      // Token is sent in the POST body, never in the URL
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe(GOOGLE_OAUTH_TOKENINFO_URL)
      expect(init.method).toBe('POST')
      expect(String(url)).not.toContain('secret-token-value')
      expect(init.body).toContain('access_token=secret-token-value')
    })

    it('rejects tokens issued to a different client (aud mismatch)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ aud: 'someone-elses-client' }))
      await expect(verifyAccessToken('token')).resolves.toBe(false)
    })

    it('rejects invalid/expired tokens (non-OK tokeninfo response)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'invalid_token' }, 400))
      await expect(verifyAccessToken('token')).resolves.toBe(false)
    })

    it('rejects when OAuth is unconfigured', async () => {
      delete process.env.GOOGLE_CLIENT_ID
      await expect(verifyAccessToken('token')).resolves.toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('throws a typed 502 error when Google is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'))
      await expect(verifyAccessToken('token')).rejects.toBeInstanceOf(GoogleApiError)
    })
  })
})
