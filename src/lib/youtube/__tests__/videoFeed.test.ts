// Mock rss-parser so no network fetches happen
const mockParseURL = jest.fn()
jest.mock('rss-parser', () =>
  jest.fn().mockImplementation(() => ({
    parseURL: (...args: unknown[]) => mockParseURL(...args),
  }))
)

// Mock the channel selection store
jest.mock('../channelStore', () => ({
  getSelectedChannels: jest.fn(),
}))

import { getSelectedChannels } from '../channelStore'
import { fetchChannelVideos, fetchAllChannelVideos, YOUTUBE_VIDEO_CATEGORY } from '../videoFeed'
import { channelFeedUrl } from '../constants'
import type { YouTubeChannel } from '@/types'

const mockGetSelectedChannels = getSelectedChannels as jest.MockedFunction<
  typeof getSelectedChannels
>

const channel: YouTubeChannel = { id: 'UCabc123', title: 'Test Channel' }

function feedItem(overrides: Record<string, unknown> = {}) {
  return {
    title: 'My Great Video',
    link: 'https://www.youtube.com/watch?v=vid001',
    pubDate: '2026-09-01T12:00:00.000Z',
    isoDate: '2026-09-01T12:00:00.000Z',
    'yt:videoId': 'vid001',
    'media:group': {
      'media:description': ['A description of the video.'],
    },
    ...overrides,
  }
}

describe('fetchChannelVideos', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('fetches the channel RSS feed URL', async () => {
    mockParseURL.mockResolvedValue({ items: [feedItem()] })
    await fetchChannelVideos(channel)
    expect(mockParseURL).toHaveBeenCalledWith(channelFeedUrl(channel.id))
  })

  it('maps feed items to video Articles', async () => {
    mockParseURL.mockResolvedValue({ items: [feedItem()] })

    const articles = await fetchChannelVideos(channel)

    expect(articles).toHaveLength(1)
    expect(articles[0]).toEqual({
      id: 'video-vid001',
      title: 'My Great Video',
      description: 'A description of the video.',
      content: 'A description of the video.',
      url: 'https://www.youtube.com/watch?v=vid001',
      urlToImage: 'https://i.ytimg.com/vi/vid001/hqdefault.jpg',
      publishedAt: '2026-09-01T12:00:00.000Z',
      source: {
        name: 'Test Channel',
        url: 'https://www.youtube.com/channel/UCabc123',
      },
      category: YOUTUBE_VIDEO_CATEGORY,
      sourceType: 'video',
      videoId: 'vid001',
    })
  })

  it('handles media:description as a plain string', async () => {
    mockParseURL.mockResolvedValue({
      items: [feedItem({ 'media:group': { 'media:description': 'Plain string description' } })],
    })
    const [article] = await fetchChannelVideos(channel)
    expect(article.description).toBe('Plain string description')
  })

  it('truncates long descriptions at a word boundary', async () => {
    const longDescription = 'word '.repeat(200).trim() // 999 chars
    mockParseURL.mockResolvedValue({
      items: [feedItem({ 'media:group': { 'media:description': [longDescription] } })],
    })

    const [article] = await fetchChannelVideos(channel)

    expect(article.description!.length).toBeLessThanOrEqual(301)
    expect(article.description!.endsWith('…')).toBe(true)
    expect(article.description).not.toContain('  ')
  })

  it('derives the videoId from the link when yt:videoId is missing', async () => {
    mockParseURL.mockResolvedValue({ items: [feedItem({ 'yt:videoId': undefined })] })
    const [article] = await fetchChannelVideos(channel)
    expect(article.videoId).toBe('vid001')
    expect(article.urlToImage).toBe('https://i.ytimg.com/vi/vid001/hqdefault.jpg')
  })

  it('skips items with no resolvable videoId', async () => {
    mockParseURL.mockResolvedValue({
      items: [feedItem({ 'yt:videoId': undefined, link: 'https://example.com/nope' }), feedItem()],
    })
    const articles = await fetchChannelVideos(channel)
    expect(articles).toHaveLength(1)
    expect(articles[0].videoId).toBe('vid001')
  })

  it('returns [] and warns when the feed fetch fails', async () => {
    mockParseURL.mockRejectedValue(new Error('network down'))
    await expect(fetchChannelVideos(channel)).resolves.toEqual([])
    expect(console.warn).toHaveBeenCalled()
  })

  it('returns [] for an empty feed', async () => {
    mockParseURL.mockResolvedValue({ items: [] })
    await expect(fetchChannelVideos(channel)).resolves.toEqual([])
  })
})

describe('fetchAllChannelVideos', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns [] without fetching when no channels are selected', async () => {
    mockGetSelectedChannels.mockResolvedValue([])
    await expect(fetchAllChannelVideos()).resolves.toEqual([])
    expect(mockParseURL).not.toHaveBeenCalled()
  })

  it('fetches and flattens all selected channels', async () => {
    mockGetSelectedChannels.mockResolvedValue([
      { id: 'UCone', title: 'One' },
      { id: 'UCtwo', title: 'Two' },
    ])
    mockParseURL
      .mockResolvedValueOnce({ items: [feedItem({ 'yt:videoId': 'a1', link: undefined })] })
      .mockResolvedValueOnce({ items: [feedItem({ 'yt:videoId': 'b1', link: undefined })] })

    const articles = await fetchAllChannelVideos()

    expect(mockParseURL).toHaveBeenCalledTimes(2)
    expect(articles.map((a) => a.videoId)).toEqual(['a1', 'b1'])
    expect(articles.map((a) => a.source.name)).toEqual(['One', 'Two'])
  })

  it('still returns other channels when one feed fails', async () => {
    mockGetSelectedChannels.mockResolvedValue([
      { id: 'UCone', title: 'One' },
      { id: 'UCtwo', title: 'Two' },
    ])
    mockParseURL
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ items: [feedItem({ 'yt:videoId': 'b1' })] })

    const articles = await fetchAllChannelVideos()
    expect(articles).toHaveLength(1)
    expect(articles[0].videoId).toBe('b1')
  })

  it('returns [] when reading the selection throws', async () => {
    mockGetSelectedChannels.mockRejectedValue(new Error('redis down'))
    await expect(fetchAllChannelVideos()).resolves.toEqual([])
  })
})
