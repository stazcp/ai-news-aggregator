// Mock the cache adapter (keep the real DURABLE_KEY_SEGMENT constant)
jest.mock('../../cache', () => ({
  DURABLE_KEY_SEGMENT: 'durable:',
  getDurableData: jest.fn(),
  setCachedData: jest.fn(),
}))

import { getDurableData, setCachedData } from '../../cache'
import {
  getSelectedChannels,
  setSelectedChannels,
  SELECTED_CHANNELS_CACHE_KEY,
} from '../channelStore'

const mockGetDurableData = getDurableData as jest.MockedFunction<typeof getDurableData>
const mockSetCachedData = setCachedData as jest.MockedFunction<typeof setCachedData>

// Valid YouTube channel ids: "UC" + 22 URL-safe base64 chars
const UC1 = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const UC2 = 'UCbbbbbbbbbbbbbbbbbbbbbb'
const UC3 = 'UCcccccccccccccccccccccc'
const THUMB = 'https://yt3.ggpht.com/avatar=s88'

describe('channelStore', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetDurableData.mockResolvedValue(null)
    mockSetCachedData.mockResolvedValue(undefined)
  })

  describe('getSelectedChannels', () => {
    it('reads from the cache under the durable youtube:selected-channels key', async () => {
      await getSelectedChannels()
      expect(mockGetDurableData).toHaveBeenCalledWith(SELECTED_CHANNELS_CACHE_KEY)
      // The durable: segment exempts the key from clearCacheAll()/pattern purges
      expect(SELECTED_CHANNELS_CACHE_KEY).toBe('durable:youtube:selected-channels')
    })

    it('returns [] when nothing is stored', async () => {
      mockGetDurableData.mockResolvedValue(null)
      await expect(getSelectedChannels()).resolves.toEqual([])
    })

    it('returns stored channels with valid shape', async () => {
      const channels = [
        { id: UC1, title: 'Channel One', thumbnail: THUMB },
        { id: UC2, title: 'Channel Two' },
      ]
      mockGetDurableData.mockResolvedValue(channels)
      await expect(getSelectedChannels()).resolves.toEqual(channels)
    })

    it('returns [] when the stored value is not an array', async () => {
      mockGetDurableData.mockResolvedValue({ id: UC1, title: 'Not an array' })
      await expect(getSelectedChannels()).resolves.toEqual([])
    })

    it('filters out malformed entries and strips unknown fields', async () => {
      mockGetDurableData.mockResolvedValue([
        { id: UC1, title: 'Valid', extra: 'ignored' },
        { id: '', title: 'Empty id' },
        { id: 'UC-too-short', title: 'Bad id format' },
        { id: UC3 }, // missing title
        { id: 42, title: 'Numeric id' },
        'not-an-object',
        null,
        { id: UC2, title: 'Also valid', thumbnail: 123 }, // bad thumbnail dropped
      ])
      await expect(getSelectedChannels()).resolves.toEqual([
        { id: UC1, title: 'Valid' },
        { id: UC2, title: 'Also valid' },
      ])
    })

    it('drops thumbnails that are not https Google avatar URLs', async () => {
      mockGetDurableData.mockResolvedValue([
        { id: UC1, title: 'One', thumbnail: 'https://evil.example.com/pixel.gif' },
        { id: UC2, title: 'Two', thumbnail: 'http://yt3.ggpht.com/insecure' },
      ])
      await expect(getSelectedChannels()).resolves.toEqual([
        { id: UC1, title: 'One' },
        { id: UC2, title: 'Two' },
      ])
    })

    it('propagates a store outage instead of masking it as an empty selection', async () => {
      mockGetDurableData.mockRejectedValue(new Error('redis down'))
      await expect(getSelectedChannels()).rejects.toThrow('redis down')
    })
  })

  describe('setSelectedChannels', () => {
    it('persists channels under the durable key with a long TTL', async () => {
      const channels = [{ id: UC1, title: 'Channel One' }]
      await setSelectedChannels(channels)

      expect(mockSetCachedData).toHaveBeenCalledTimes(1)
      const [key, data, ttlSeconds] = mockSetCachedData.mock.calls[0]
      expect(key).toBe(SELECTED_CHANNELS_CACHE_KEY)
      expect(data).toEqual(channels)
      // Durable config: adapter requires a TTL, so we use 1 year
      expect(ttlSeconds).toBe(365 * 24 * 60 * 60)
    })

    it('sanitizes malformed entries before persisting', async () => {
      await setSelectedChannels([
        { id: UC1, title: 'Valid' },
        { id: '', title: 'Bad' },
        { id: 'garbage-id', title: 'Bad format' },
      ] as any)

      const [, data] = mockSetCachedData.mock.calls[0]
      expect(data).toEqual([{ id: UC1, title: 'Valid' }])
    })

    it('truncates oversized titles before persisting', async () => {
      await setSelectedChannels([{ id: UC1, title: 'x'.repeat(5000) }])

      const [, data] = mockSetCachedData.mock.calls[0]
      expect((data as { title: string }[])[0].title).toHaveLength(200)
    })

    it('persists an empty list to clear the selection', async () => {
      await setSelectedChannels([])
      const [key, data] = mockSetCachedData.mock.calls[0]
      expect(key).toBe(SELECTED_CHANNELS_CACHE_KEY)
      expect(data).toEqual([])
    })
  })
})
