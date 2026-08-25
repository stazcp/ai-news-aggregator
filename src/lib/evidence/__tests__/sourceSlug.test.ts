import { sourceSlug } from '../sourceSlug'

describe('sourceSlug', () => {
  describe('URL-based derivation (primary)', () => {
    it('uses the registrable domain main label', () => {
      expect(sourceSlug('Fortune | FORTUNE', ['https://fortune.com/article'])).toBe('fortune')
      expect(sourceSlug('Raw Story', ['https://www.rawstory.com/x'])).toBe('rawstory')
      expect(sourceSlug('The Hill News', ['https://thehill.com/blogs/x'])).toBe('thehill')
    })

    it('strips www/feeds/rss subdomains', () => {
      expect(sourceSlug('NYT > World News', ['https://rss.nytimes.com/services/xml/rss/nyt/World.xml'])).toBe('nyt')
      expect(sourceSlug('Business Insider', ['https://feeds.businessinsider.com/x'])).toBe('businessinsider')
      expect(sourceSlug('CBS News', ['https://www.cbsnews.com/'])).toBe('cbsnews')
    })

    it('handles two-part public suffixes like co.uk and net.au', () => {
      expect(sourceSlug('BBC', ['https://feeds.bbci.co.uk/news/world/rss.xml'])).toBe('bbc')
      expect(sourceSlug('The Independent', ['https://www.independent.co.uk/news'])).toBe('independent')
      expect(sourceSlug('ABC News (AU)', ['https://www.abc.net.au/news/feed'])).toBe('abc')
    })

    it('maps well-known outlets through the curated override table', () => {
      expect(sourceSlug('NYT > Business', ['https://www.nytimes.com/x'])).toBe('nyt')
      expect(sourceSlug('The Washington Post', ['https://www.washingtonpost.com/x'])).toBe('wapo')
      expect(sourceSlug('AP News', ['https://apnews.com/x'])).toBe('ap')
      expect(sourceSlug('Technology | The Guardian', ['https://www.theguardian.com/x'])).toBe('guardian')
    })

    it('uses exact-hostname overrides for subdomain-hosted outlets', () => {
      expect(sourceSlug('Hacker News: Front Page', ['https://news.ycombinator.com/rss'])).toBe('hacker-news')
      expect(sourceSlug('Times of India', ['https://timesofindia.indiatimes.com/rss'])).toBe('timesofindia')
    })

    it('falls back to the name for aggregator hosts like news.google.com', () => {
      expect(sourceSlug('Reuters', ['https://news.google.com/rss/articles/abc?oc=5'])).toBe('reuters')
      expect(sourceSlug('The New York Times', ['https://news.google.com/?hl=en-US'])).toBe('nyt')
      expect(sourceSlug('WSJ', ['https://news.google.com/'])).toBe('wsj')
      expect(sourceSlug('Fox News', ['https://news.google.com/'])).toBe('foxnews')
    })

    it('falls back to the name for unparseable URLs', () => {
      expect(sourceSlug('Financial Times', ['not a url'])).toBe('ft')
    })
  })

  describe('name-based fallback', () => {
    it('handles the messy real feed titles', () => {
      expect(sourceSlug('Fortune | FORTUNE')).toBe('fortune')
      expect(
        sourceSlug('India Latest News: Top National Headlines Today & Breaking News | The Hindu')
      ).toBe('thehindu')
      expect(sourceSlug('World - CBSNews.com')).toBe('cbsnews')
    })

    it('treats a domain-like token in the name as a hostname', () => {
      expect(sourceSlug('CNN.com - RSS Channel - Politics')).toBe('cnn')
      expect(sourceSlug('www.espn.com - TOP')).toBe('espn')
      expect(sourceSlug('Snopes.com')).toBe('snopes')
    })

    it('picks the outlet segment over generic section names', () => {
      expect(sourceSlug('CBC | Canada News')).toBe('cbc')
      expect(sourceSlug('ABC News: Top Stories')).toBe('abcnews')
      expect(sourceSlug('NYT > World News')).toBe('nyt')
      expect(sourceSlug('Al Jazeera – Breaking News, World News and Video from Al Jazeera')).toBe(
        'aljazeera'
      )
    })

    it('kebab-cases multi-word names and strips diacritics', () => {
      expect(sourceSlug('Mexico News Daily')).toBe('mexico-news-daily')
      expect(sourceSlug('Süddeutsche Zeitung')).toBe('suddeutsche-zeitung')
    })
  })

  describe('totality and determinism', () => {
    it('never returns an empty slug', () => {
      expect(sourceSlug('')).toBe('unknown')
      expect(sourceSlug('   ')).toBe('unknown')
      expect(sourceSlug('|||')).toBe('unknown')
      expect(sourceSlug('', ['https://news.google.com/'])).toBe('unknown')
    })

    it('is deterministic', () => {
      const inputs: [string, string[]][] = [
        ['Fortune | FORTUNE', ['https://fortune.com/x']],
        ['World - CBSNews.com', []],
        ['Reuters', ['https://news.google.com/']],
      ]
      for (const [name, urls] of inputs) {
        expect(sourceSlug(name, urls)).toBe(sourceSlug(name, urls))
      }
    })

    it('falls through a useless first URL to the publisher article URL', () => {
      // Business Insider's feed carries a malformed source URL; the article
      // URL is the real signal (live-DB regression: split into two slugs).
      expect(
        sourceSlug('All Content from Business Insider', [
          'https://feeds.businessinsider.com, feeds.businessinsider.com/pull/bi/all?xyz',
          'https://www.businessinsider.com/some-story-2026-8',
        ])
      ).toBe('businessinsider')
      expect(
        sourceSlug('Breitbart News', [
          'https://feeds.feedburner.com/breitbart',
          'https://www.breitbart.com/politics/2026/08/24/story/',
        ])
      ).toBe('breitbart')
    })

    it('handles unlisted two-part suffixes and hosting domains', () => {
      expect(sourceSlug('Haaretz', ['https://www.haaretz.co.il/news'])).toBe('haaretz')
      expect(sourceSlug('El Universal', ['https://www.eluniversal.com.mx/x'])).toBe('eluniversal')
      expect(sourceSlug('NHK', ['https://www3.nhk.or.jp/news/'])).toBe('nhk')
      expect(sourceSlug('ABC News', ['https://abcnews.go.com/Politics/story'])).toBe('abcnews')
    })

    it('ignores IP-address hosts and falls back to the name', () => {
      expect(sourceSlug('Financial Times', ['https://192.168.0.1/feed'])).toBe('ft')
    })

    it('keeps URL-label and name-form slugs consistent for aliased outlets', () => {
      expect(sourceSlug('Sky News', ['https://feeds.skynews.com/feeds/rss/world.xml'])).toBe('sky')
      expect(sourceSlug('WSJ', ['https://feeds.a.dj.com/rss/RSSWorldNews.xml'])).toBe('wsj')
    })

    it('preserves non-Latin outlet names instead of collapsing to unknown', () => {
      expect(sourceSlug('朝日新聞')).toBe('朝日新聞')
      expect(sourceSlug('朝日新聞')).not.toBe(sourceSlug('日経新聞'))
    })

    it('produces the same slug for direct-feed and Google News variants of an outlet', () => {
      expect(sourceSlug('Latest & Breaking News on Fox News', ['https://www.foxnews.com/x'])).toBe(
        sourceSlug('Fox News', ['https://news.google.com/'])
      )
      expect(sourceSlug('BBC News', ['https://www.bbc.co.uk/news/x'])).toBe(
        sourceSlug('BBC', ['https://news.google.com/'])
      )
    })
  })
})
