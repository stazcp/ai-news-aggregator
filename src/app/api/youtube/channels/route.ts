import { NextRequest, NextResponse } from 'next/server'
import { getSelectedChannels, setSelectedChannels } from '@/lib/youtube/channelStore'
import { GoogleApiError, verifyAccessToken } from '@/lib/youtube/google'
import {
  CHANNEL_ID_PATTERN,
  isAllowedThumbnailUrl,
  MAX_CHANNEL_TITLE_LENGTH,
  YT_ACCESS_TOKEN_COOKIE,
} from '@/lib/youtube/constants'
import { setCachedData } from '@/lib/cache'
import { isProjectPaused } from '@/lib/config/projectState'
import type { YouTubeChannel } from '@/types'

// Hard cap on how many channels can be ingested
const MAX_SELECTED_CHANNELS = 200

function parseChannel(value: unknown): YouTubeChannel | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.id !== 'string' || !CHANNEL_ID_PATTERN.test(candidate.id)) return null
  if (typeof candidate.title !== 'string' || candidate.title.trim() === '') return null

  const channel: YouTubeChannel = {
    id: candidate.id,
    title: candidate.title.slice(0, MAX_CHANNEL_TITLE_LENGTH),
  }
  // Untrusted thumbnails are rendered as <img src>; drop anything off Google's avatar hosts
  if (typeof candidate.thumbnail === 'string' && isAllowedThumbnailUrl(candidate.thumbnail)) {
    channel.thumbnail = candidate.thumbnail
  }
  return channel
}

// Read the persisted channel selection
export async function GET() {
  if (isProjectPaused()) {
    return NextResponse.json(
      { error: 'Project paused. YouTube channel selection has been disabled.' },
      { status: 410 }
    )
  }

  try {
    const channels = await getSelectedChannels()
    return NextResponse.json({ channels })
  } catch (error) {
    console.error('Failed to read selected channels:', error)
    return NextResponse.json({ error: 'Failed to read selected channels' }, { status: 500 })
  }
}

// Replace the persisted channel selection: PUT {channels: YouTubeChannel[]}
export async function PUT(request: NextRequest) {
  if (isProjectPaused()) {
    return NextResponse.json(
      { error: 'Project paused. YouTube channel selection has been disabled.' },
      { status: 410 }
    )
  }

  try {
    // Writes require proof of ownership: the short-lived YouTube access token
    // cookie, verified against Google (aud must match this app's OAuth client).
    const accessToken = request.cookies.get(YT_ACCESS_TOKEN_COOKIE)?.value
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not connected to YouTube. Visit /api/youtube/auth to sign in.' },
        { status: 401 }
      )
    }
    try {
      if (!(await verifyAccessToken(accessToken))) {
        return NextResponse.json(
          { error: 'YouTube session expired or invalid. Sign in again via /api/youtube/auth.' },
          { status: 401 }
        )
      }
    } catch (error) {
      const message = error instanceof GoogleApiError ? error.message : 'unknown error'
      console.error('Failed to verify YouTube access token:', message)
      return NextResponse.json({ error: 'Could not verify YouTube session' }, { status: 502 })
    }

    const body = await request.json().catch(() => null)
    const rawChannels = body?.channels
    if (!Array.isArray(rawChannels)) {
      return NextResponse.json(
        { error: 'Invalid body: expected {"channels": [{"id", "title", "thumbnail?"}]}' },
        { status: 400 }
      )
    }
    if (rawChannels.length > MAX_SELECTED_CHANNELS) {
      return NextResponse.json(
        { error: `Too many channels: maximum is ${MAX_SELECTED_CHANNELS}` },
        { status: 400 }
      )
    }

    const channels: YouTubeChannel[] = []
    for (const entry of rawChannels) {
      const channel = parseChannel(entry)
      if (!channel) {
        return NextResponse.json(
          {
            error:
              'Invalid channel entry: each channel needs a valid YouTube channel "id" (UC…) and non-empty string "title"',
          },
          { status: 400 }
        )
      }
      channels.push(channel)
    }

    await setSelectedChannels(channels)

    // Invalidate the aggregated news cache so the next fetchAllNews() reflects the
    // new selection instead of waiting out the 15-minute 'all-news' TTL.
    // fetchAllNews treats an empty array as a cache miss. Best-effort: a cache
    // hiccup should not fail the save.
    try {
      await setCachedData('all-news', [], 1)
    } catch (error) {
      console.warn('Failed to invalidate all-news cache after selection change:', error)
    }

    return NextResponse.json({ channels })
  } catch (error) {
    console.error('Failed to save selected channels:', error)
    return NextResponse.json({ error: 'Failed to save selected channels' }, { status: 500 })
  }
}
