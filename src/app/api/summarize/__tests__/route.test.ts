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

import { POST } from '../route'
import { getCachedData, setCachedData } from '../../../../lib/cache'
import {
  summarizeArticle,
  summarizeCategoryDigest,
  summarizeCluster,
} from '../../../../lib/ai/groq'

const mockGetCachedData = getCachedData as jest.MockedFunction<typeof getCachedData>
const mockSetCachedData = setCachedData as jest.MockedFunction<typeof setCachedData>
const mockSummarizeArticle = summarizeArticle as jest.MockedFunction<typeof summarizeArticle>
const mockSummarizeCategoryDigest = summarizeCategoryDigest as jest.MockedFunction<
  typeof summarizeCategoryDigest
>
const mockSummarizeCluster = summarizeCluster as jest.MockedFunction<typeof summarizeCluster>

describe('/api/summarize', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetCachedData.mockResolvedValue(null)
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not cache non-cacheable cluster summary placeholders', async () => {
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

    expect(response.status).toBe(200)
    expect(data.summary).toBe('An error occurred while generating the cluster summary.')
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
