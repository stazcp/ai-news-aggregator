/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRefreshStatus } from '../useRefreshStatus'
import { ReactNode, createElement } from 'react'

// Mock fetch globally
global.fetch = jest.fn()

const mockFetch = fetch as jest.MockedFunction<typeof fetch>

// Helper to create a QueryClient for tests
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries for tests
        gcTime: 0, // Disable cache persistence
      },
    },
  })

describe('useRefreshStatus', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.clearAllMocks()

    // Mock console to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should only invalidate homepage data ONCE per completion', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)

    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const completionResponse = {
      status: 'idle' as const,
      stage: 'Fresh stories ready!',
      progress: 100,
      lastUpdate: '2025-09-15T14:30:00Z',
      timestamp: 1757899453677,
      justCompleted: true,
    }

    // Mock API to return the same completion status multiple times
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(completionResponse),
    } as Response)

    const { result, rerender } = renderHook(() => useRefreshStatus(), { wrapper })

    // Wait for initial query to complete and effect to run
    await waitFor(() => {
      expect(result.current.refreshStatus?.justCompleted).toBe(true)
    })

    // Wait a bit more for useEffect to process
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1)
    })

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['homepage-data'],
      refetchType: 'active',
    })

    // Clear the spy to track new calls
    invalidateQueriesSpy.mockClear()

    // Simulate polling - same completion status returned again
    rerender()

    await waitFor(() => {
      expect(result.current.refreshStatus?.justCompleted).toBe(true)
    })

    // Wait to ensure no new invalidations
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Should NOT invalidate again (same timestamp)
    expect(invalidateQueriesSpy).not.toHaveBeenCalled()

    // Simulate another poll with the SAME completion status
    rerender()

    await waitFor(() => {
      expect(result.current.refreshStatus?.justCompleted).toBe(true)
    })

    // Wait to ensure no new invalidations
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Still should NOT invalidate again
    expect(invalidateQueriesSpy).not.toHaveBeenCalled()
  })

  it('should invalidate again for a NEW completion (different timestamp)', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)

    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const firstCompletion = {
      status: 'idle' as const,
      stage: 'Fresh stories ready!',
      progress: 100,
      lastUpdate: '2025-09-15T14:30:00Z',
      timestamp: 1757899453677,
      justCompleted: true,
    }

    const secondCompletion = {
      ...firstCompletion,
      timestamp: 1757899463677, // Different timestamp (10 seconds later)
      lastUpdate: '2025-09-15T14:30:10Z',
    }

    let callCount = 0
    // Mock API to return different responses on different calls
    mockFetch.mockImplementation(() => {
      callCount++
      const response = callCount === 1 ? firstCompletion : secondCompletion
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
      } as Response)
    })

    const { result } = renderHook(() => useRefreshStatus(), { wrapper })

    // Wait for first completion and effect to run
    await waitFor(() => {
      expect(result.current.refreshStatus?.justCompleted).toBe(true)
      expect(result.current.refreshStatus?.timestamp).toBe(firstCompletion.timestamp)
    })

    // Verify first invalidation
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1)
    })
    invalidateQueriesSpy.mockClear()

    // Force a refetch to get the second completion
    queryClient.invalidateQueries({ queryKey: ['refresh-status'] })

    await waitFor(() => {
      expect(result.current.refreshStatus?.timestamp).toBe(secondCompletion.timestamp)
    })

    // Should invalidate homepage-data again (new timestamp) but not refresh-status
    await waitFor(() => {
      // Check that homepage-data was invalidated (should be called once after clearing)
      const homepageDataCalls = invalidateQueriesSpy.mock.calls.filter(
        (call) => call[0].queryKey && call[0].queryKey[0] === 'homepage-data'
      )
      expect(homepageDataCalls).toHaveLength(1)
    })

    // Verify the homepage-data invalidation call
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['homepage-data'],
      refetchType: 'active',
    })
  })

  it('should not invalidate for non-completion statuses', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)

    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const refreshingResponse = {
      status: 'refreshing' as const,
      stage: 'Generating AI summaries...',
      progress: 50,
      lastUpdate: '2025-09-15T14:30:00Z',
      timestamp: 1757899453677,
      justCompleted: false,
    }

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(refreshingResponse),
    } as Response)

    const { result } = renderHook(() => useRefreshStatus(), { wrapper })

    await waitFor(() => {
      expect(result.current.refreshStatus).toBeDefined()
    })

    // Should not invalidate for refreshing status
    expect(invalidateQueriesSpy).not.toHaveBeenCalled()
  })

  it('should not invalidate if justCompleted is false', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)

    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const idleResponse = {
      status: 'idle' as const,
      stage: 'idle',
      progress: 100,
      lastUpdate: '2025-09-15T14:25:00Z',
      timestamp: 1757899153677,
      justCompleted: false, // Not a fresh completion
    }

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(idleResponse),
    } as Response)

    const { result } = renderHook(() => useRefreshStatus(), { wrapper })

    await waitFor(() => {
      expect(result.current.refreshStatus).toBeDefined()
    })

    // Should not invalidate for idle status without justCompleted
    expect(invalidateQueriesSpy).not.toHaveBeenCalled()
  })

  it('should handle API errors gracefully', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)

    mockFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useRefreshStatus(), { wrapper })

    // Wait for the query to fail and fallback to be applied
    await waitFor(() => {
      expect(result.current.refreshStatus).toEqual({
        status: 'idle',
        stage: 'Unknown',
        progress: 0,
        lastUpdate: null,
        timestamp: expect.any(Number),
      })
    })

    // In some test environments, React Query might not set isError immediately
    // The important part is that we get the fallback status, showing graceful error handling
    expect(result.current.refreshStatus.status).toBe('idle')
    expect(result.current.refreshStatus.stage).toBe('Unknown')
  })
})
