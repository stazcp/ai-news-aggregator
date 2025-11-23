import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

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
        if (!data) return 30000 // 30 seconds if no data yet

        // When refresh is active, poll every 10 seconds to catch completion
        if (data.status === 'refreshing') {
          return 10000 // 10 seconds (not 2s - user doesn't see progress)
        }

        // When idle, use smart polling based on cache age
        // Refreshes happen at 6 AM and 6 PM UTC (every 12 hours)
        // We can poll very infrequently since refetchOnWindowFocus catches completions
        if (data.status === 'idle') {
          const cacheAge = data.cacheAge || 0

          // Cache just refreshed (< 1 hour), very unlikely to refresh again soon
          // Poll every 30 minutes - rely on window focus for immediate detection
          if (cacheAge < 60) {
            return 30 * 60 * 1000 // 30 minutes
          }

          // Cache is fresh (1-5 hours), refresh not expected for hours
          // Poll every 30 minutes - very low frequency
          if (cacheAge < 300) {
            return 30 * 60 * 1000 // 30 minutes
          }

          // Cache getting old (5-5.5 hours), refresh expected soon
          // Poll every 5 minutes to detect when it starts
          if (cacheAge >= 300 && cacheAge < 330) {
            return 5 * 60 * 1000 // 5 minutes
          }

          // Cache very old (5.5-6 hours), refresh should be happening
          // Poll every 2 minutes to catch it quickly
          if (cacheAge >= 330 && cacheAge < 360) {
            return 2 * 60 * 1000 // 2 minutes
          }

          // Cache overdue (> 6 hours), refresh definitely happening
          // Poll every minute
          return 60 * 1000
        }

        return 2 * 60 * 1000 // Default: 2 minutes
      }

      // Enabled (user waiting for data) - poll aggressively for progress
      if (!data) return 30000 // 30 seconds if no data

      // Poll every 2 seconds when actively refreshing (user sees progress)
      if (data.status === 'refreshing') {
        return 2000
      }

      // Poll every 10 seconds on error to detect recovery
      if (data.status === 'error') {
        return 10000
      }

      // Smart polling when idle based on cache age
      // Background refresh triggers when cache > 6 hours (360 minutes)
      // Refreshes happen at 6 AM and 6 PM UTC (every 12 hours)
      // User is waiting, so we can poll more aggressively for progress
      if (data.status === 'idle') {
        const cacheAge = data.cacheAge || 0

        // Cache just refreshed (< 1 hour), very unlikely to refresh again soon
        // Poll every 15 minutes
        if (cacheAge < 60) {
          return 15 * 60 * 1000 // 15 minutes
        }

        // Cache is fresh (1-5 hours), refresh not expected for hours
        // Poll every 15 minutes
        if (cacheAge < 300) {
          return 15 * 60 * 1000 // 15 minutes
        }

        // Cache getting old (5-5.5 hours), refresh expected soon
        // Poll every 2 minutes to detect when it starts
        if (cacheAge >= 300 && cacheAge < 330) {
          return 2 * 60 * 1000 // 2 minutes
        }

        // Cache very old (5.5-6 hours), refresh should be happening
        // Poll every minute to catch it quickly
        if (cacheAge >= 330 && cacheAge < 360) {
          return 60 * 1000 // 1 minute
        }

        // Cache overdue (> 6 hours), refresh definitely happening
        // Poll every 30 seconds
        return 30 * 1000
      }

      return 2 * 60 * 1000 // Default: 2 minutes
    },

    staleTime: 1000, // Always consider stale after 1 second
    gcTime: 5 * 60 * 1000, // Keep in memory for 5 minutes
    refetchOnWindowFocus: true, // Check status when user returns to tab
    refetchOnReconnect: true, // Check status when internet reconnects

    // Don't retry too aggressively for status checks
    retry: (failureCount) => failureCount < 2,
    retryDelay: 5000, // 5 second delay between retries
  })

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
