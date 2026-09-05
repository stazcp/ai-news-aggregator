jest.mock('../../../../lib/cache', () => ({
  getCachedData: jest.fn(),
  setCachedData: jest.fn(),
}))

jest.mock('../../../../lib/ai/groq', () => ({
  summarizeArticle: jest.fn(),
  summarizeCategoryDigest: jest.fn(),
  summarizeCluster: jest.fn(),
}))

jest.mock('../../../../lib/utils', () => ({
  getCacheTtl: jest.fn(() => 43200),
}))

// PROJECT_PAUSED defaults to true, so without this every request short-
// circuits with 410 and none of the route's logic is exercised.
jest.mock('../../../../lib/config/projectState', () => ({
  isProjectPaused: jest.fn(() => false),
}))

import { POST } from '../route'
import { getCachedData, setCachedData } from '../../../../lib/cache'
import {
  summarizeArticle,
  summarizeCategoryDigest,
  summarizeCluster,
} from '../../../../lib/ai/groq'
import { isProjectPaused } from '../../../../lib/config/projectState'

const mockGetCachedData = getCachedData as jest.MockedFunction<typeof getCachedData>
const mockSetCachedData = setCachedData as jest.MockedFunction<typeof setCachedData>
const mockSummarizeArticle = summarizeArticle as jest.MockedFunction<typeof summarizeArticle>
const mockSummarizeCategoryDigest = summarizeCategoryDigest as jest.MockedFunction<
  typeof summarizeCategoryDigest
>
const mockSummarizeCluster = summarizeCluster as jest.MockedFunction<typeof summarizeCluster>
const mockIsProjectPaused = isProjectPaused as jest.MockedFunction<typeof isProjectPaused>

describe('/api/summarize', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    // resetAllMocks wipes the factory implementation, so re-assert it here —
    // otherwise isProjectPaused() returns undefined and the suite passes only
    // because undefined happens to be falsy.
    mockIsProjectPaused.mockReturnValue(false)
    mockGetCachedData.mockResolvedValue(null)
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('reports an error instead of returning a placeholder as the summary', async () => {
    mockSummarizeCluster.mockResolvedValue('An error occurred while generating the cluster summary.')

    const request = new Request('http://localhost:3000/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articleId: 'cluster-1',
        content: [{ id: 'a1', title: 'Story' }],
        isCluster: true,
        clusterTitle: 'Story',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    // Returning the sentinel as `summary` printed "An error occurred while
    // generating the cluster summary." to readers as the story's summary.
    expect(response.status).toBe(502)
    expect(data.summary).toBeUndefined()
    expect(data.error).toBe('Summary unavailable')
    expect(mockSetCachedData).not.toHaveBeenCalled()
  })

  it('caches valid cluster summaries', async () => {
    mockSummarizeCluster.mockResolvedValue(
      'A cohesive multi-source summary with enough detail to be considered valid.'
    )

    const request = new Request('http://localhost:3000/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articleId: 'cluster-2',
        content: [{ id: 'a2', title: 'Story' }],
        isCluster: true,
        clusterTitle: 'Story',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary).toContain('cohesive multi-source summary')
    expect(mockSetCachedData).toHaveBeenCalledTimes(1)
  })

  it('re-serializes a cached digest that Redis parsed back into an object', async () => {
    // Category digests are stored as JSON text; Upstash parses on read, so the
    // cache hit arrives as an object. Passing it through failed the string
    // guard and turned a hit into a 502.
    const digest = { lede: 'Markets moved on rate expectations.', takeaways: ['One', 'Two'] }
    mockGetCachedData.mockResolvedValue(digest)

    const request = new Request('http://localhost:3000/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: 'cat-1', content: 'notes', purpose: 'category' }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(JSON.parse(data.summary)).toEqual(digest)
    expect(mockSummarizeCategoryDigest).not.toHaveBeenCalled()
  })

  it('returns cached summaries without regenerating', async () => {
    mockGetCachedData.mockResolvedValue('Cached summary')

    const request = new Request('http://localhost:3000/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articleId: 'article-1',
        content: 'Some article content',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary).toBe('Cached summary')
    expect(mockSummarizeArticle).not.toHaveBeenCalled()
    expect(mockSummarizeCategoryDigest).not.toHaveBeenCalled()
    expect(mockSummarizeCluster).not.toHaveBeenCalled()
    expect(mockSetCachedData).not.toHaveBeenCalled()
  })
})
