import { computeSeverity, isAmbiguousCategory, scoreCluster } from '../severity'
import { StoryCluster } from '@/types'

function makeCluster(
  category: string | undefined,
  count = 3
): StoryCluster {
  return {
    clusterTitle: 'Test Cluster',
    articleIds: Array.from({ length: count }, (_, i) => `a${i}`),
    articles: Array.from({ length: count }, (_, i) => ({
      id: `a${i}`,
      title: `Article ${i}`,
      description: '',
      content: '',
      url: `https://example.com/${i}`,
      urlToImage: '',
      publishedAt: new Date().toISOString(),
      source: { name: 'Test', url: 'https://example.com' },
      category,
    })),
  }
}

describe('computeSeverity — category-based', () => {
  it('Sports → Other (level 0), not ambiguous', () => {
    const result = computeSeverity(makeCluster('Sports'))
    expect(result.label).toBe('Other')
    expect(result.level).toBe(0)
    expect(result.ambiguous).toBe(false)
  })

  it('Technology → Tech/Business (level 1), not ambiguous', () => {
    const result = computeSeverity(makeCluster('Technology'))
    expect(result.label).toBe('Tech/Business')
    expect(result.level).toBe(1)
    expect(result.ambiguous).toBe(false)
  })

  it('Business → Economy/Markets (level 2), not ambiguous', () => {
    const result = computeSeverity(makeCluster('Business'))
    expect(result.label).toBe('Economy/Markets')
    expect(result.level).toBe(2)
    expect(result.ambiguous).toBe(false)
  })

  it('Politics → National Politics (level 3), not ambiguous', () => {
    const result = computeSeverity(makeCluster('Politics'))
    expect(result.label).toBe('National Politics')
    expect(result.level).toBe(3)
    expect(result.ambiguous).toBe(false)
  })

  it('World News → ambiguous (needs LLM)', () => {
    const result = computeSeverity(makeCluster('World News'))
    expect(result.ambiguous).toBe(true)
    expect(result.level).toBe(0)
  })

  it('Middle East → ambiguous', () => {
    const result = computeSeverity(makeCluster('Middle East'))
    expect(result.ambiguous).toBe(true)
  })

  it('unknown category → ambiguous', () => {
    const result = computeSeverity(makeCluster('RandomUnknownCategory'))
    expect(result.ambiguous).toBe(true)
  })

  it('no category → ambiguous', () => {
    const result = computeSeverity(makeCluster(undefined))
    expect(result.ambiguous).toBe(true)
  })

  it('dominant category wins when articles have mixed categories', () => {
    const cluster: StoryCluster = {
      clusterTitle: 'Mixed',
      articleIds: ['a', 'b', 'c', 'd', 'e'],
      articles: [
        { id: 'a', title: '', description: '', content: '', url: 'https://x.com', urlToImage: '', publishedAt: '', source: { name: 'X', url: '' }, category: 'Politics' },
        { id: 'b', title: '', description: '', content: '', url: 'https://x.com', urlToImage: '', publishedAt: '', source: { name: 'X', url: '' }, category: 'Politics' },
        { id: 'c', title: '', description: '', content: '', url: 'https://x.com', urlToImage: '', publishedAt: '', source: { name: 'X', url: '' }, category: 'Politics' },
        { id: 'd', title: '', description: '', content: '', url: 'https://x.com', urlToImage: '', publishedAt: '', source: { name: 'X', url: '' }, category: 'Sports' },
        { id: 'e', title: '', description: '', content: '', url: 'https://x.com', urlToImage: '', publishedAt: '', source: { name: 'X', url: '' }, category: 'Sports' },
      ],
    }
    const result = computeSeverity(cluster)
    expect(result.label).toBe('National Politics')
    expect(result.ambiguous).toBe(false)
  })
})

describe('isAmbiguousCategory', () => {
  it('returns true for World News clusters', () => {
    expect(isAmbiguousCategory(makeCluster('World News'))).toBe(true)
  })

  it('returns false for Politics clusters', () => {
    expect(isAmbiguousCategory(makeCluster('Politics'))).toBe(false)
  })
})

describe('scoreCluster', () => {
  it('war cluster beats same-size other cluster when both are fresh', () => {
    const recentIso = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 min ago
    const makeRecent = (category: string, label: string, level: number) => ({
      ...makeCluster(category),
      articles: Array.from({ length: 3 }, (_, i) => ({
        id: `x${i}`, title: `Article ${i}`, description: '', content: '',
        url: `https://example.com/${i}`, urlToImage: '', publishedAt: recentIso,
        source: { name: 'Test', url: 'https://example.com' }, category,
      })),
      severity: { level, label, reasons: [] as string[] },
    })
    const warCluster = makeRecent('World News', 'War/Conflict', 5)
    const otherCluster = makeRecent('Sports', 'Other', 0)
    expect(scoreCluster(warCluster)).toBeGreaterThan(scoreCluster(otherCluster))
  })

  it('fresh story with many sources beats stale war story', () => {
    const recentIso = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()  // 1h ago
    const staleIso = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()  // 30h ago

    const staleWar = {
      clusterTitle: 'Old War',
      articleIds: ['w1', 'w2', 'w3'],
      severity: { level: 5, label: 'War/Conflict', reasons: [] },
      articles: Array.from({ length: 3 }, (_, i) => ({
        id: `w${i}`, title: `War article ${i}`, description: '', content: '',
        url: `https://example.com/w${i}`, urlToImage: '', publishedAt: staleIso,
        source: { name: 'Test', url: 'https://example.com' }, category: 'World News',
      })),
    }
    const freshPolitics = {
      clusterTitle: 'Breaking News',
      articleIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      severity: { level: 3, label: 'National Politics', reasons: [] },
      articles: Array.from({ length: 6 }, (_, i) => ({
        id: `p${i}`, title: `Politics article ${i}`, description: '', content: '',
        url: `https://example.com/p${i}`, urlToImage: '', publishedAt: recentIso,
        source: { name: 'Test', url: 'https://example.com' }, category: 'Politics',
      })),
    }
    expect(scoreCluster(freshPolitics)).toBeGreaterThan(scoreCluster(staleWar))
  })

  it('returns a number', () => {
    const c = makeCluster('Technology')
    expect(typeof scoreCluster(c)).toBe('number')
  })
})
