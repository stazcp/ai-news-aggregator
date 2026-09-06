import { GET } from '../route'

describe('/api/youtube/auth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.GOOGLE_CLIENT_ID = 'client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/youtube/callback'
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 503 with the missing env var names when unconfigured', async () => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.error).toContain('GOOGLE_CLIENT_ID')
    expect(data.error).toContain('GOOGLE_CLIENT_SECRET')
    expect(data.missing).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])
  })

  it('302-redirects to the Google consent URL and sets a state cookie', async () => {
    const response = await GET()

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(location.searchParams.get('client_id')).toBe('client-id')
    expect(location.searchParams.get('access_type')).toBe('online')

    const stateCookie = response.cookies.get('yt_oauth_state')
    expect(stateCookie).toBeDefined()
    expect(stateCookie!.value).toBe(location.searchParams.get('state'))
    expect(stateCookie!.value.length).toBeGreaterThan(10)
    expect(stateCookie!.httpOnly).toBe(true)
    expect(stateCookie!.sameSite).toBe('lax')
  })

  it('generates a fresh random state on every request', async () => {
    const first = await GET()
    const second = await GET()

    expect(first.cookies.get('yt_oauth_state')!.value).not.toBe(
      second.cookies.get('yt_oauth_state')!.value
    )
  })
})
