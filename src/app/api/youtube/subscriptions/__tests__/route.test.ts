import { NextRequest } from 'next/server'
import { GET } from '../route'

jest.mock('../../../../../lib/youtube/google', () => {
  const actual = jest.requireActual('../../../../../lib/youtube/google')
  return {
    ...actual,
    fetchAllSubscriptions: jest.fn(),
  }
})

import { fetchAllSubscriptions, GoogleApiError } from '../../../../../lib/youtube/google'
const mockFetchAllSubscriptions = fetchAllSubscriptions as jest.MockedFunction<
  typeof fetchAllSubscriptions
>

function createRequest(tokenCookie?: string) {
  const headers: Record<string, string> = {}
  if (tokenCookie !== undefined) headers.cookie = `yt_access_token=${tokenCookie}`
  return new NextRequest('http://localhost:3000/api/youtube/subscriptions', { headers })
}

describe('/api/youtube/subscriptions', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/youtube/callback',
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 503 naming the missing env vars when OAuth is unconfigured', async () => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET

    const response = await GET(createRequest('some-token'))
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.missing).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])
    expect(mockFetchAllSubscriptions).not.toHaveBeenCalled()
  })

  it('returns 401 when the token cookie is absent', async () => {
    const response = await GET(createRequest())
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toContain('Not connected to YouTube')
    expect(mockFetchAllSubscriptions).not.toHaveBeenCalled()
  })

  it('returns the subscription list without exposing the token', async () => {
    mockFetchAllSubscriptions.mockResolvedValue([
      { id: 'UC1', title: 'Channel One', thumbnail: 'https://t/1.jpg' },
      { id: 'UC2', title: 'Channel Two' },
    ])

    const response = await GET(createRequest('secret-access-token'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({
      channels: [
        { id: 'UC1', title: 'Channel One', thumbnail: 'https://t/1.jpg' },
        { id: 'UC2', title: 'Channel Two' },
      ],
    })
    expect(mockFetchAllSubscriptions).toHaveBeenCalledWith('secret-access-token')
    expect(JSON.stringify(data)).not.toContain('secret-access-token')
  })

  it('returns 401 and clears the cookie when Google rejects the token', async () => {
    mockFetchAllSubscriptions.mockRejectedValue(
      new GoogleApiError(401, 'YouTube subscriptions request failed (HTTP 401)')
    )

    const response = await GET(createRequest('expired-token'))
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toContain('expired')
    const cookie = response.cookies.get('yt_access_token')
    expect(cookie!.value).toBe('')
    expect(cookie!.maxAge).toBe(0)
  })

  it('returns 502 on other Google failures', async () => {
    mockFetchAllSubscriptions.mockRejectedValue(
      new GoogleApiError(500, 'YouTube subscriptions request failed (HTTP 500)')
    )
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(createRequest('some-token'))
    const data = await response.json()

    expect(response.status).toBe(502)
    expect(data.error).toBe('Failed to fetch YouTube subscriptions')
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('some-token')

    consoleSpy.mockRestore()
  })
})
