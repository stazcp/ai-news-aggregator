import { getCachedData } from '@/lib/cache'
import HomeClient from '@/components/HomePage/HomeClient'
import { HomepageData } from '@/hooks/useHomepageData'
import { NewsListSkeleton } from '@/components/ui/Skeleton'
import HomeLayout from '@/components/HomePage/HomeLayout'
import { Suspense } from 'react'

export const revalidate = 0 // Disable static generation, always run server-side

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  console.log('🏠 SSR: Loading homepage with initial data...')

  // Get initial data for SSR (non-blocking, fast)
  let initialData: HomepageData | null = null

  try {
    // Only try to get cached data for SSR - don't generate fresh data here
    const cachedHomepage = await getCachedData('homepage-result')

    if (cachedHomepage) {
      console.log('📦 SSR: Using cached homepage data')
      initialData = {
        ...cachedHomepage,
        fromCache: true,
        cacheAge: cachedHomepage.lastUpdated
          ? Math.floor((Date.now() - new Date(cachedHomepage.lastUpdated).getTime()) / (1000 * 60))
          : undefined,
      }
    } else {
      console.log('🔍 SSR: No cached data available, client will handle initial load')
    }
  } catch (error) {
    console.error('❌ SSR: Failed to get initial data:', error)
    // Continue without initial data - client will handle the loading
  }

  return (
    <Suspense
      fallback={
        <HomeLayout>
          <NewsListSkeleton />
        </HomeLayout>
      }
    >
      <HomeClient initialData={initialData || undefined} />
    </Suspense>
  )
}

export async function generateMetadata() {
  return {
    title: 'AI News Aggregator - Latest News with AI Summaries',
    description: 'Get the latest news with AI-powered summaries. Fast, accurate, and up-to-date.',
  }
}
