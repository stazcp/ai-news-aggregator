import { fetchAllNews } from '@/lib/newsService'
import { getStoryClusters, getUnclusteredArticles } from '@/lib/clusterService'
import { getCachedData, setCachedData } from '@/lib/cache'
import NewsList from '@/components/NewsList'
import { StoryCluster, Article } from '@/types'
import HomeClient from '@/components/HomePage/HomeClient'
import HomeError from '@/components/HomePage/HomeError'
import { computeTrendingTopics, computeCategoryFallbackTopics } from '@/lib/topics'
import { filterByTopic, getParamString } from '@/lib/utils'

export const revalidate = 1800 // 30 minutes instead of 10 to reduce server load

// Composed homepage renderer
function renderHomepage(
  storyClusters: StoryCluster[],
  unclusteredArticles: Article[],
  rateLimitMessage: string | null,
  topics: string[]
) {
  return (
    <HomeClient
      storyClusters={storyClusters}
      unclusteredArticles={unclusteredArticles}
      topics={topics}
      rateLimitMessage={rateLimitMessage}
    />
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  try {
    console.log('🏠 Loading homepage - checking for cached news data first...')
    const sp = searchParams ? await searchParams : undefined
    const topicParam = decodeURIComponent(getParamString(sp?.topic) || '')
    // Check for cached homepage result first
    const cachedHomepage = await getCachedData('homepage-result')
    if (cachedHomepage) {
      console.log('📦 Using cached homepage result')
      const { storyClusters, unclusteredArticles, rateLimitMessage, topics } = cachedHomepage || {}
      const clusters = storyClusters
      const unclustered = unclusteredArticles
      const computed = computeTrendingTopics(unclustered, clusters, 10)
      const safeTopics = (
        topics && topics.length
          ? topics
          : computed.length
            ? computed
            : computeCategoryFallbackTopics(unclusteredArticles, storyClusters, 10)
      ) as string[]
      return renderHomepage(clusters, unclustered, rateLimitMessage || null, safeTopics)
    }

    // Try to get cached data first to avoid expensive RSS fetching
    const cachedArticles = await getCachedData('all-news')

    let allArticles
    if (cachedArticles && cachedArticles.length > 0) {
      console.log(`✅ Using cached data: ${cachedArticles.length} articles`)
      allArticles = cachedArticles
    } else {
      console.log('📡 No cached data found, fetching fresh news with timeout protection...')

      // Fetch fresh news. We avoid a hard global timeout so a single slow feed
      // doesn't cause the homepage to fail. Each feed already has its own
      // internal timeouts and failures are handled per‑feed.
      try {
        allArticles = await fetchAllNews()
        console.log(`✅ Fresh news data loaded: ${allArticles.length} articles`)
      } catch (fetchError) {
        console.error('❌ Failed to fetch fresh news data:', fetchError)
        // Graceful fallback: if fetching fails unexpectedly, try cached data again
        const fallback = await getCachedData('all-news')
        if (fallback && fallback.length) {
          console.warn('⚠️ Using last cached articles due to fetch failure')
          allArticles = fallback
        } else {
          throw fetchError
        }
      }
    }

    if (!allArticles || allArticles.length === 0) {
      throw new Error('No articles available')
    }

    console.log('🔄 Processing story clusters...')
    const clusteringResult = await getStoryClusters(allArticles)
    const storyClusters = clusteringResult.clusters
    const unclusteredArticles = getUnclusteredArticles(allArticles, storyClusters)
    const computed = computeTrendingTopics(allArticles, storyClusters, 10)
    const topics = computed.length
      ? computed
      : computeCategoryFallbackTopics(allArticles, storyClusters, 10)
    // Only show rate limit message when actually rate limited
    const rateLimitMessage = clusteringResult.rateLimited
      ? 'AI clustering temporarily unavailable due to rate limits. Showing individual articles.'
      : null

    const homepageResult = {
      storyClusters,
      unclusteredArticles,
      rateLimitMessage,
      topics,
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
    return renderHomepage(storyClusters, unclusteredArticles, rateLimitMessage, topics)
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
