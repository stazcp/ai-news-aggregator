import { fetchAllNews } from '@/lib/newsService'
import { getStoryClusters, getUnclusteredArticles } from '@/lib/clusterService'
import { getCachedData, setCachedData } from '@/lib/cache'
import NewsList from '@/components/NewsList'
import { StoryCluster, Article } from '@/types'

export const revalidate = 1800 // 30 minutes instead of 10 to reduce server load

// Extracted render function to avoid JSX duplication
function renderHomepage(
  storyClusters: StoryCluster[],
  unclusteredArticles: Article[],
  rateLimitMessage: string | null
) {
  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-6xl md:text-7xl">
          AI-Curated News
        </h1>
        <p className="mt-4 text-lg text-[var(--muted-foreground)]">
          Your daily feed of news, intelligently grouped and summarized by AI.
        </p>
        {rateLimitMessage && (
          <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg max-w-2xl mx-auto">
            <p className="text-sm text-yellow-300">⚠️ {rateLimitMessage}</p>
          </div>
        )}
      </header>
      <NewsList storyClusters={storyClusters} unclusteredArticles={unclusteredArticles} />
    </main>
  )
}

export default async function Home() {
  try {
    console.log('🏠 Loading homepage - checking for cached news data first...')

    // Check for cached homepage result first
    const cachedHomepage = await getCachedData('homepage-result')
    if (cachedHomepage) {
      console.log('📦 Using cached homepage result')
      return renderHomepage(
        cachedHomepage.storyClusters,
        cachedHomepage.unclusteredArticles,
        cachedHomepage.rateLimitMessage
      )
    }

    // Try to get cached data first to avoid expensive RSS fetching
    const cachedArticles = await getCachedData('all-news')

    let allArticles
    if (cachedArticles && cachedArticles.length > 0) {
      console.log(`✅ Using cached data: ${cachedArticles.length} articles`)
      allArticles = cachedArticles
    } else {
      console.log('📡 No cached data found, fetching fresh news with timeout protection...')

      // Fallback to fresh fetch with timeout protection
      const fetchTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Homepage fetch timeout after 30 seconds')), 30000)
      )

      try {
        allArticles = await Promise.race([fetchAllNews(), fetchTimeout])
        console.log(`✅ Fresh news data loaded: ${allArticles.length} articles`)
      } catch (fetchError) {
        console.error('❌ Failed to fetch fresh news data:', fetchError)
        throw fetchError
      }
    }

    if (!allArticles || allArticles.length === 0) {
      throw new Error('No articles available')
    }

    console.log('🔄 Processing story clusters...')
    const clusteringResult = await getStoryClusters(allArticles)
    const storyClusters = clusteringResult.clusters
    const unclusteredArticles = getUnclusteredArticles(allArticles, storyClusters)

    // Only show rate limit message when actually rate limited
    const rateLimitMessage = clusteringResult.rateLimited
      ? 'AI clustering temporarily unavailable due to rate limits. Showing individual articles.'
      : null

    const homepageResult = {
      storyClusters,
      unclusteredArticles,
      rateLimitMessage,
    }

    if (rateLimitMessage) {
      console.log(`⚠️ ${rateLimitMessage}`)
      // Cache rate limit result for only 2 minutes to allow faster retries
      await setCachedData('homepage-result', homepageResult, 120) // 2 min cache for rate limit scenarios
    } else {
      console.log(
        `✅ Processed ${storyClusters.length} story clusters and ${unclusteredArticles.length} individual articles`
      )
      // Cache successful result for longer
      await setCachedData('homepage-result', homepageResult, 600) // 10 min cache for successful results
    }

    return renderHomepage(storyClusters, unclusteredArticles, rateLimitMessage)
  } catch (error) {
    console.error('❌ Critical error loading homepage:', error)

    return (
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-6xl md:text-7xl">
            AI-Curated News
          </h1>
          <p className="mt-4 text-lg text-[var(--muted-foreground)]">
            Your daily feed of news, intelligently grouped and summarized by AI.
          </p>
        </header>
        <div className="text-center py-12">
          <div className="mx-auto max-w-md">
            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">
              Unable to load news
            </h2>
            <p className="text-lg text-[var(--muted-foreground)] mb-6">
              We're experiencing issues loading the latest news. This might be due to high traffic
              or temporary server issues.
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Please try refreshing the page in a few moments.
            </p>
          </div>
        </div>
      </main>
    )
  }
}

export async function generateMetadata() {
  return {
    title: 'AI News Aggregator - Latest News with AI Summaries',
    description: 'Get the latest news with AI-powered summaries. Fast, accurate, and up-to-date.',
  }
}
