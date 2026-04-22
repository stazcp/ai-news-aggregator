import { getCachedData } from '@/lib/cache'
import HomeClient from '@/components/HomePage/HomeClient'
import { HomepageData } from '@/hooks/useHomepageData'
import { NewsListSkeleton } from '@/components/ui/Skeleton'
import HomeLayout from '@/components/HomePage/HomeLayout'
import { Suspense } from 'react'
import { isProjectPaused } from '@/lib/config/projectState'

export const revalidate = 0

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  void searchParams

  if (isProjectPaused()) {
    return (
      <main className="min-h-screen bg-stone-950 text-stone-100">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-20">
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-stone-400">Project Paused</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            AI News Aggregator is offline.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-stone-300 sm:text-lg">
            The live refresh pipeline, AI summaries, and production traffic paths have been
            disabled to stop ongoing infrastructure and model spend.
          </p>
          <div className="mt-10 rounded-2xl border border-stone-800 bg-stone-900/70 p-6">
            <p className="text-sm text-stone-200">
              If this project comes back later, it should be restarted intentionally with fresh
              credentials, an explicit budget, and new schedules.
            </p>
          </div>
        </div>
      </main>
    )
  }

  console.log('🏠 SSR: Loading homepage with initial data...')

  let initialData: HomepageData | null = null

  try {
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
  if (isProjectPaused()) {
    return {
      title: 'AI News Aggregator - Offline',
      description: 'This project is paused and no longer serving live AI-generated news updates.',
    }
  }

  return {
    title: 'AI News Aggregator - Latest News with AI Summaries',
    description: 'Get the latest news with AI-powered summaries. Fast, accurate, and up-to-date.',
  }
}
