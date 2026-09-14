import {
  articleBody,
  chunkText,
  contentHash,
  isSlimRawJson,
  sanitizeArticleText,
  slimRawJson,
  stripLoneSurrogates,
} from '../persist'
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
    // Non-repeating fixture: every 150-char window is unique, so an overlap
    // regression at ANY offset fails the absolute-position assertions below
    // (a periodic fixture let step-size bugs pass silently).
    const text = Array.from({ length: 3000 }, (_, i) =>
      String.fromCharCode(0x30a0 + (i % 90), 0x61 + (Math.floor(i / 90) % 26))
    )
      .join('')
      .slice(0, 3000)
    const chunks = chunkText(text)
    expect(chunks.length).toBe(2)
    expect(chunks.every((c) => c.length <= 1200)).toBe(true)
    // Chunk 0 covers [0, 1200); chunk 1 starts at 1200 - 150 = 1050.
    expect(chunks[0]).toBe(text.slice(0, 1200))
    expect(chunks[1]).toBe(text.slice(1050, 2250))
    expect(chunks[1].slice(0, 150)).toBe(chunks[0].slice(-150))
  })

  it('caps very long text at 2 chunks (storage diet)', () => {
    expect(chunkText('x'.repeat(50_000)).length).toBe(2)
  })

  // A lone surrogate JSON-encodes to an invalid escape, and the Neon HTTP
  // driver sends params as JSON — so one emoji on a chunk boundary failed the
  // INSERT, and because backfill re-selects zero-chunk articles forever, the
  // same row killed every scheduled run for three days (article ev-48138).
  const hasLoneSurrogate = (s: string) =>
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s)

  it('never splits a surrogate pair across a chunk boundary', () => {
    // Place 🚀 (U+1F680) so its two code units straddle offset 1200 exactly.
    const text = 'a'.repeat(1199) + '🚀' + 'b'.repeat(2000)
    const chunks = chunkText(text)

    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(hasLoneSurrogate(c)).toBe(false)
  })

  it('produces chunks that survive JSON encoding', () => {
    // The actual failure mode: JSON.parse of the encoded params threw
    // "unexpected end of hex escape" inside Neon rather than in our process.
    const text = 'a'.repeat(1199) + '🚀' + 'b'.repeat(2000)
    const chunks = chunkText(text)

    expect(() => JSON.parse(JSON.stringify(chunks))).not.toThrow()
    expect(JSON.parse(JSON.stringify(chunks))).toEqual(chunks)
  })

  it('drops surrogates the feed itself delivered unpaired', () => {
    // Not from our slicing — some feeds emit a half-character directly.
    const chunks = chunkText('before \uD83D after')
    expect(chunks).toEqual(['before after'])
  })

  it('keeps whole emoji that do not land on a boundary', () => {
    expect(chunkText('launch 🚀 today')).toEqual(['launch 🚀 today'])
  })
})

describe('stripLoneSurrogates', () => {
  // persistArticles sends title and body as bare text params BEFORE chunkText
  // ever runs, so a lone surrogate arriving from a feed kills the INSERT one
  // step earlier than the bug this PR started from. rss-parser decodes numeric
  // character references without validating pairing, and `&#55357;&#56898;` is
  // how WordPress-family feeds emit an emoji — half of one is enough.
  it('removes an unpaired high surrogate', () => {
    expect(stripLoneSurrogates('Rocket \uD83D launch')).toBe('Rocket  launch')
  })

  it('removes an unpaired low surrogate', () => {
    expect(stripLoneSurrogates('Rocket \uDE80 launch')).toBe('Rocket  launch')
  })

  it('preserves valid pairs', () => {
    expect(stripLoneSurrogates('Rocket 🚀 launch')).toBe('Rocket 🚀 launch')
    expect(stripLoneSurrogates('🚀🎉👍')).toBe('🚀🎉👍')
  })

  it('leaves ordinary text untouched', () => {
    expect(stripLoneSurrogates('plain ascii, ünïcödé, 日本語')).toBe('plain ascii, ünïcödé, 日本語')
  })

  it('produces output that survives JSON encoding', () => {
    const dirty = 'Rocket \uD83D launch'
    expect(JSON.stringify(dirty)).toContain('\\ud83d')
    expect(JSON.stringify(stripLoneSurrogates(dirty))).not.toContain('\\ud83d')
  })

  it('makes raw_json survive the ::jsonb cast, not just the Neon wire', () => {
    // Two distinct rejections. JSON.stringify escapes a lone surrogate to the
    // ASCII text \ud83d, so the param passes Neon's HTTP body parser and is
    // then rejected by Postgres with "invalid input syntax for type json"
    // (PG 8.14.1: json tolerates such escapes, jsonb does not). Verified
    // against the live database — the earlier assumption that raw_json was
    // inherently safe was wrong.
    const dirty = makeArticle('https://example.com/a')
    dirty.title = 'Rocket \uD83D launch'

    const before = JSON.stringify(slimRawJson(dirty))
    expect(before).toContain('\\ud83d') // would reach Postgres and be rejected

    const after = JSON.stringify(slimRawJson(sanitizeArticleText(dirty)))
    expect(after).not.toContain('\\ud83d')
    expect(JSON.parse(after).title).toBe('Rocket  launch')
  })

  it('sanitizes every field raw_json carries, not just the title', () => {
    const a = makeArticle('https://example.com/a')
    a.title = `t\uD83D`
    a.urlToImage = `i\uD83D`
    a.category = `c\uD83D`
    a.source = { name: `n\uD83D`, url: `s\uD83D` }
    a.description = `d\uD83D`
    a.content = `b\uD83D`

    const clean = sanitizeArticleText(a)
    const serialized = JSON.stringify(slimRawJson(clean))

    expect(serialized).not.toContain('\\ud83d')
    expect([clean.title, clean.urlToImage, clean.category, clean.description, clean.content]).toEqual(
      ['t', 'i', 'c', 'd', 'b']
    )
    expect(clean.source).toEqual({ name: 'n', url: 's' })
  })

  it('leaves a clean article structurally identical', () => {
    const a = makeArticle('https://example.com/a')
    expect(sanitizeArticleText(a)).toEqual(a)
  })

  it('covers every SLIM_RAW_KEYS field, including publishedAt and id', () => {
    // publishedAt is the easy one to miss: the published_at COLUMN goes through
    // toDate(), but slimRawJson stores the field verbatim off the feed's
    // <pubDate>, so it reaches raw_json — and the ::jsonb cast — unvalidated.
    const a = makeArticle('https://example.com/a')
    a.id = `id\uD83D`
    a.publishedAt = `2026-01-01T00:00:00.000Z\uD83D`

    const clean = sanitizeArticleText(a)
    expect(clean.id).toBe('id')
    expect(clean.publishedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(JSON.stringify(slimRawJson(clean))).not.toContain('\\ud83d')
  })

  it('is not stateful across calls despite the /g regex', () => {
    // A module-scoped /g regex carries lastIndex; three identical calls must
    // return three identical results.
    const s = 'a\uD83Db\uD83Dc'
    expect([stripLoneSurrogates(s), stripLoneSurrogates(s), stripLoneSurrogates(s)]).toEqual([
      'abc',
      'abc',
      'abc',
    ])
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
