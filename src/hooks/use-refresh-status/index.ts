import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { applyJitter, getIdleInterval } from './utils'

interface RefreshStatusData {
  status: 'idle' | 'refreshing' | 'error'
  stage: string
  progress: number
  lastUpdate: string | null
  timestamp: number
  cacheAge?: number
  justCompleted?: boolean
}

interface UseRefreshStatusOptions {
  enabled?: boolean // Whether to actively poll for status
}

export function useRefreshStatus(options: UseRefreshStatusOptions = {}) {
  const { enabled = true } = options
  const queryClient = useQueryClient()
  const lastCompletedTimestamp = useRef<number | null>(null)
  const waitingNoDataAttempts = useRef<number>(0)
  const backgroundNoDataAttempts = useRef<number>(0)

  const { data: refreshStatus, error } = useQuery({
    queryKey: ['refresh-status'],
    queryFn: async (): Promise<RefreshStatusData> => {
      const response = await fetch('/api/refresh-status', {
        headers: {
          'Cache-Control': 'no-cache',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to get refresh status: ${response.status}`)
      }

      return response.json()
    },

    // Smart polling configuration based on current status and cache age
    refetchInterval: (query) => {
      const data = query.state.data

      // If disabled (user has data, bar hidden), still poll for completion detection
      // but at slower rate since we don't need progress updates
      if (!enabled) {
        if (!data) {
          // Exponential backoff: start at 10s, then 20s, 40s, 60s, max 2 min
          backgroundNoDataAttempts.current += 1
          const base = Math.min(
            10 * 1000 * Math.pow(2, backgroundNoDataAttempts.current - 1),
            2 * 60 * 1000
          )
          return applyJitter(base || 2000)
        }

        // When refresh is active, poll every 10 seconds to catch completion
        if (data.status === 'refreshing') {
          return applyJitter(10000)
        }

        // When idle, use smart polling based on cache age
        // Refreshes happen at 6 AM and 6 PM UTC (every 12 hours)
        // We can poll very infrequently since refetchOnWindowFocus catches completions
        if (data.status === 'idle') {
          return getIdleInterval(data.cacheAge || 0, { enabled: false })
        }

        return applyJitter(2 * 60 * 1000)
      }

      // Enabled (user waiting for data) - poll aggressively for progress
      // Use exponential backoff if no data yet (refresh-status might be slow to initialize)
      if (!data) {
        // Start at 5s, then 10s, 20s, 40s, max 1 min
        // This gives fast initial checks but backs off if refresh is taking long
        waitingNoDataAttempts.current += 1
        const base = Math.min(5 * 1000 * Math.pow(2, waitingNoDataAttempts.current - 1), 60 * 1000)
        return applyJitter(base || 2000)
      }

      // Poll every 2 seconds when actively refreshing (user sees progress)
      if (data.status === 'refreshing') {
        return applyJitter(2000)
      }

      // Poll every 10 seconds on error to detect recovery
      if (data.status === 'error') {
        return applyJitter(10000)
      }

      // Smart polling when idle based on cache age
      // Background refresh triggers when cache > 6 hours (360 minutes)
      // Refreshes happen at 6 AM and 6 PM UTC (every 12 hours)
      // User is waiting, so we can poll more aggressively for progress
      if (data.status === 'idle') {
        return getIdleInterval(data.cacheAge || 0, { enabled: true })
      }

      return applyJitter(2 * 60 * 1000)
    },

    staleTime: 1000, // Always consider stale after 1 second
    gcTime: 5 * 60 * 1000, // Keep in memory for 5 minutes
    refetchOnWindowFocus: true, // Check status when user returns to tab
    refetchOnReconnect: true, // Check status when internet reconnects

    // Don't retry too aggressively for status checks
    retry: (failureCount) => failureCount < 2,
    retryDelay: 5000, // 5 second delay between retries
  })

  // Reset backoff counters when we get new data or polling mode changes
  useEffect(() => {
    if (refreshStatus) {
      waitingNoDataAttempts.current = 0
      backgroundNoDataAttempts.current = 0
    }
  }, [refreshStatus])

  useEffect(() => {
    waitingNoDataAttempts.current = 0
    backgroundNoDataAttempts.current = 0
  }, [enabled])

  // Handle status changes with useEffect (replaces onSuccess)
  useEffect(() => {
    if (refreshStatus) {
      // When refresh completes, invalidate homepage data to trigger refetch
      // Only do this ONCE per completion to avoid repeated invalidations
      if (refreshStatus.justCompleted && refreshStatus.status === 'idle') {
        const currentTimestamp = refreshStatus.timestamp

        // Only invalidate if this is a NEW completion (different timestamp)
        if (lastCompletedTimestamp.current !== currentTimestamp) {
          console.log('🎉 Refresh just completed, invalidating homepage data')
          queryClient.invalidateQueries({
            queryKey: ['homepage-data'],
            refetchType: 'active', // Actively refetch if query is being used
          })

          // Remember this completion to avoid duplicate invalidations
          lastCompletedTimestamp.current = currentTimestamp
        }
      }

      // Log status changes for debugging
      if (refreshStatus.status === 'refreshing') {
        console.log(`🔄 Refresh in progress: ${refreshStatus.stage} (${refreshStatus.progress}%)`)
      } else if (refreshStatus.status === 'error') {
        console.error(`❌ Refresh error: ${refreshStatus.stage}`)
      }
    }

    if (error) {
      console.error('❌ Failed to get refresh status:', error)
    }
  }, [refreshStatus, error, queryClient])

  // Provide sensible defaults if query fails
  const defaultStatus: RefreshStatusData = {
    status: 'idle',
    stage: 'Unknown',
    progress: 0,
    lastUpdate: null,
    timestamp: Date.now(),
  }

  return {
    refreshStatus: refreshStatus || defaultStatus,
    isError: !!error,
    // Helper computed values
    isRefreshing: refreshStatus?.status === 'refreshing',
    isIdle: refreshStatus?.status === 'idle',
    hasError: refreshStatus?.status === 'error',
    justCompleted: refreshStatus?.justCompleted || false,
  }
}

// Helper hook to get just the essential refresh info for UI
export function useRefreshIndicator(options: UseRefreshStatusOptions = {}) {
  const { refreshStatus, isRefreshing, justCompleted } = useRefreshStatus(options)

  return {
    show: isRefreshing || justCompleted,
    stage: refreshStatus.stage,
    progress: refreshStatus.progress,
    isComplete: justCompleted,
    isActive: isRefreshing,
  }
}
