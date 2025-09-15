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

export function useRefreshStatus() {
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

    // Polling configuration based on current status
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 30000 // 30 seconds if no data

      // Poll every 2 seconds when actively refreshing
      if (data.status === 'refreshing') {
        return 2000
      }

      // Poll every 30 seconds when idle to detect new refreshes
      if (data.status === 'idle') {
        return 30000
      }

      // Poll every 10 seconds on error to detect recovery
      if (data.status === 'error') {
        return 10000
      }

      return 30000 // Default fallback
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
export function useRefreshIndicator() {
  const { refreshStatus, isRefreshing, justCompleted } = useRefreshStatus()

  return {
    show: isRefreshing || justCompleted,
    stage: refreshStatus.stage,
    progress: refreshStatus.progress,
    isComplete: justCompleted,
    isActive: isRefreshing,
  }
}
