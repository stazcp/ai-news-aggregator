import { generateTopStorySummaries } from '../homepageGenerator'
import { getCachedData, setCachedData } from '@/lib/cache'
import { summarizeArticle, summarizeCluster } from '@/lib/ai/groq'
import { getSummaryCacheKey, getClusterSummaryId } from '@/lib/ai/summaryCache'

jest.mock('@/lib/cache')
jest.mock('@/lib/ai/groq')

const mockGetCachedData = getCachedData as jest.MockedFunction<typeof getCachedData>
const mockSetCachedData = setCachedData as jest.MockedFunction<typeof setCachedData>
const mockSummarizeArticle = summarizeArticle as jest.MockedFunction<typeof summarizeArticle>
const mockSummarizeCluster = summarizeCluster as jest.MockedFunction<typeof summarizeCluster>

describe('generateTopStorySummaries', () => {
  const originalSummaryMode = process.env.NEXT_PUBLIC_SUMMARY_ON_DEMAND
  const originalCacheTtl = process.env.CACHE_TTL_SECONDS

  const storyClusters = [
    {
      clusterTitle: 'Chip export rules tighten',
      articleIds: ['a1', 'a2'],
      articles: [
        { id: 'a1', title: 'A1', url: 'https://example.com/a1' },
        { id: 'a2', title: 'A2', url: 'https://example.com/a2' },
      ],
      summary: 'Existing cluster summary',
    },
  ] as any

  const articles = [
    {
      id: 'article-1',
      title: 'Headline',
      content: 'Body copy',
      url: 'https://example.com/article-1',
    },
  ] as any

  beforeEach(() => {
    jest.resetAllMocks()
    process.env.CACHE_TTL_SECONDS = '3600'
    mockGetCachedData.mockResolvedValue(null)
    mockSetCachedData.mockResolvedValue()
    mockSummarizeArticle.mockResolvedValue('Article summary')
    mockSummarizeCluster.mockResolvedValue('Generated cluster summary')
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalSummaryMode === undefined) {
      delete process.env.NEXT_PUBLIC_SUMMARY_ON_DEMAND
    } else {
      process.env.NEXT_PUBLIC_SUMMARY_ON_DEMAND = originalSummaryMode
    }

    if (originalCacheTtl === undefined) {
      delete process.env.CACHE_TTL_SECONDS
    } else {
      process.env.CACHE_TTL_SECONDS = originalCacheTtl
    }
  })

  it('reuses an existing cluster summary instead of calling the summarizer again', async () => {
    process.env.NEXT_PUBLIC_SUMMARY_ON_DEMAND = 'true'

    await generateTopStorySummaries(storyClusters, articles)

    expect(mockSummarizeCluster).not.toHaveBeenCalled()
    expect(mockSetCachedData).toHaveBeenCalledWith(
      getSummaryCacheKey('cluster', getClusterSummaryId(storyClusters[0])),
      'Existing cluster summary',
      3600
    )
  })

  it('skips article summary prewarming when summaries are manual', async () => {
    process.env.NEXT_PUBLIC_SUMMARY_ON_DEMAND = 'true'

    await generateTopStorySummaries(storyClusters, articles)

    expect(mockSummarizeArticle).not.toHaveBeenCalled()
  })

  it('continues prewarming article summaries when automatic summaries are enabled', async () => {
    process.env.NEXT_PUBLIC_SUMMARY_ON_DEMAND = 'false'

    await generateTopStorySummaries(storyClusters, articles)

    expect(mockSummarizeArticle).toHaveBeenCalledWith('Body copy')
    expect(mockSetCachedData).toHaveBeenCalledWith(
      getSummaryCacheKey('article', 'article-1'),
      'Article summary',
      3600
    )
  })
})
