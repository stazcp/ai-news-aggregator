import { Article } from '@/types'
import { resolveArticleHost } from '../clusterService'

/** Minimal article factory */
function makeArticle(overrides: Partial<Article> & { id: string; title: string }): Article {
  return {
    description: '',
    content: '',
    url: 'https://example.com/article',
    urlToImage: '',
    publishedAt: new Date().toISOString(),
    source: { name: 'Test Source', url: 'https://example.com' },
    category: 'general',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// resolveArticleHost
// ---------------------------------------------------------------------------
describe('resolveArticleHost', () => {
  it('uses source.url hostname when available', () => {
    const a = makeArticle({
      id: '1',
      title: 'Test',
      url: 'https://news.google.com/rss/articles/abc123',
      source: { name: 'BBC News', url: 'https://www.bbc.com/news/world' },
    })
    expect(resolveArticleHost(a)).toBe('bbc.com')
  })

  it('falls back to a.url when source.url is empty', () => {
    const a = makeArticle({
      id: '1',
      title: 'Test',
      url: 'https://www.reuters.com/world/article',
      source: { name: 'Reuters', url: '' },
    })
    expect(resolveArticleHost(a)).toBe('reuters.com')
  })

  it('strips www. prefix', () => {
    const a = makeArticle({
      id: '1',
      title: 'Test',
      url: 'https://www.cnn.com/article',
      source: { name: 'CNN', url: 'https://www.cnn.com' },
    })
    expect(resolveArticleHost(a)).toBe('cnn.com')
  })

  it('uses source.name fallback when host is news.google.com', () => {
    const a = makeArticle({
      id: '1',
      title: 'Test',
      url: 'https://news.google.com/rss/articles/abc123',
      source: { name: 'BBC News', url: 'https://news.google.com/rss/articles/abc123' },
    })
    expect(resolveArticleHost(a)).toBe('news.google.com:bbc news')
  })

  it('differentiates Google News articles from different publishers', () => {
    const a = makeArticle({
      id: '1',
      title: 'Breaking news event',
      url: 'https://news.google.com/rss/articles/abc',
      source: { name: 'Reuters', url: 'https://news.google.com/rss/articles/abc' },
    })
    const b = makeArticle({
      id: '2',
      title: 'Breaking news event',
      url: 'https://news.google.com/rss/articles/def',
      source: { name: 'AP News', url: 'https://news.google.com/rss/articles/def' },
    })

    const hostA = resolveArticleHost(a)
    const hostB = resolveArticleHost(b)

    // Different publishers should get different hosts
    expect(hostA).not.toBe(hostB)
    expect(hostA).toContain('reuters')
    expect(hostB).toContain('ap news')
  })

  it('Google News articles from same publisher get same host', () => {
    const a = makeArticle({
      id: '1',
      title: 'Article one',
      url: 'https://news.google.com/rss/articles/abc',
      source: { name: 'BBC News', url: 'https://news.google.com/rss/articles/abc' },
    })
    const b = makeArticle({
      id: '2',
      title: 'Article two',
      url: 'https://news.google.com/rss/articles/def',
      source: { name: 'BBC News', url: 'https://news.google.com/rss/articles/def' },
    })

    expect(resolveArticleHost(a)).toBe(resolveArticleHost(b))
  })

  it('returns empty string for invalid URLs', () => {
    const a = makeArticle({
      id: '1',
      title: 'Test',
      url: 'not-a-url',
      source: { name: 'Test', url: 'also-not-a-url' },
    })
    expect(resolveArticleHost(a)).toBe('')
  })

  it('normalizes host to lowercase', () => {
    const a = makeArticle({
      id: '1',
      title: 'Test',
      url: 'https://WWW.CNN.COM/article',
      source: { name: 'CNN', url: 'https://WWW.CNN.COM' },
    })
    expect(resolveArticleHost(a)).toBe('cnn.com')
  })
})

// ---------------------------------------------------------------------------
// Dedup + diversity cap integration tests
// These verify the two guards work correctly together for the Google News case
// ---------------------------------------------------------------------------
describe('dedup + diversity integration', () => {
  it('seenTitleByHost dedup keeps articles from different publishers with same headline', () => {
    // Simulate the dedup filter from enrichClusters
    const articles = [
      makeArticle({
        id: '1',
        title: 'Breaking: Major event happens',
        url: 'https://news.google.com/rss/articles/abc',
        source: { name: 'Reuters', url: 'https://news.google.com/rss/articles/abc' },
      }),
      makeArticle({
        id: '2',
        title: 'Breaking: Major event happens',
        url: 'https://news.google.com/rss/articles/def',
        source: { name: 'AP News', url: 'https://news.google.com/rss/articles/def' },
      }),
      makeArticle({
        id: '3',
        title: 'Breaking: Major event happens',
        url: 'https://news.google.com/rss/articles/ghi',
        source: { name: 'BBC News', url: 'https://news.google.com/rss/articles/ghi' },
      }),
    ]

    // Replicate the seenTitleByHost filter
    const seenTitleByHost = new Set<string>()
    const result = articles.filter((a) => {
      const host = resolveArticleHost(a)
      const k = `${host}|${(a.title || '').toLowerCase().trim()}`
      if (seenTitleByHost.has(k)) return false
      seenTitleByHost.add(k)
      return true
    })

    // All 3 should survive: different publishers despite same title
    expect(result).toHaveLength(3)
  })

  it('seenTitleByHost dedup removes same-publisher duplicates', () => {
    const articles = [
      makeArticle({
        id: '1',
        title: 'Breaking: Major event happens',
        url: 'https://news.google.com/rss/articles/abc',
        source: { name: 'Reuters', url: 'https://news.google.com/rss/articles/abc' },
      }),
      makeArticle({
        id: '2',
        title: 'Breaking: Major event happens',
        url: 'https://news.google.com/rss/articles/def',
        source: { name: 'Reuters', url: 'https://news.google.com/rss/articles/def' },
      }),
    ]

    const seenTitleByHost = new Set<string>()
    const result = articles.filter((a) => {
      const host = resolveArticleHost(a)
      const k = `${host}|${(a.title || '').toLowerCase().trim()}`
      if (seenTitleByHost.has(k)) return false
      seenTitleByHost.add(k)
      return true
    })

    // Same publisher + same title → deduped to 1
    expect(result).toHaveLength(1)
  })

  it('per-domain cap treats different Google News publishers independently', () => {
    const perDomainMax = 2
    const publishers = ['Reuters', 'AP News', 'BBC News']
    const articles = publishers.flatMap((name, pi) =>
      Array.from({ length: 3 }, (_, i) =>
        makeArticle({
          id: `${pi}-${i}`,
          title: `Article ${i} from ${name}`,
          url: `https://news.google.com/rss/articles/${pi}${i}`,
          source: { name, url: `https://news.google.com/rss/articles/${pi}${i}` },
        })
      )
    )

    // Replicate diversity cap
    const domainCounts = new Map<string, number>()
    const diverse: Article[] = []
    for (const a of articles) {
      const host = resolveArticleHost(a)
      const used = domainCounts.get(host) || 0
      if (used < perDomainMax) {
        domainCounts.set(host, used + 1)
        diverse.push(a)
      }
    }

    // 3 publishers × 2 max each = 6 articles
    expect(diverse).toHaveLength(6)
    // Verify each publisher has exactly 2
    for (const name of publishers) {
      const count = diverse.filter((a) => a.source.name === name).length
      expect(count).toBe(2)
    }
  })
})
