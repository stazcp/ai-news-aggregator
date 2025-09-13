import { NextRequest } from 'next/server'
import { POST, GET } from '../route'

// Mock the cache functions
jest.mock('../../../../lib/cache', () => ({
  clearCache: jest.fn(),
  clearCacheByPattern: jest.fn().mockReturnValue(5),
  clearCacheAll: jest.fn().mockResolvedValue({ memory: 10, redis: 3 }),
}))

// Get the mocked functions for assertions
import { clearCache, clearCacheByPattern, clearCacheAll } from '../../../../lib/cache'
const mockClearCache = clearCache as jest.MockedFunction<typeof clearCache>
const mockClearCacheByPattern = clearCacheByPattern as jest.MockedFunction<
  typeof clearCacheByPattern
>
const mockClearCacheAll = clearCacheAll as jest.MockedFunction<typeof clearCacheAll>

// Helper to create NextRequest
function createRequest(body: any = {}, method = 'POST') {
  return new NextRequest('http://localhost:3000/api/clear-cache', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('/api/clear-cache', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetAllMocks()
    mockClearCache.mockClear()
    mockClearCacheByPattern.mockClear().mockReturnValue(5)
    mockClearCacheAll.mockClear().mockResolvedValue({ memory: 10, redis: 3 })
    // Reset environment variables
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('POST - Memory Cache Operations', () => {
    it('should clear memory cache with empty body', async () => {
      const request = createRequest({})
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Memory cache cleared successfully')
    })

    it('should clear cache by pattern', async () => {
      const request = createRequest({ pattern: 'news' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Cleared 5 cache entries matching pattern: news')
    })
  })

  describe('POST - Redis Cache Operations (No Redis Configured)', () => {
    it('should clear memory only when Redis not configured', async () => {
      // Don't set UPSTASH_REDIS_REST_URL
      delete process.env.UPSTASH_REDIS_REST_URL

      const request = createRequest({ all: true })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Cleared cache: 10 memory entries (Redis not configured)')
    })
  })

  describe('POST - Redis Cache Operations (Redis Configured)', () => {
    beforeEach(() => {
      // Set up Redis environment
      process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
    })

    it('should reject Redis clearing without token', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'secret-token'

      const request = createRequest({ all: true })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Token is required for Redis cache clearing.')
    })

    it('should reject Redis clearing with invalid token', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'correct-token'

      const request = createRequest({ all: true, token: 'wrong-token' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid token provided.')
    })

    it('should allow Redis clearing with correct token', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'secret-token'

      const request = createRequest({ all: true, token: 'secret-token' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Cleared cache: 10 memory entries, 3 Redis keys')
      expect(data.result).toEqual({ memory: 10, redis: 3 })
    })
  })

  describe('POST - Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/clear-cache', {
        method: 'POST',
        body: 'invalid-json',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Memory cache cleared successfully')
    })
  })

  describe('GET - Development Only', () => {
    it('should return help in development environment', async () => {
      process.env.NODE_ENV = 'development'

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Use POST to clear cache.')
      expect(data.options).toBeDefined()
      expect(data.note).toContain('Redis operations always require CACHE_CLEAR_TOKEN')
    })

    it('should reject GET in production environment', async () => {
      process.env.NODE_ENV = 'production'

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Not available in production')
    })
  })

  describe('Security Tests', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
    })

    it('should reject when CACHE_CLEAR_TOKEN is not set', async () => {
      delete process.env.CACHE_CLEAR_TOKEN

      const request = createRequest({ all: true, token: 'any-token' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe(
        'CACHE_CLEAR_TOKEN environment variable is not configured. Redis clearing is disabled for security.'
      )
    })

    it('should reject when CACHE_CLEAR_TOKEN is empty string', async () => {
      process.env.CACHE_CLEAR_TOKEN = ''

      const request = createRequest({ all: true, token: 'some-token' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe(
        'CACHE_CLEAR_TOKEN environment variable is not configured. Redis clearing is disabled for security.'
      )
    })

    it('should reject when CACHE_CLEAR_TOKEN is whitespace only', async () => {
      process.env.CACHE_CLEAR_TOKEN = '   '

      const request = createRequest({ all: true, token: 'some-token' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe(
        'CACHE_CLEAR_TOKEN environment variable is not configured. Redis clearing is disabled for security.'
      )
    })

    it('should reject when no token is provided in request', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'secret-token'

      const request = createRequest({ all: true })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Token is required for Redis cache clearing.')
    })

    it('should reject when token is empty string', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'secret-token'

      const request = createRequest({ all: true, token: '' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Token is required for Redis cache clearing.')
    })

    it('should reject when token is whitespace only', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'secret-token'

      const request = createRequest({ all: true, token: '   ' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Token is required for Redis cache clearing.')
    })

    it('should reject when token is null', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'secret-token'

      const request = createRequest({ all: true, token: null })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Token is required for Redis cache clearing.')
    })

    it('should reject when token is not a string', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'secret-token'

      const request = createRequest({ all: true, token: 123 })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Token is required for Redis cache clearing.')
    })

    it('should reject when token does not match env token', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'correct-secret'

      const request = createRequest({ all: true, token: 'wrong-secret' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Invalid token provided.')
    })

    it('should accept when token exactly matches env token', async () => {
      process.env.CACHE_CLEAR_TOKEN = 'exact-match-token'

      const request = createRequest({ all: true, token: 'exact-match-token' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Environment Variable Edge Cases', () => {
    it('should handle missing UPSTASH_REDIS_REST_URL gracefully', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL

      const request = createRequest({ all: true })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain('Redis not configured')
    })

    it('should handle empty UPSTASH_REDIS_REST_URL', async () => {
      process.env.UPSTASH_REDIS_REST_URL = ''

      const request = createRequest({ all: true })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain('Redis not configured')
    })
  })
})
