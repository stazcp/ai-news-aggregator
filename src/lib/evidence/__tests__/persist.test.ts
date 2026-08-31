import { articleBody, chunkText, contentHash, isSlimRawJson, slimRawJson } from '../persist'
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

  it('splits long text into overlapping chunks capped at 2 per article', () => {
    const text = Array.from({ length: 3000 }, (_, i) => 'abcdefghij'[i % 10]).join('')
    const chunks = chunkText(text)
    expect(chunks.length).toBe(2)
    expect(chunks.every((c) => c.length <= 1200)).toBe(true)
    // Second chunk starts 150 chars before the first one ends (the overlap)
    expect(chunks[1].slice(0, 150)).toBe(chunks[0].slice(-150))
  })

  it('caps very long text at 2 chunks (storage diet)', () => {
    expect(chunkText('x'.repeat(50_000)).length).toBe(2)
  })
})

describe('slimRawJson', () => {
  const full = {
    ...makeArticle('https://example.com/a'),
    content: 'full article text',
    summary: 'an old cached summary',
    imageWidth: 640,
    imageHeight: 480,
  }

  it('keeps only the slim contract keys', () => {
    const slim = JSON.parse(JSON.stringify(slimRawJson(full)))
    expect(slim).toEqual({
      id: 'a1',
      title: 'Test Article',
      url: 'https://example.com/a',
      urlToImage: '',
      imageWidth: 640,
      imageHeight: 480,
      publishedAt: new Date('2026-01-01').toISOString(),
      source: { name: 'Test', url: 'https://example.com' },
      category: 'World News',
    })
    expect(slim).not.toHaveProperty('description')
    expect(slim).not.toHaveProperty('content')
  })

  it('omits absent optional image dimensions after serialization', () => {
    const slim = JSON.parse(JSON.stringify(slimRawJson(makeArticle('https://example.com/a'))))
    expect(slim).not.toHaveProperty('imageWidth')
    expect(slim).not.toHaveProperty('imageHeight')
  })

  it('is idempotent: its own output round-trips as already slim', () => {
    expect(isSlimRawJson(JSON.parse(JSON.stringify(slimRawJson(full))))).toBe(true)
  })
})

describe('isSlimRawJson', () => {
  it('rejects raw_json still carrying body text keys', () => {
    expect(isSlimRawJson({ id: 'a1', content: 'text' })).toBe(false)
    expect(isSlimRawJson({ id: 'a1', description: 'text' })).toBe(false)
  })

  it('rejects extra keys nested in source', () => {
    expect(isSlimRawJson({ id: 'a1', source: { name: 'Test', url: 'u', feed: 'rss' } })).toBe(false)
  })

  it('accepts a subset of the slim keys', () => {
    expect(isSlimRawJson({ id: 'a1', title: 't', source: { name: 'Test' } })).toBe(true)
  })
})
