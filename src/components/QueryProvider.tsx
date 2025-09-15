'use client'

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale-while-revalidate: show cached data immediately, fetch in background
            staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 min
            gcTime: 30 * 60 * 1000, // 30 minutes - keep in memory for 30 min

            // Background refetch settings
            refetchOnWindowFocus: true, // Refresh when user comes back to tab
            refetchOnReconnect: true, // Refresh when internet reconnects
            refetchInterval: false, // No automatic polling by default

            // Retry failed requests
            retry: (failureCount, error: any) => {
              // Don't retry 4xx errors, but retry network errors
              if (error?.status >= 400 && error?.status < 500) return false
              return failureCount < 3
            },

            // Show cached data while refetching
            notifyOnChangeProps: ['data', 'error', 'isLoading'],
          },
          mutations: {
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
