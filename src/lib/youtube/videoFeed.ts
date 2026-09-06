// Ingestion of selected YouTube channels' upload feeds as Articles.
// YouTube publishes per-channel RSS at https://www.youtube.com/feeds/videos.xml?channel_id=...
// (Atom with yt:videoId and media:group/media:description entries).
import Parser from 'rss-parser'
import type { Article, YouTubeChannel } from '@/types'
import { channelFeedUrl } from './constants'
import { getSelectedChannels } from './channelStore'
import { ENV_DEFAULTS, envInt } from '@/lib/config/env'

// Reuse an existing category so severity/topic filtering need no changes
// ('AI' is in rss-feeds.json categoryMeta and aliased to the 'Artificial Intelligence' topic).
export const YOUTUBE_VIDEO_CATEGORY = 'AI'

const DESCRIPTION_MAX_LENGTH = 300

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
  },
  customFields: {
    item: [
      ['yt:videoId', 'yt:videoId'],
      ['media:group', 'media:group'],
    ],
  },
})

// media:group children come back from xml2js in a few shapes depending on
// parser options; handle string, { _: string } and single-element array forms.
function extractMediaDescription(mediaGroup: unknown): string {
  if (!mediaGroup || typeof mediaGroup !== 'object') return ''
  const raw = (mediaGroup as Record<string, unknown>)['media:description']
  const candidate = Array.isArray(raw) ? raw[0] : raw
  if (typeof candidate === 'string') return candidate.trim()
  if (candidate && typeof candidate === 'object') {
    const text = (candidate as Record<string, unknown>)['_']
    if (typeof text === 'string') return text.trim()
  }
  return ''
}

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text
  const cut = text.slice(0, DESCRIPTION_MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : DESCRIPTION_MAX_LENGTH).trimEnd()}…`
}

function extractVideoId(item: Record<string, any>): string | null {
  const direct = item['yt:videoId']
  if (typeof direct === 'string' && direct.trim() !== '') return direct.trim()
  // Fallback: derive from the watch URL
  try {
    const link = typeof item.link === 'string' ? item.link : ''
    const v = new URL(link).searchParams.get('v')
    if (v) return v
  } catch {}
  return null
}

/**
 * Fetch one channel's upload feed and map entries to Articles.
 * Never throws; errors are logged and yield [].
 */
export async function fetchChannelVideos(channel: YouTubeChannel): Promise<Article[]> {
  if (!channel?.id) return []

  try {
    const feed = await parser.parseURL(channelFeedUrl(channel.id))
    if (!feed.items || feed.items.length === 0) return []

    const PER_FEED_LIMIT = envInt('FEED_ITEMS_PER_FEED', ENV_DEFAULTS.feedItemsPerFeed)

    return feed.items
      .slice(0, PER_FEED_LIMIT)
      .map((item): Article | null => {
        try {
          const videoId = extractVideoId(item as Record<string, any>)
          if (!videoId) return null

          const description = truncateDescription(
            extractMediaDescription((item as Record<string, any>)['media:group'])
          )

          return {
            id: `video-${videoId}`,
            title: item.title?.trim() || 'Untitled Video',
            description,
            content: description,
            url: item.link?.trim() || `https://www.youtube.com/watch?v=${videoId}`,
            urlToImage: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
            source: {
              name: channel.title,
              url: `https://www.youtube.com/channel/${encodeURIComponent(channel.id)}`,
            },
            category: YOUTUBE_VIDEO_CATEGORY,
            sourceType: 'video',
            videoId,
          }
        } catch (error) {
          console.warn(`Warning: Error processing video item from ${channel.title}:`, error)
          return null
        }
      })
      .filter((article): article is Article => article !== null)
  } catch (error) {
    console.warn(`⚠️ Failed to fetch YouTube feed for channel ${channel.title} (${channel.id}):`, error)
    return []
  }
}

/**
 * Fetch videos for all selected channels concurrently.
 * Zero selected channels costs a single cache read and returns [].
 */
export async function fetchAllChannelVideos(): Promise<Article[]> {
  try {
    const channels = await getSelectedChannels()
    if (channels.length === 0) return []

    // Fetch in batches of 8 to match the RSS pipeline's concurrency cap
    const BATCH_SIZE = 8
    const results: Article[][] = []
    for (let i = 0; i < channels.length; i += BATCH_SIZE) {
      const batch = channels.slice(i, i + BATCH_SIZE)
      results.push(...(await Promise.all(batch.map((channel) => fetchChannelVideos(channel)))))
    }
    return results.flat()
  } catch (error) {
    console.warn('⚠️ Failed to fetch YouTube channel videos:', error)
    return []
  }
}
