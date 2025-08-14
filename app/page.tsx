import { fetchAllNews } from '@/lib/newsService'
import { getStoryClusters, getUnclusteredArticles } from '@/lib/clusterService'
import { getCachedData, setCachedData } from '@/lib/cache'
import NewsList from '@/components/NewsList'
import { StoryCluster, Article } from '@/types'
import HomeHeader from '@/components/HomePage/HomeHeader'
import HomeLayout from '@/components/HomePage/HomeLayout'
import HomeError from '@/components/HomePage/HomeError'

export const revalidate = 1800 // 30 minutes instead of 10 to reduce server load

// Composed homepage renderer
function renderHomepage(
  storyClusters: StoryCluster[],
  unclusteredArticles: Article[],
  rateLimitMessage: string | null
) {
  return (
    <HomeLayout>
      <HomeHeader rateLimitMessage={rateLimitMessage} />
      <NewsList storyClusters={storyClusters} unclusteredArticles={unclusteredArticles} />
    </HomeLayout>
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

    return <HomeError />
  }
}

export async function generateMetadata() {
  return {
    title: 'AI News Aggregator - Latest News with AI Summaries',
    description: 'Get the latest news with AI-powered summaries. Fast, accurate, and up-to-date.',
  }
}
