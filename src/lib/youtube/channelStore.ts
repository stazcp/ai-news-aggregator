// Persistence for the user's selected YouTube channels.
// Uses the shared cache adapter (Upstash Redis with in-memory fallback).
// NOTE: the cache adapter has no "no TTL" mode (setCachedData requires ttlSeconds),
// so we use a 1-year TTL as the longest practical expiry for this durable config.
// The 'durable:' segment exempts the key from clearCacheAll()/clearCacheByPattern()
// purges, so a routine cache clear cannot wipe the selection.
import { DURABLE_KEY_SEGMENT, getDurableData, setCachedData } from '../cache'
import { CHANNEL_ID_PATTERN, isAllowedThumbnailUrl, MAX_CHANNEL_TITLE_LENGTH } from './constants'
import type { YouTubeChannel } from '@/types'

export const SELECTED_CHANNELS_CACHE_KEY = `${DURABLE_KEY_SEGMENT}youtube:selected-channels`

// Longest supported "durable" TTL: 1 year in seconds
const SELECTED_CHANNELS_TTL_SECONDS = 365 * 24 * 60 * 60

function sanitizeChannel(value: unknown): YouTubeChannel | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.id !== 'string' || !CHANNEL_ID_PATTERN.test(candidate.id)) return null
  if (typeof candidate.title !== 'string' || candidate.title.trim() === '') return null

  const channel: YouTubeChannel = {
    id: candidate.id,
    title: candidate.title.slice(0, MAX_CHANNEL_TITLE_LENGTH),
  }
  // Thumbnails are rendered as <img src>; keep only Google avatar-host https URLs
  if (typeof candidate.thumbnail === 'string' && isAllowedThumbnailUrl(candidate.thumbnail)) {
    channel.thumbnail = candidate.thumbnail
  }
  return channel
}

/**
 * Read the user's selected YouTube channels.
 * Returns [] when nothing is stored or the stored value has a bad shape.
 * Throws when the backing store is unreachable — an outage must not read as an
 * empty selection (a subsequent save would overwrite the real list); callers
 * decide how to degrade.
 */
export async function getSelectedChannels(): Promise<YouTubeChannel[]> {
  const stored = await getDurableData(SELECTED_CHANNELS_CACHE_KEY)
  if (!Array.isArray(stored)) return []
  return stored
    .map(sanitizeChannel)
    .filter((channel): channel is YouTubeChannel => channel !== null)
}

/**
 * Persist the user's selected YouTube channels (replaces the stored list).
 */
export async function setSelectedChannels(channels: YouTubeChannel[]): Promise<void> {
  const sanitized = (Array.isArray(channels) ? channels : [])
    .map(sanitizeChannel)
    .filter((channel): channel is YouTubeChannel => channel !== null)
  await setCachedData(SELECTED_CHANNELS_CACHE_KEY, sanitized, SELECTED_CHANNELS_TTL_SECONDS)
}
