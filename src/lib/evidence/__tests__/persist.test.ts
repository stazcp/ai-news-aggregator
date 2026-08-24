import { chunkText, contentHash } from '../persist'
import { Article } from '@/types'

function makeArticle(url: string): Article {
  return {
    id: 'a1',
    title: 'Test Article',
    description: 'A description',
    url,
    urlToImage: '',
    publishedAt: new Date('2026-01-01').toISOString(),
    source: { name: 'Test', url: 'https://example.com' },
    category: 'World News',
  }
}

describe('contentHash', () => {
  it('is stable for the same URL and ignores surrounding whitespace', () => {
    expect(contentHash(makeArticle('https://example.com/a'))).toBe(
      contentHash(makeArticle('  https://example.com/a '))
    )
  })

  it('differs for different URLs', () => {
    expect(contentHash(makeArticle('https://example.com/a'))).not.toBe(
      contentHash(makeArticle('https://example.com/b'))
    )
  })
})

describe('chunkText', () => {
  it('returns empty for blank input', () => {
    expect(chunkText('   ')).toEqual([])
  })

  it('returns a single chunk for short text and normalizes whitespace', () => {
    expect(chunkText('hello\n\n  world')).toEqual(['hello world'])
  })

  it('splits long text into overlapping chunks that cover everything', () => {
    const text = 'x'.repeat(3000)
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.length <= 1200)).toBe(true)
    expect(chunks.reduce((n, c) => n + c.length, 0)).toBeGreaterThanOrEqual(3000)
  })
})
