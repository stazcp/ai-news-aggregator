jest.mock('../../../../lib/cache', () => ({
  getCachedData: jest.fn(),
}))

jest.mock('../../../../lib/homepage/backgroundRefresh', () => ({
  refreshCacheInBackground: jest.fn().mockResolvedValue(undefined),
}))

import { GET } from '../route'
import { getCachedData } from '../../../../lib/cache'
import { refreshCacheInBackground } from '../../../../lib/homepage/backgroundRefresh'

const mockGetCachedData = getCachedData as jest.MockedFunction<typeof getCachedData>
const mockRefreshCacheInBackground = refreshCacheInBackground as jest.MockedFunction<
  typeof refreshCacheInBackground
>

describe('/api/homepage', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetAllMocks()
    process.env = { ...originalEnv }
    delete process.env.HOMEPAGE_REFRESH_MODE
    mockRefreshCacheInBackground.mockResolvedValue()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('serves cached homepage data without triggering refresh by default', async () => {
    mockGetCachedData.mockResolvedValueOnce({
      storyClusters: [],
      unclusteredArticles: [],
      rateLimitMessage: null,
      topics: [],
      lastUpdated: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    })

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.fromCache).toBe(true)
    expect(mockRefreshCacheInBackground).not.toHaveBeenCalled()
  })

  it('triggers refresh for stale cache in request-refresh mode', async () => {
    process.env.HOMEPAGE_REFRESH_MODE = 'request-refresh'
    mockGetCachedData.mockResolvedValueOnce({
      storyClusters: [],
      unclusteredArticles: [],
      rateLimitMessage: null,
      topics: [],
      lastUpdated: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(mockRefreshCacheInBackground).toHaveBeenCalledTimes(1)
  })

  it('returns 503 on cache miss instead of generating homepage data by default', async () => {
    mockGetCachedData.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.error).toContain('cron-only')
    expect(mockRefreshCacheInBackground).not.toHaveBeenCalled()
  })

  it('preserves refresh-in-progress response on cache miss', async () => {
    mockGetCachedData
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ stage: 'Generating AI summaries...', progress: 50 })

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.refreshing).toBe(true)
  })
})
