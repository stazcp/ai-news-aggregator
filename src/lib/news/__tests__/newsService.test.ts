// Shrink the configured RSS sources to a single feed so fetchAllNews runs one fast batch
jest.mock('../rss-feeds.json', () => ({
  sources: {
    testsource: {
      name: 'Test Source',
      feeds: [{ id: 'test-tech', category: 'Technology', url: 'https://example.com/feed.xml' }],
    },
  },
  categoryMeta: {},
}))

// Mock rss-parser so no network fetches happen
const mockParseURL = jest.fn()
jest.mock('rss-parser', () =>
  jest.fn().mockImplementation(() => ({
    parseURL: (...args: unknown[]) => mockParseURL(...args),
  }))
)

// Mock the cache adapter
jest.mock('../../cache', () => ({
  getCachedData: jest.fn(),
  setCachedData: jest.fn(),
}))

// Mock the YouTube video feed module (its own tests cover mapping)
jest.mock('../../youtube/videoFeed', () => ({
  fetchAllChannelVideos: jest.fn(),
}))

import { getCachedData, setCachedData } from '../../cache'
import { fetchAllChannelVideos } from '../../youtube/videoFeed'
import { fetchAllNews } from '../newsService'
import type { Article } from '@/types'

const mockGetCachedData = getCachedData as jest.MockedFunction<typeof getCachedData>
const mockSetCachedData = setCachedData as jest.MockedFunction<typeof setCachedData>
const mockFetchAllChannelVideos = fetchAllChannelVideos as jest.MockedFunction<
  typeof fetchAllChannelVideos
>

const rssItem = {
  title: 'An RSS Article',
  link: 'https://example.com/article-1',
  pubDate: '2026-09-01T10:00:00.000Z',
  isoDate: '2026-09-01T10:00:00.000Z',
  contentSnippet: 'Article snippet',
}

const videoArticle: Article = {
  id: 'video-vid001',
  title: 'A YouTube Video',
  description: 'Video description',
  content: 'Video description',
  url: 'https://www.youtube.com/watch?v=vid001',
  urlToImage: 'https://i.ytimg.com/vi/vid001/hqdefault.jpg',
  publishedAt: '2026-09-01T12:00:00.000Z',
  source: { name: 'Test Channel', url: 'https://www.youtube.com/channel/UCabc123' },
  category: 'AI',
  sourceType: 'video',
  videoId: 'vid001',
}

describe('fetchAllNews YouTube merge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCachedData.mockResolvedValue(null)
    mockSetCachedData.mockResolvedValue(undefined)
    mockParseURL.mockResolvedValue({ title: 'Test Source', items: [rssItem] })
    mockFetchAllChannelVideos.mockResolvedValue([])
  })

  it('merges channel videos alongside RSS articles, newest first', async () => {
    mockFetchAllChannelVideos.mockResolvedValue([videoArticle])

    const articles = await fetchAllNews()

    expect(mockFetchAllChannelVideos).toHaveBeenCalledTimes(1)
    expect(articles).toHaveLength(2)
    // Video published later than the RSS article, so it sorts first
    expect(articles[0].id).toBe('video-vid001')
    expect(articles[0].sourceType).toBe('video')
    expect(articles[0].videoId).toBe('vid001')
    expect(articles[0].urlToImage).toBe('https://i.ytimg.com/vi/vid001/hqdefault.jpg')
    expect(articles[1].title).toBe('An RSS Article')
  })

  it('is a no-op when no channels are selected', async () => {
    mockFetchAllChannelVideos.mockResolvedValue([])

    const articles = await fetchAllNews()

    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe('An RSS Article')
    expect(articles.some((a) => a.sourceType === 'video')).toBe(false)
  })

  it('keeps RSS articles when the video fetch rejects', async () => {
    mockFetchAllChannelVideos.mockRejectedValue(new Error('youtube down'))

    const articles = await fetchAllNews()

    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe('An RSS Article')
  })

  it('dedupes videos with identical watch URLs', async () => {
    mockFetchAllChannelVideos.mockResolvedValue([
      videoArticle,
      { ...videoArticle, id: 'video-vid001-dup' },
    ])

    const articles = await fetchAllNews()

    expect(articles.filter((a) => a.sourceType === 'video')).toHaveLength(1)
  })

  it('keeps distinct videos (different videoIds) through dedupe', async () => {
    mockFetchAllChannelVideos.mockResolvedValue([
      videoArticle,
      {
        ...videoArticle,
        id: 'video-vid002',
        title: 'Another YouTube Video',
        url: 'https://www.youtube.com/watch?v=vid002',
        videoId: 'vid002',
      },
    ])

    const articles = await fetchAllNews()

    const videos = articles.filter((a) => a.sourceType === 'video')
    expect(videos).toHaveLength(2)
    expect(videos.map((a) => a.videoId).sort()).toEqual(['vid001', 'vid002'])
  })

  it('does not fetch videos when cached news exists', async () => {
    const cachedArticles = [{ ...videoArticle, id: 'cached-1' }]
    mockGetCachedData.mockResolvedValue(cachedArticles)

    const articles = await fetchAllNews()

    expect(articles).toEqual(cachedArticles)
    expect(mockFetchAllChannelVideos).not.toHaveBeenCalled()
    expect(mockParseURL).not.toHaveBeenCalled()
  })

  it('caches the merged result', async () => {
    mockFetchAllChannelVideos.mockResolvedValue([videoArticle])

    await fetchAllNews()

    expect(mockSetCachedData).toHaveBeenCalledTimes(1)
    const [key, data] = mockSetCachedData.mock.calls[0]
    expect(key).toBe('all-news')
    expect((data as Article[]).some((a) => a.sourceType === 'video')).toBe(true)
  })
})
