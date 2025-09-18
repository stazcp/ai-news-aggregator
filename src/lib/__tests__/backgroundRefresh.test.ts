import { refreshCacheInBackground, getRefreshStatus } from '../homepage/backgroundRefresh'
import { getCachedData, setCachedData } from '../cache'
import {
  generateFreshHomepage,
  generateTopStorySummaries,
  enrichClustersWithSummaries,
} from '../homepage/homepageGenerator'

// Mock all dependencies
jest.mock('../cache')
jest.mock('../homepage/homepageGenerator')
jest.mock('../ai/groq') // Mock GROQ to prevent API calls

const mockGetCachedData = getCachedData as jest.MockedFunction<typeof getCachedData>
const mockSetCachedData = setCachedData as jest.MockedFunction<typeof setCachedData>
const mockGenerateFreshHomepage = generateFreshHomepage as jest.MockedFunction<
  typeof generateFreshHomepage
>
const mockGenerateTopStorySummaries = generateTopStorySummaries as jest.MockedFunction<
  typeof generateTopStorySummaries
>
const mockEnrichClustersWithSummaries = enrichClustersWithSummaries as jest.MockedFunction<
  typeof enrichClustersWithSummaries
>

describe('backgroundRefresh', () => {
  const mockHomepageData = {
    storyClusters: [
      {
        clusterTitle: 'Test Cluster',
        articleIds: ['1', '2'],
        articles: [
          { id: '1', title: 'Test Article 1', url: 'http://test1.com' },
          { id: '2', title: 'Test Article 2', url: 'http://test2.com' },
        ],
      },
    ],
    unclusteredArticles: [],
    topics: ['tech'],
    lastUpdated: new Date().toISOString(),
  }

  const mockArticles = [
    { id: '1', title: 'Test Article 1', url: 'http://test1.com' },
    { id: '2', title: 'Test Article 2', url: 'http://test2.com' },
  ]

  beforeEach(() => {
    jest.resetAllMocks()
    jest.clearAllMocks()

    // Mock console to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    // Default mocks
    mockGenerateFreshHomepage.mockResolvedValue(mockHomepageData as any)
    mockGenerateTopStorySummaries.mockResolvedValue()
    mockEnrichClustersWithSummaries.mockResolvedValue(mockHomepageData.storyClusters as any)
    mockGetCachedData.mockImplementation((key) => {
      if (key === 'all-news') return Promise.resolve(mockArticles)
      return Promise.resolve(null)
    })
    mockSetCachedData.mockResolvedValue()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('refreshCacheInBackground', () => {
    it('should skip refresh if already in progress', async () => {
      mockGetCachedData.mockResolvedValueOnce({ stage: 'In progress', progress: 50 })

      await refreshCacheInBackground()

      expect(mockSetCachedData).not.toHaveBeenCalled()
      expect(mockGenerateFreshHomepage).not.toHaveBeenCalled()
    })

    it('should complete full refresh cycle successfully', async () => {
      mockGetCachedData.mockResolvedValueOnce(null) // Not in progress

      await refreshCacheInBackground()

      // Verify refresh was marked as in progress with 30-minute TTL
      expect(mockSetCachedData).toHaveBeenCalledWith(
        'refresh-in-progress',
        expect.objectContaining({
          startTime: expect.any(Number),
          stage: 'Starting refresh...',
          progress: 0,
          timestamp: expect.any(Number),
        }),
        1800 // 30 minutes (not 1 hour)
      )

      // Verify all stages were called
      expect(mockGenerateFreshHomepage).toHaveBeenCalledTimes(1)
      expect(mockGenerateTopStorySummaries).toHaveBeenCalledTimes(1)
      expect(mockEnrichClustersWithSummaries).toHaveBeenCalledTimes(1)

      // Verify final results were cached
      expect(mockSetCachedData).toHaveBeenCalledWith(
        'homepage-result',
        expect.objectContaining({
          storyClusters: mockHomepageData.storyClusters,
        }),
        86400 // 24 hours
      )

      // CRITICAL: Verify completion status has SHORT TTL (not setTimeout)
      expect(mockSetCachedData).toHaveBeenCalledWith(
        'refresh-in-progress',
        expect.objectContaining({
          stage: 'Fresh stories ready!',
          progress: 100,
          timestamp: expect.any(Number),
          startTime: expect.any(Number),
        }),
        180 // 3 minutes TTL - this is the key fix!
      )
    })

    it('should handle errors gracefully with short TTL', async () => {
      mockGetCachedData.mockResolvedValueOnce(null) // Not in progress
      mockGenerateFreshHomepage.mockRejectedValueOnce(new Error('Network error'))

      await refreshCacheInBackground()

      // Verify error status has short TTL
      expect(mockSetCachedData).toHaveBeenCalledWith(
        'refresh-in-progress',
        expect.objectContaining({
          stage: 'Error occurred',
          error: 'Network error',
          progress: 0,
          timestamp: expect.any(Number),
        }),
        180 // 3 minutes (not 5 minutes)
      )
    })

    it('should update progress during refresh with consistent TTL', async () => {
      mockGetCachedData.mockResolvedValueOnce(null) // Not in progress

      await refreshCacheInBackground()

      // Find all progress update calls
      const progressCalls = mockSetCachedData.mock.calls.filter(
        (call) => call[0] === 'refresh-in-progress' && call[1].progress < 100
      )

      // Verify all progress updates use consistent 30-minute TTL
      progressCalls.forEach((call) => {
        expect(call[2]).toBe(1800) // 30 minutes
      })
    })

    it('should preserve startTime during progress updates', async () => {
      const initialStartTime = Date.now() - 5000 // 5 seconds ago
      let callCount = 0

      // Mock sequence: not in progress initially, then existing status during updates
      mockGetCachedData.mockImplementation((key) => {
        callCount++
        if (callCount === 1 && key === 'refresh-in-progress') {
          // First call - not in progress
          return Promise.resolve(null)
        }
        if (key === 'all-news') {
          return Promise.resolve(mockArticles)
        }
        if (key === 'refresh-in-progress') {
          // Subsequent calls - return existing status with startTime
          return Promise.resolve({
            startTime: initialStartTime,
            stage: 'Previous stage',
            progress: 10,
            timestamp: Date.now() - 1000,
          })
        }
        return Promise.resolve(null)
      })

      await refreshCacheInBackground()

      // Find progress update calls that should preserve startTime
      const progressCalls = mockSetCachedData.mock.calls.filter(
        (call) =>
          call[0] === 'refresh-in-progress' &&
          call[1].progress > 0 &&
          call[1].progress < 100 &&
          call[1].stage !== 'Starting refresh...' &&
          call[1].stage !== 'Fresh stories ready!' &&
          call[1].hasOwnProperty('startTime') // Only calls that should have preserved startTime
      )

      // Verify startTime is preserved in progress updates
      expect(progressCalls.length).toBeGreaterThan(0)
      progressCalls.forEach((call) => {
        expect(call[1].startTime).toBe(initialStartTime)
      })
    })

    it('should call progress callback during summary generation', async () => {
      mockGetCachedData.mockResolvedValueOnce(null) // Not in progress

      // Mock progress callback
      let progressCallbackCalled = false
      mockGenerateTopStorySummaries.mockImplementation(async (clusters, articles, callback) => {
        if (callback) {
          await callback(1, 2) // Simulate progress
          progressCallbackCalled = true
        }
      })

      await refreshCacheInBackground()

      expect(progressCallbackCalled).toBe(true)
    })
  })

  describe('getRefreshStatus', () => {
    it('should return idle status when no refresh in progress', async () => {
      mockGetCachedData.mockImplementation((key) => {
        if (key === 'refresh-in-progress') return Promise.resolve(null)
        if (key === 'last-cache-update') return Promise.resolve('2023-01-01T00:00:00Z')
        return Promise.resolve(null)
      })

      const status = await getRefreshStatus()

      expect(status).toEqual({
        stage: 'idle',
        progress: 100,
        timestamp: expect.any(Number),
        startTime: expect.any(Number),
      })
    })

    it('should return refreshing status when refresh in progress', async () => {
      mockGetCachedData.mockImplementation((key) => {
        if (key === 'refresh-in-progress') {
          return Promise.resolve({
            stage: 'Generating AI summaries...',
            progress: 75,
            timestamp: Date.now(),
            startTime: Date.now() - 60000, // 1 minute ago
          })
        }
        return Promise.resolve(null)
      })

      const status = await getRefreshStatus()

      expect(status).toEqual({
        stage: 'Generating AI summaries...',
        progress: 75,
        timestamp: expect.any(Number),
        startTime: expect.any(Number),
      })
    })

    it('should return error status when refresh failed', async () => {
      mockGetCachedData.mockImplementation((key) => {
        if (key === 'refresh-in-progress') {
          return Promise.resolve({
            stage: 'Error occurred',
            progress: 0,
            timestamp: Date.now(),
            error: 'Network timeout',
          })
        }
        return Promise.resolve(null)
      })

      const status = await getRefreshStatus()

      expect(status).toEqual({
        stage: 'Error occurred',
        progress: 0,
        timestamp: expect.any(Number),
        startTime: undefined,
        error: 'Network timeout',
      })
    })

    it('should handle cache errors gracefully', async () => {
      mockGetCachedData.mockRejectedValue(new Error('Cache unavailable'))

      const status = await getRefreshStatus()

      expect(status).toEqual({
        stage: 'error',
        progress: 0,
        timestamp: expect.any(Number),
        error: 'Failed to get status',
      })
    })
  })

  describe('updateRefreshStatus', () => {
    it('should preserve existing startTime when updating progress', async () => {
      const originalStartTime = Date.now() - 10000 // 10 seconds ago
      let callCount = 0

      // Setup mock to return different values for different calls
      mockGetCachedData.mockImplementation((key) => {
        callCount++
        if (callCount === 1 && key === 'refresh-in-progress') {
          // First call - not in progress
          return Promise.resolve(null)
        }
        if (key === 'all-news') {
          return Promise.resolve(mockArticles)
        }
        if (key === 'refresh-in-progress') {
          // Subsequent calls - return existing status with original startTime
          return Promise.resolve({
            startTime: originalStartTime,
            stage: 'Existing stage',
            progress: 30,
            timestamp: Date.now() - 2000,
          })
        }
        return Promise.resolve(null)
      })

      await refreshCacheInBackground()

      // Find calls where updateRefreshStatus was used (progress updates with preserved startTime)
      const updateCalls = mockSetCachedData.mock.calls.filter(
        (call) =>
          call[0] === 'refresh-in-progress' &&
          call[1].progress > 0 &&
          call[1].progress < 100 &&
          call[1].stage !== 'Starting refresh...' &&
          call[1].stage !== 'Fresh stories ready!' &&
          call[1].hasOwnProperty('startTime')
      )

      // Verify startTime is preserved in all updates
      expect(updateCalls.length).toBeGreaterThan(0)
      updateCalls.forEach((call) => {
        expect(call[1].startTime).toBe(originalStartTime)
        expect(call[1]).toHaveProperty('stage')
        expect(call[1]).toHaveProperty('progress')
        expect(call[1]).toHaveProperty('timestamp')
      })
    })

    it('should use current time as startTime if no existing status', async () => {
      // Mock no existing status
      mockGetCachedData.mockResolvedValue(null)

      const { refreshCacheInBackground } = await import('../homepage/backgroundRefresh')

      mockGetCachedData
        .mockResolvedValueOnce(null) // Initial check - not in progress
        .mockResolvedValueOnce(mockArticles) // all-news cache
        .mockImplementation((key) => {
          if (key === 'all-news') return Promise.resolve(mockArticles)
          return Promise.resolve(null) // No existing refresh status
        })

      const testStartTime = Date.now()
      await refreshCacheInBackground()

      // Find progress update calls
      const updateCalls = mockSetCachedData.mock.calls.filter(
        (call) =>
          call[0] === 'refresh-in-progress' &&
          call[1].progress > 0 &&
          call[1].progress < 100 &&
          call[1].stage !== 'Starting refresh...' &&
          call[1].stage !== 'Fresh stories ready!'
      )

      // Verify startTime is set to approximately current time
      updateCalls.forEach((call) => {
        expect(call[1]).toHaveProperty('startTime')
        expect(call[1].startTime).toBeGreaterThanOrEqual(testStartTime - 1000) // Within 1 second
        expect(call[1].startTime).toBeLessThanOrEqual(Date.now() + 1000)
      })
    })
  })

  describe('serverless environment fixes', () => {
    it('should NOT use setTimeout for cleanup (serverless incompatible)', async () => {
      mockGetCachedData.mockResolvedValueOnce(null) // Not in progress

      // Spy on setTimeout to ensure it's not called
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout')

      await refreshCacheInBackground()

      // CRITICAL: Verify no setTimeout is used (would fail in serverless)
      expect(setTimeoutSpy).not.toHaveBeenCalled()

      setTimeoutSpy.mockRestore()
    })

    it('should set completion status with short TTL for auto-cleanup', async () => {
      mockGetCachedData.mockResolvedValueOnce(null) // Not in progress

      await refreshCacheInBackground()

      // Find the completion status call
      const completionCall = mockSetCachedData.mock.calls.find(
        (call) => call[0] === 'refresh-in-progress' && call[1].stage === 'Fresh stories ready!'
      )

      expect(completionCall).toBeDefined()
      expect(completionCall![2]).toBe(180) // 3 minutes TTL - auto-clears without setTimeout
    })

    it('should prevent stuck refresh states with reasonable TTLs', async () => {
      mockGetCachedData.mockResolvedValueOnce(null) // Not in progress

      await refreshCacheInBackground()

      // Verify all TTLs are reasonable (not 1 hour)
      mockSetCachedData.mock.calls.forEach((call) => {
        if (call[0] === 'refresh-in-progress') {
          expect(call[2]).toBeLessThanOrEqual(1800) // Max 30 minutes
        }
      })
    })
  })
})
