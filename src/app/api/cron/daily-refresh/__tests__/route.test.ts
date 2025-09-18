import { NextRequest } from 'next/server'
import { GET, POST } from '../route'

// Mock the background refresh function
jest.mock('../../../../../lib/homepage/backgroundRefresh', () => ({
  refreshCacheInBackground: jest.fn(),
}))

// Get the mocked function for assertions
import { refreshCacheInBackground } from '../../../../../lib/homepage/backgroundRefresh'
const mockRefreshCacheInBackground = refreshCacheInBackground as jest.MockedFunction<
  typeof refreshCacheInBackground
>

// Helper to create NextRequest with authorization header
function createRequest(authHeader?: string, method = 'GET') {
  const headers: Record<string, string> = {}
  if (authHeader) {
    headers.authorization = authHeader
  }

  return new NextRequest('http://localhost:3000/api/cron/daily-refresh', {
    method,
    headers,
  })
}

describe('/api/cron/daily-refresh', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetAllMocks()
    mockRefreshCacheInBackground.mockClear().mockResolvedValue()
    // Reset environment variables
    process.env = { ...originalEnv }

    // Mock console.log and console.error to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('GET - Authentication', () => {
    it('should accept request with correct CRON_SECRET', async () => {
      process.env.CRON_SECRET = 'my-secure-secret-token'

      const request = createRequest('Bearer my-secure-secret-token')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Daily cache refresh completed successfully')
      expect(mockRefreshCacheInBackground).toHaveBeenCalledTimes(1)
    })

    it('should reject request when CRON_SECRET is not configured', async () => {
      delete process.env.CRON_SECRET

      const request = createRequest('Bearer any-token')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('CRON_SECRET not configured - cron job cannot run securely')
      expect(mockRefreshCacheInBackground).not.toHaveBeenCalled()
    })

    it('should reject request with no authorization header', async () => {
      process.env.CRON_SECRET = 'test-secret'

      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized - invalid cron secret')
      expect(mockRefreshCacheInBackground).not.toHaveBeenCalled()
    })

    it('should reject request with empty authorization header', async () => {
      process.env.CRON_SECRET = 'test-secret'

      const request = createRequest('')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized - invalid cron secret')
      expect(mockRefreshCacheInBackground).not.toHaveBeenCalled()
    })

    it('should reject request with wrong CRON_SECRET', async () => {
      process.env.CRON_SECRET = 'correct-secret'

      const request = createRequest('Bearer wrong-secret')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized - invalid cron secret')
      expect(mockRefreshCacheInBackground).not.toHaveBeenCalled()
    })

    it('should reject request with non-Bearer authorization', async () => {
      process.env.CRON_SECRET = 'test-secret'

      const request = createRequest('Basic dXNlcjpwYXNz')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized - invalid cron secret')
      expect(mockRefreshCacheInBackground).not.toHaveBeenCalled()
    })

    it('should reject arbitrary Bearer tokens', async () => {
      process.env.CRON_SECRET = 'secure-token'

      const request = createRequest('Bearer arbitrary-attacker-token')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized - invalid cron secret')
      expect(mockRefreshCacheInBackground).not.toHaveBeenCalled()
    })
  })

  describe('GET - Cache Refresh Execution', () => {
    beforeEach(() => {
      // Set up valid auth for these tests
      process.env.CRON_SECRET = 'test-secret'
    })

    it('should execute cache refresh successfully', async () => {
      const request = createRequest('Bearer test-secret')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Daily cache refresh completed successfully')
      expect(data.duration).toMatch(/^\d+ms$/)
      expect(data.timestamp).toBeDefined()
      expect(new Date(data.timestamp)).toBeInstanceOf(Date)
      expect(mockRefreshCacheInBackground).toHaveBeenCalledTimes(1)
    })

    it('should handle cache refresh failure gracefully', async () => {
      const error = new Error('Redis connection failed')
      mockRefreshCacheInBackground.mockRejectedValueOnce(error)

      const request = createRequest('Bearer test-secret')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Redis connection failed')
      expect(data.duration).toMatch(/^\d+ms$/)
      expect(data.timestamp).toBeDefined()
      expect(mockRefreshCacheInBackground).toHaveBeenCalledTimes(1)
    })

    it('should handle unknown error types', async () => {
      mockRefreshCacheInBackground.mockRejectedValueOnce('String error')

      const request = createRequest('Bearer test-secret')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unknown error occurred')
      expect(mockRefreshCacheInBackground).toHaveBeenCalledTimes(1)
    })

    it('should measure execution duration accurately', async () => {
      // Mock a slow operation
      mockRefreshCacheInBackground.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      const request = createRequest('Bearer test-secret')
      const startTime = Date.now()
      const response = await GET(request)
      const endTime = Date.now()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)

      // Extract duration number from "123ms" format
      const durationMs = parseInt(data.duration.replace('ms', ''))
      expect(durationMs).toBeGreaterThanOrEqual(100)
      expect(durationMs).toBeLessThan(endTime - startTime + 50) // Allow some margin
    })
  })

  describe('POST - Proxy to GET', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'test-secret'
    })

    it('should proxy POST requests to GET handler', async () => {
      const request = createRequest('Bearer test-secret', 'POST')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Daily cache refresh completed successfully')
      expect(mockRefreshCacheInBackground).toHaveBeenCalledTimes(1)
    })

    it('should handle POST authentication failures', async () => {
      const request = createRequest(undefined, 'POST')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(mockRefreshCacheInBackground).not.toHaveBeenCalled()
    })
  })

  describe('Response Format', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'test-secret'
    })

    it('should return consistent success response format', async () => {
      const request = createRequest('Bearer test-secret')
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('message', 'Daily cache refresh completed successfully')
      expect(data).toHaveProperty('duration')
      expect(data).toHaveProperty('timestamp')
      expect(data.duration).toMatch(/^\d+ms$/)
      expect(new Date(data.timestamp).getTime()).toBeGreaterThan(Date.now() - 5000)
    })

    it('should return consistent error response format', async () => {
      const request = createRequest()
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error', 'Unauthorized - invalid cron secret')
      expect(data).toHaveProperty('timestamp')
      expect(new Date(data.timestamp).getTime()).toBeGreaterThan(Date.now() - 5000)
    })

    it('should return consistent failure response format', async () => {
      mockRefreshCacheInBackground.mockRejectedValueOnce(new Error('Test error'))

      const request = createRequest('Bearer test-secret')
      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error', 'Test error')
      expect(data).toHaveProperty('duration')
      expect(data).toHaveProperty('timestamp')
      expect(data.duration).toMatch(/^\d+ms$/)
    })
  })

  describe('Logging', () => {
    let consoleSpy: jest.SpyInstance

    beforeEach(() => {
      process.env.CRON_SECRET = 'test-secret'
      // Restore console mocks for these specific tests
      jest.restoreAllMocks()
      consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('should log cron job trigger', async () => {
      const request = createRequest('Bearer test-secret')
      await GET(request)

      expect(consoleSpy).toHaveBeenCalledWith('📅 Daily cron job triggered')
    })

    it('should log authorization success for valid CRON_SECRET', async () => {
      const request = createRequest('Bearer test-secret')
      await GET(request)

      expect(consoleSpy).toHaveBeenCalledWith('✅ Cron request authorized with valid CRON_SECRET')
    })

    it('should log configuration error when CRON_SECRET missing', async () => {
      // Mock console.error instead of console.log for this test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      delete process.env.CRON_SECRET
      const request = createRequest('Bearer any-token')
      await GET(request)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ CRON_SECRET environment variable not configured'
      )

      consoleErrorSpy.mockRestore()
    })
  })
})
