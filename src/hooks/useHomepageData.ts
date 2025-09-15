import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { HomepageData as BaseHomepageData } from '@/lib/homepageGenerator'

export interface HomepageData extends BaseHomepageData {
  fromCache: boolean
  cacheAge?: number
}

export function useHomepageData(initialData?: HomepageData) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['homepage-data'],
    queryFn: async (): Promise<HomepageData> => {
      console.log('🔄 Fetching homepage data from API...')

      const response = await fetch('/api/homepage', {
        headers: {
          'Cache-Control': 'no-cache',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch homepage data: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log(
        `✅ Homepage data fetched (fromCache: ${data.fromCache}, cacheAge: ${data.cacheAge}min)`
      )

      return data
    },

    // Use initial data from SSR if available
    ...(initialData && { initialData }),

    // Cache for 10 minutes, but show stale data immediately
    staleTime: 10 * 60 * 1000, // 10 minutes - data is fresh for 10 min
    gcTime: 60 * 60 * 1000, // 1 hour - keep in memory for 1 hour

    // Show cached data first, only refetch if stale
    refetchOnMount: true, // Only refetch if data is stale
    refetchOnWindowFocus: false, // Don't refetch on window focus to avoid constant updates
    refetchOnReconnect: true, // Refresh when internet reconnects

    // Custom background refetch logic based on data age
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data?.lastUpdated) return false

      const lastUpdate = new Date(data.lastUpdated)
      const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60)

      // If data is older than 12 hours, check every 30 minutes for updates
      if (hoursSinceUpdate > 12) {
        console.log(`📅 Data is ${hoursSinceUpdate.toFixed(1)} hours old, polling for updates`)
        return 30 * 60 * 1000 // 30 minutes
      }

      // If data is older than 6 hours, check every hour
      if (hoursSinceUpdate > 6) {
        console.log(`📅 Data is ${hoursSinceUpdate.toFixed(1)} hours old, checking occasionally`)
        return 60 * 60 * 1000 // 1 hour
      }

      // Data is fresh, no need to poll
      return false
    },

    // Retry configuration
    retry: (failureCount, error: any) => {
      // Don't retry 4xx errors (client errors)
      if (error?.status >= 400 && error?.status < 500) {
        console.log('❌ Client error, not retrying')
        return false
      }

      // Retry network errors up to 3 times with exponential backoff
      if (failureCount < 3) {
        console.log(`🔄 Retrying homepage fetch (attempt ${failureCount + 1}/3)`)
        return true
      }

      return false
    },

    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff, max 30s
  })

  // Handle data changes with useEffect (replaces onSuccess/onError)
  useEffect(() => {
    if (query.data) {
      console.log('✅ Homepage data updated successfully')

      // If we got fresh data, invalidate related queries to trigger updates
      if (!query.data.fromCache) {
        console.log('🔄 Fresh data received, invalidating related queries')
        queryClient.invalidateQueries({
          queryKey: ['news'],
          refetchType: 'none', // Don't refetch, just mark as stale
        })
        queryClient.invalidateQueries({
          queryKey: ['summary'],
          refetchType: 'none',
        })
      }
    }

    if (query.error) {
      console.error('❌ Failed to fetch homepage data:', query.error)
    }
  }, [query.data, query.error, queryClient])

  return query
}

// Helper hook to get just the loading state for the homepage
export function useHomepageLoading() {
  const { isLoading, isFetching, error } = useHomepageData()

  return {
    isInitialLoading: isLoading, // True only on first load with no cached data
    isRefreshing: isFetching && !isLoading, // True when updating in background
    hasError: !!error,
  }
}

// Helper hook to check if homepage data is stale
export function useHomepageDataAge() {
  const { data } = useHomepageData()

  if (!data?.lastUpdated) return null

  const lastUpdate = new Date(data.lastUpdated)
  const ageInHours = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60)

  return {
    lastUpdated: lastUpdate,
    ageInHours,
    isStale: ageInHours > 6, // Consider stale after 6 hours
    isVeryStale: ageInHours > 24, // Consider very stale after 24 hours
  }
}
