import {
  getCachedDbHomepage,
  getHomepageDataFromDb,
  mapTrendingTopics,
} from '../dbHomepage'
import { getSql } from '@/lib/evidence/db'
import { getCachedData, setCachedData } from '@/lib/cache'
import { buildCategorySummaryPayload, filterByTopic, topicForCategory } from '@/lib/utils'
import { getSummaryCacheKey } from '@/lib/ai/summaryCache'
import { TOPIC_KEYWORDS } from '@/lib/topics'
import { linkRelatedClusters } from '@/lib/clustering/textCluster'
import type { StoryCluster } from '@/types'

jest.mock('@/lib/evidence/db')
jest.mock('@/lib/cache')
jest.mock('@/lib/clustering/textCluster', () => ({
  ...jest.requireActual('@/lib/clustering/textCluster'),
  linkRelatedClusters: jest.fn((clusters: StoryCluster[]) => clusters.map((c) => ({ ...c }))),
}))

const mockGetSql = getSql as jest.MockedFunction<typeof getSql>
const mockLinkRelatedClusters = linkRelatedClusters as jest.MockedFunction<
  typeof linkRelatedClusters
>
const mockGetCachedData = getCachedData as jest.MockedFunction<typeof getCachedData>
const mockSetCachedData = setCachedData as jest.MockedFunction<typeof setCachedData>

const DIGEST_PAYLOAD_OPTIONS = {
  maxClusters: 4,
  maxArticlesPerCluster: 2,
  maxStandaloneArticles: 0,
}

const LONG_BODY = 'Chipmakers scramble as new export rules land. '.repeat(12).trim()

const TODAY_UTC = new Date().toISOString().slice(0, 10)
const YESTERDAY_UTC = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

let clusterRows: any[]
let memberRows: any[]
let unclusteredRows: any[]
let entityRows: any[]
let digestRows: any[]
let lastSeenRows: any[]

const mockSql = jest.fn((strings: TemplateStringsArray) => {
  const query = Array.isArray(strings) ? strings.join(' ') : String(strings)
  if (query.includes('max(last_seen_at)')) return Promise.resolve(lastSeenRows)
  if (query.includes('FROM story_clusters')) return Promise.resolve(clusterRows)
  if (query.includes('NOT EXISTS')) return Promise.resolve(unclusteredRows)
  if (query.includes('FROM cluster_articles ca')) return Promise.resolve(memberRows)
  if (query.includes('FROM article_entities')) return Promise.resolve(entityRows)
  if (query.includes('FROM category_digests')) return Promise.resolve(digestRows)
  return Promise.resolve([])
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CACHE_TTL_SECONDS = '3600'
  mockGetSql.mockReturnValue(mockSql as any)
  mockGetCachedData.mockResolvedValue(null)
  mockSetCachedData.mockResolvedValue()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})

  clusterRows = [
    {
      id: 'st-2',
      title: 'Chip export rules tighten',
      category: 'Technology',
      summary:
        'A persisted multi-sentence cluster summary that is comfortably long enough for the UI to render immediately without requesting a fresh one from Groq.',
      severity_level: 3,
      severity_label: 'Tech/Business',
      score: 9.5,
      image_urls: ['https://img.example/a.jpg', 'https://img.example/b.jpg'],
    },
    {
      id: 'st-1',
      title: 'Rate cut speculation grows',
      category: 'Business',
      summary: null,
      severity_level: null,
      severity_label: null,
      score: 3.1,
      image_urls: null,
    },
  ]

  memberRows = [
    {
      cluster_id: 'st-2',
      id: 'ev-1',
      title: 'Nvidia hit by new export rules',
      url: 'https://example.com/ev-1',
      source: 'the-verge',
      category: 'Technology',
      published_at: '2026-08-30T08:00:00.000Z',
      body: LONG_BODY,
      raw_json: {
        id: 'ev-1',
        title: 'Nvidia hit by new export rules',
        url: 'https://example.com/ev-1',
        urlToImage: 'https://img.example/a.jpg',
        imageWidth: 1200,
        imageHeight: 630,
        publishedAt: '2026-08-30T08:00:00.000Z',
        source: { name: 'The Verge', url: 'https://www.theverge.com' },
        category: 'Technology',
      },
    },
    {
      cluster_id: 'st-2',
      id: 'ev-2',
      title: 'Chip rules ripple through supply chain',
      url: 'https://example.com/ev-2',
      source: 'reuters',
      category: 'Technology',
      published_at: '2026-08-30T07:00:00.000Z',
      body: 'Short body.',
      raw_json: null,
    },
    {
      cluster_id: 'st-1',
      id: 'ev-3',
      title: 'Fed watchers eye cuts',
      url: 'https://example.com/ev-3',
      source: 'bbc-news',
      category: 'Business',
      published_at: '2026-08-30T06:00:00.000Z',
      body: 'Markets priced in a cut.',
      raw_json: {
        urlToImage: '',
        source: { name: 'BBC News', url: 'https://www.bbc.co.uk' },
      },
    },
  ]

  unclusteredRows = [
    {
      id: 'ev-9',
      title: 'Standalone science story',
      url: 'https://example.com/ev-9',
      source: 'ars-technica',
      category: 'Science',
      published_at: '2026-08-30T05:00:00.000Z',
      body: 'A standalone article body.',
      raw_json: {
        urlToImage: 'https://img.example/z.jpg',
        source: { name: 'Ars Technica', url: 'https://arstechnica.com' },
      },
    },
  ]

  entityRows = [
    { name: 'OpenAI', type: 'company', article_count: 7 },
    { name: 'Ukraine', type: 'geography', article_count: 5 },
    { name: 'Bitcoin', type: 'theme', article_count: 3 },
    { name: 'Quantum Widgets Inc', type: 'company', article_count: 2 },
  ]

  digestRows = []
  lastSeenRows = [{ last_updated: '2026-08-30T10:30:00.000Z' }]
})

afterEach(() => {
  jest.restoreAllMocks()
  delete process.env.CACHE_TTL_SECONDS
})

// clearAllMocks keeps implementations, so a test that makes sql reject would
// otherwise leak into the next one.
const originalSqlImpl = mockSql.getMockImplementation()
afterEach(() => {
  if (originalSqlImpl) mockSql.mockImplementation(originalSqlImpl)
})

describe('getHomepageDataFromDb', () => {
  it('returns stories in DB score order with stable ids, severity, score and imageUrls', async () => {
    const result = await getHomepageDataFromDb()

    expect(result).not.toBeNull()
    expect(result!.storyClusters.map((c) => c.id)).toEqual(['st-2', 'st-1'])

    const [top, second] = result!.storyClusters
    expect(top.clusterTitle).toBe('Chip export rules tighten')
    expect(top.articleIds).toEqual(['ev-1', 'ev-2'])
    expect(top.score).toBe(9.5)
    expect(top.severity).toEqual({ level: 3, label: 'Tech/Business' })
    expect(top.imageUrls).toEqual(['https://img.example/a.jpg', 'https://img.example/b.jpg'])

    expect(second.articleIds).toEqual(['ev-3'])
    expect(second.severity).toBeUndefined()
    expect(second.imageUrls).toBeUndefined()
    expect(result!.rateLimitMessage).toBeNull()
  })

  it('serves the related-cluster links the UI gates its coverage pills on', async () => {
    // linkRelatedClusters returns a NEW array instead of mutating; serving the
    // pre-link array silently drops related-coverage pills and the modal.
    mockLinkRelatedClusters.mockImplementationOnce((clusters) =>
      clusters.map((c, i) => ({ ...c, relatedClusterIds: i === 0 ? ['st-99'] : [] }))
    )

    const result = await getHomepageDataFromDb()

    expect(result!.storyClusters[0].relatedClusterIds).toEqual(['st-99'])
  })

  it('passes persisted cluster summaries through so the UI renders them without Groq', async () => {
    const result = await getHomepageDataFromDb()

    expect(result!.storyClusters[0].summary).toBe(clusterRows[0].summary)
    expect(result!.storyClusters[1].summary).toBeUndefined()
  })

  it('maps article rows from slim raw_json and body', async () => {
    const result = await getHomepageDataFromDb()
    const article = result!.storyClusters[0].articles![0]

    expect(article.id).toBe('ev-1')
    expect(article.url).toBe('https://example.com/ev-1')
    expect(article.publishedAt).toBe('2026-08-30T08:00:00.000Z')
    expect(article.urlToImage).toBe('https://img.example/a.jpg')
    expect(article.imageWidth).toBe(1200)
    expect(article.imageHeight).toBe(630)
    expect(article.source).toEqual({ name: 'The Verge', url: 'https://www.theverge.com' })
    expect(article.category).toBe('Technology')

    // Description is the first ~300 chars of body
    expect(article.description!.length).toBe(300)
    expect(article.description!.endsWith('...')).toBe(true)
    expect(LONG_BODY.startsWith(article.description!.slice(0, -3))).toBe(true)
  })

  it('falls back to articles.source when raw_json is missing', async () => {
    const result = await getHomepageDataFromDb()
    const article = result!.storyClusters[0].articles![1]

    expect(article.source).toEqual({ name: 'reuters', url: '' })
    expect(article.urlToImage).toBe('')
    expect(article.imageWidth).toBeUndefined()
    expect(article.description).toBe('Short body.')
  })

  it('returns unclustered recent articles alongside clusters', async () => {
    const result = await getHomepageDataFromDb()

    expect(result!.unclusteredArticles.map((a) => a.id)).toEqual(['ev-9'])
    expect(result!.unclusteredArticles[0].source.name).toBe('Ars Technica')
  })

  it('orders topics by trending entity article count, keeping the full taxonomy', async () => {
    const result = await getHomepageDataFromDb()

    expect(result!.topics.slice(0, 3)).toEqual(['Artificial Intelligence', 'World', 'Crypto'])
    expect([...result!.topics].sort()).toEqual(Object.keys(TOPIC_KEYWORDS).sort())
  })

  it('falls back to the predefined topic list when no entities exist', async () => {
    entityRows = []

    const result = await getHomepageDataFromDb()

    expect(result!.topics).toEqual(Object.keys(TOPIC_KEYWORDS))
  })

  it('uses max(last_seen_at) as lastUpdated', async () => {
    const result = await getHomepageDataFromDb()

    expect(result!.lastUpdated).toBe('2026-08-30T10:30:00.000Z')
  })

  it('returns null when the DB has no recent story clusters (UI renders clusters only)', async () => {
    clusterRows = []
    memberRows = []

    const result = await getHomepageDataFromDb()

    expect(result).toBeNull()
  })

  it('drops clusters whose members are missing', async () => {
    memberRows = memberRows.filter((row) => row.cluster_id !== 'st-1')

    const result = await getHomepageDataFromDb()

    expect(result!.storyClusters.map((c) => c.id)).toEqual(['st-2'])
  })
})

describe('category digest seeding', () => {
  const digest = { lede: 'Chips and money set the tone.', takeaways: ['Chips.', 'Money.'] }

  it("seeds the trending digest under the exact cache key CategorySummary's payload produces", async () => {
    digestRows = [{ category: 'trending', digest_date: TODAY_UTC, digest }]

    const result = await getHomepageDataFromDb()

    const payload = buildCategorySummaryPayload(
      "Today's top stories",
      result!.storyClusters,
      [],
      DIGEST_PAYLOAD_OPTIONS
    )
    expect(payload).not.toBeNull()
    expect(mockSetCachedData).toHaveBeenCalledWith(
      getSummaryCacheKey('category', payload!.id),
      JSON.stringify(digest),
      3600
    )
  })

  it("falls back to yesterday's digest when today's is missing", async () => {
    digestRows = [{ category: 'trending', digest_date: YESTERDAY_UTC, digest }]

    const result = await getHomepageDataFromDb()

    const payload = buildCategorySummaryPayload(
      "Today's top stories",
      result!.storyClusters,
      [],
      DIGEST_PAYLOAD_OPTIONS
    )
    expect(mockSetCachedData).toHaveBeenCalledWith(
      getSummaryCacheKey('category', payload!.id),
      JSON.stringify(digest),
      3600
    )
  })

  it("prefers today's digest over yesterday's for the same category", async () => {
    const stale = { lede: 'Old news.', takeaways: [] }
    digestRows = [
      { category: 'trending', digest_date: YESTERDAY_UTC, digest: stale },
      { category: 'trending', digest_date: TODAY_UTC, digest },
    ]

    await getHomepageDataFromDb()

    const stored = mockSetCachedData.mock.calls.map((call) => call[1])
    expect(stored).toContain(JSON.stringify(digest))
    expect(stored).not.toContain(JSON.stringify(stale))
  })

  it('seeds topic digests against the topic-filtered clusters the client will request', async () => {
    digestRows = [{ category: 'Technology', digest_date: TODAY_UTC, digest }]

    const result = await getHomepageDataFromDb()

    const clusters = filterByTopic(result!.storyClusters, [], 'Technology').clusters
    expect(clusters.map((c) => c.id)).toEqual(['st-2'])
    const payload = buildCategorySummaryPayload('Technology', clusters, [], DIGEST_PAYLOAD_OPTIONS)
    expect(mockSetCachedData).toHaveBeenCalledWith(
      getSummaryCacheKey('category', payload!.id),
      JSON.stringify(digest),
      3600
    )
  })
})

describe('mapTrendingTopics', () => {
  it('ranks entity-matched topics first but always returns the full taxonomy', () => {
    const topics = mapTrendingTopics(
      [
        { name: 'OpenAI', type: 'company', article_count: 2 },
        { name: 'Unmappable Thing', type: 'theme', article_count: 99 },
      ],
      1
    )
    expect(topics[0]).toBe('Artificial Intelligence')
    // Every taxonomy topic survives — the client hides the ones without
    // clusters, so dropping them here would delete working navigation.
    expect([...topics].sort()).toEqual(Object.keys(TOPIC_KEYWORDS).sort())
  })

  it('returns the full taxonomy when no entity matches any topic', () => {
    const topics = mapTrendingTopics([{ name: 'Zzz', type: 'theme', article_count: 5 }])
    expect([...topics].sort()).toEqual(Object.keys(TOPIC_KEYWORDS).sort())
  })
})

describe('topicForCategory', () => {
  it('maps feed categories onto the taxonomy topic the client requests', () => {
    // 'World News' is the largest DB category; the client's pill is 'World'.
    expect(topicForCategory('World News')).toBe('World')
    expect(topicForCategory('Environment')).toBe('Climate')
    expect(topicForCategory('US Politics')).toBe('US Politics')
    expect(topicForCategory('AI')).toBe('Artificial Intelligence')
    expect(topicForCategory('Nonsense Category')).toBeNull()
  })

  it('never returns a topic whose own filter would exclude the category', () => {
    // Round-trip invariant: seeding a digest under a topic whose filter drops
    // the category would describe a disjoint cluster set. 'Politics' is the
    // real-world offender — it is NOT included under the 'US Politics' pill.
    const categories = [
      'World News', 'US News', 'Sports', 'Business', 'Technology', 'Culture',
      'US Politics', 'Europe', 'Crypto', 'Politics', 'Finance', 'Science',
      'Health', 'Middle East', 'Africa', 'Analysis', 'Environment', 'AI',
    ]
    for (const category of categories) {
      const topic = topicForCategory(category)
      if (!topic) continue
      const cluster = {
        clusterTitle: 't',
        articleIds: ['a'],
        articles: [
          {
            id: 'a',
            title: 't',
            url: 'https://example.com/a',
            urlToImage: '',
            publishedAt: new Date().toISOString(),
            source: { name: 's', url: '' },
            category,
          },
        ],
      } as StoryCluster
      expect(filterByTopic([cluster], [], topic).clusters).toHaveLength(1)
    }
    expect(topicForCategory('Politics')).not.toBe('US Politics')
  })
})

describe('getCachedDbHomepage', () => {
  it('serves the memoized result without touching the DB', async () => {
    const memo = { storyClusters: [], unclusteredArticles: [], topics: [], lastUpdated: 'x' }
    mockGetCachedData.mockResolvedValueOnce(memo)

    const result = await getCachedDbHomepage()

    expect(result).toBe(memo)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('memoizes a fresh DB read for 5 minutes', async () => {
    const result = await getCachedDbHomepage()

    expect(result).not.toBeNull()
    expect(mockSetCachedData).toHaveBeenCalledWith('homepage-db-result', result, 300)
  })

  it('memoizes empty DB results as a sentinel and honors it on later reads', async () => {
    clusterRows = []
    memberRows = []

    const first = await getCachedDbHomepage()
    expect(first).toBeNull()
    expect(mockSetCachedData).toHaveBeenCalledWith('homepage-db-result', 'db-homepage-empty', 300)

    mockGetCachedData.mockResolvedValueOnce('db-homepage-empty')
    mockSql.mockClear()
    const second = await getCachedDbHomepage()
    expect(second).toBeNull()
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('serves the last known good snapshot when the DB read fails and no legacy cache exists', async () => {
    const snapshot = { storyClusters: [{ id: 'st-old' }], unclusteredArticles: [], topics: [], lastUpdated: 'x' }
    mockGetCachedData.mockImplementation(async (key: string) => {
      if (key === 'homepage-db-last-good') return snapshot
      return null
    })
    mockSql.mockRejectedValue(new Error('neon unreachable'))

    await expect(getCachedDbHomepage()).resolves.toBe(snapshot)
    // A failure must never be memoized as empty.
    expect(mockSetCachedData).not.toHaveBeenCalledWith('homepage-db-result', 'db-homepage-empty', 300)
  })

  it('rethrows so callers use the legacy cache only when it is actually fresher', async () => {
    mockGetCachedData.mockImplementation(async (key: string) => {
      if (key === 'homepage-result') return { lastUpdated: '2026-09-01T10:00:00.000Z' }
      if (key === 'homepage-db-last-good') return { lastUpdated: '2026-09-01T09:00:00.000Z' }
      return null
    })
    mockSql.mockRejectedValue(new Error('neon unreachable'))

    await expect(getCachedDbHomepage()).rejects.toThrow('neon unreachable')
  })

  it('serves the snapshot when it is fresher than the legacy cache', async () => {
    // The legacy cron snapshot lives 12h while ours refreshes hourly, so a
    // fixed preference either way serves stale data half the time.
    const snapshot = { lastUpdated: '2026-09-01T10:00:00.000Z' }
    mockGetCachedData.mockImplementation(async (key: string) => {
      if (key === 'homepage-result') return { lastUpdated: '2026-08-31T22:00:00.000Z' }
      if (key === 'homepage-db-last-good') return snapshot
      return null
    })
    mockSql.mockRejectedValue(new Error('neon unreachable'))

    await expect(getCachedDbHomepage()).resolves.toBe(snapshot)
  })

  it('rethrows when the DB fails and nothing cached exists', async () => {
    mockGetCachedData.mockResolvedValue(null)
    mockSql.mockRejectedValue(new Error('neon unreachable'))

    await expect(getCachedDbHomepage()).rejects.toThrow('neon unreachable')
  })

  it('refreshes the fallback snapshot at most hourly', async () => {
    // Marker present → the ~450KB snapshot is not rewritten on this memo miss.
    mockGetCachedData.mockImplementation(async (key: string) =>
      key === 'homepage-db-last-good-written' ? '1' : null
    )

    await getCachedDbHomepage()

    expect(mockSetCachedData).not.toHaveBeenCalledWith(
      'homepage-db-last-good',
      expect.anything(),
      expect.anything()
    )
  })
})
