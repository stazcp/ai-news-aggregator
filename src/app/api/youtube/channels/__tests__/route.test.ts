import { NextRequest } from 'next/server'
import { GET, PUT } from '../route'

jest.mock('../../../../../lib/youtube/channelStore', () => ({
  getSelectedChannels: jest.fn(),
  setSelectedChannels: jest.fn(),
}))

jest.mock('../../../../../lib/cache', () => ({
  setCachedData: jest.fn(),
}))

jest.mock('../../../../../lib/youtube/google', () => {
  const actual = jest.requireActual('../../../../../lib/youtube/google')
  return {
    GoogleApiError: actual.GoogleApiError,
    verifyAccessToken: jest.fn(),
  }
})

import { getSelectedChannels, setSelectedChannels } from '../../../../../lib/youtube/channelStore'
import { GoogleApiError, verifyAccessToken } from '../../../../../lib/youtube/google'
import { setCachedData } from '../../../../../lib/cache'
const mockSetCachedData = setCachedData as jest.MockedFunction<typeof setCachedData>
const mockGetSelectedChannels = getSelectedChannels as jest.MockedFunction<
  typeof getSelectedChannels
>
const mockSetSelectedChannels = setSelectedChannels as jest.MockedFunction<
  typeof setSelectedChannels
>
const mockVerifyAccessToken = verifyAccessToken as jest.MockedFunction<typeof verifyAccessToken>

// Valid YouTube channel ids: "UC" + 22 URL-safe base64 chars
const UC1 = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const UC2 = 'UCbbbbbbbbbbbbbbbbbbbbbb'
const THUMB = 'https://yt3.ggpht.com/avatar=s88'

function createPutRequest(body: unknown, { withToken = true } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withToken) headers.Cookie = 'yt_access_token=test-token'
  return new NextRequest('http://localhost:3000/api/youtube/channels', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers,
  })
}

describe('/api/youtube/channels', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSelectedChannels.mockResolvedValue([])
    mockSetSelectedChannels.mockResolvedValue(undefined)
    mockSetCachedData.mockResolvedValue(undefined)
    mockVerifyAccessToken.mockResolvedValue(true)
  })

  describe('GET', () => {
    it('returns the stored selection', async () => {
      mockGetSelectedChannels.mockResolvedValue([{ id: UC1, title: 'Channel One' }])

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ channels: [{ id: UC1, title: 'Channel One' }] })
    })

    it('returns 500 when the store throws', async () => {
      mockGetSelectedChannels.mockRejectedValue(new Error('redis down'))
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to read selected channels')

      consoleSpy.mockRestore()
    })
  })

  describe('PUT', () => {
    it('saves a valid selection and returns it', async () => {
      const channels = [
        { id: UC1, title: 'Channel One', thumbnail: THUMB },
        { id: UC2, title: 'Channel Two' },
      ]

      const response = await PUT(createPutRequest({ channels }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ channels })
      expect(mockVerifyAccessToken).toHaveBeenCalledWith('test-token')
      expect(mockSetSelectedChannels).toHaveBeenCalledWith(channels)
      expect(mockSetCachedData).toHaveBeenCalledWith('all-news', [], 1)
    })

    it('rejects writes without the YouTube access token cookie', async () => {
      const response = await PUT(
        createPutRequest({ channels: [{ id: UC1, title: 'One' }] }, { withToken: false })
      )
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Not connected to YouTube')
      expect(mockVerifyAccessToken).not.toHaveBeenCalled()
      expect(mockSetSelectedChannels).not.toHaveBeenCalled()
    })

    it('rejects writes when the token fails Google verification', async () => {
      mockVerifyAccessToken.mockResolvedValue(false)

      const response = await PUT(createPutRequest({ channels: [{ id: UC1, title: 'One' }] }))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Sign in again')
      expect(mockSetSelectedChannels).not.toHaveBeenCalled()
    })

    it('fails closed (502) when Google verification is unreachable', async () => {
      mockVerifyAccessToken.mockRejectedValue(new GoogleApiError(502, 'tokeninfo down'))
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const response = await PUT(createPutRequest({ channels: [{ id: UC1, title: 'One' }] }))

      expect(response.status).toBe(502)
      expect(mockSetSelectedChannels).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('still saves when the all-news invalidation fails', async () => {
      mockSetCachedData.mockRejectedValue(new Error('redis down'))
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const response = await PUT(createPutRequest({ channels: [{ id: UC1, title: 'One' }] }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.channels).toEqual([{ id: UC1, title: 'One' }])

      consoleSpy.mockRestore()
    })

    it('strips unknown fields from channel entries', async () => {
      const response = await PUT(
        createPutRequest({
          channels: [{ id: UC1, title: 'One', extra: 'nope', thumbnail: THUMB }],
        })
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.channels).toEqual([{ id: UC1, title: 'One', thumbnail: THUMB }])
    })

    it('drops thumbnails that are not https Google avatar URLs', async () => {
      const response = await PUT(
        createPutRequest({
          channels: [{ id: UC1, title: 'One', thumbnail: 'https://evil.example.com/pixel.gif' }],
        })
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.channels).toEqual([{ id: UC1, title: 'One' }])
    })

    it('truncates oversized titles', async () => {
      const response = await PUT(
        createPutRequest({ channels: [{ id: UC1, title: 'x'.repeat(5000) }] })
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.channels[0].title).toHaveLength(200)
    })

    it('rejects ids that are not YouTube channel ids', async () => {
      const response = await PUT(
        createPutRequest({ channels: [{ id: 'not-a-channel', title: 'Bad' }] })
      )
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid channel entry')
      expect(mockSetSelectedChannels).not.toHaveBeenCalled()
    })

    it('rejects a body without a channels array', async () => {
      const response = await PUT(createPutRequest({ channels: 'nope' }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid body')
      expect(mockSetSelectedChannels).not.toHaveBeenCalled()
    })

    it('rejects malformed JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/youtube/channels', {
        method: 'PUT',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json', Cookie: 'yt_access_token=test-token' },
      })

      const response = await PUT(request)

      expect(response.status).toBe(400)
      expect(mockSetSelectedChannels).not.toHaveBeenCalled()
    })

    it('rejects entries with missing or non-string id/title', async () => {
      const response = await PUT(
        createPutRequest({ channels: [{ id: UC1, title: 'ok' }, { id: 123, title: 'bad' }] })
      )
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid channel entry')
      expect(mockSetSelectedChannels).not.toHaveBeenCalled()
    })

    it('rejects more than 200 channels', async () => {
      const channels = Array.from({ length: 201 }, (_, i) => ({
        id: `UC${String(i).padStart(22, '0')}`,
        title: `C${i}`,
      }))

      const response = await PUT(createPutRequest({ channels }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('maximum is 200')
      expect(mockSetSelectedChannels).not.toHaveBeenCalled()
    })

    it('accepts an empty selection (clears the list)', async () => {
      const response = await PUT(createPutRequest({ channels: [] }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ channels: [] })
      expect(mockSetSelectedChannels).toHaveBeenCalledWith([])
    })
  })
})
