import { articleBody, chunkText, contentHash } from '../persist'
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

describe('articleBody', () => {
  it('keeps the full content when the description is its lead paragraph', () => {
    const article = makeArticle('https://example.com/a')
    article.description = 'short desc'
    article.content = 'short desc plus much longer full article text'
    expect(articleBody(article)).toBe('short desc plus much longer full article text')
  })

  it('keeps both parts when neither contains the other', () => {
    const article = makeArticle('https://example.com/a')
    article.description = 'summary text'
    article.content = 'different full text'
    expect(articleBody(article)).toBe('summary text\n\ndifferent full text')
  })

  it('collapses identical description and content', () => {
    const article = makeArticle('https://example.com/a')
    article.description = 'same text'
    article.content = 'same text'
    expect(articleBody(article)).toBe('same text')
  })

  it('falls back to the title when there is no body text', () => {
    const article = makeArticle('https://example.com/a')
    article.description = undefined
    expect(articleBody(article)).toBe('Test Article')
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
