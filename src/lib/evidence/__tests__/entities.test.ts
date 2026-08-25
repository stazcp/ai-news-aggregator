import { extractEntities } from '../entities'

function ids(mentions: { entityId: string }[]): string[] {
  return mentions.map((m) => m.entityId)
}

function salienceOf(mentions: { entityId: string; salience: number }[], id: string): number {
  const found = mentions.find((m) => m.entityId === id)
  expect(found).toBeDefined()
  return found!.salience
}

describe('extractEntities', () => {
  it('returns empty for empty input', () => {
    expect(extractEntities('', '')).toEqual([])
    expect(extractEntities('   ', '  \n ')).toEqual([])
  })

  describe('acronym case-sensitivity (terms ≤ 4 chars)', () => {
    it('matches short acronyms only with exact casing', () => {
      const matched = extractEntities('', 'The Fed held rates steady while the SEC opened a probe.')
      expect(ids(matched)).toEqual(expect.arrayContaining(['ent-federal-reserve', 'ent-sec']))
    })

    it('does not match lowercase collisions like "fed the dog" or "a sec later"', () => {
      const matched = extractEntities('', 'He fed the dog and came back a sec later.')
      expect(ids(matched)).not.toContain('ent-federal-reserve')
      expect(ids(matched)).not.toContain('ent-sec')
    })

    it('respects mixed-case acronyms like BoJ', () => {
      expect(ids(extractEntities('', 'The BoJ intervened.'))).toContain('ent-boj')
      expect(ids(extractEntities('', 'the boj intervened.'))).not.toContain('ent-boj')
    })

    it('still matches longer names case-insensitively', () => {
      const matched = extractEntities('', 'the federal reserve and the european central bank met.')
      expect(ids(matched)).toEqual(expect.arrayContaining(['ent-federal-reserve', 'ent-ecb']))
    })
  })

  describe('alias dedup', () => {
    it('collapses name and alias mentions into one entity', () => {
      const matched = extractEntities('', 'The Federal Reserve met today. The Fed signaled cuts.')
      expect(ids(matched).filter((id) => id === 'ent-federal-reserve')).toHaveLength(1)
    })

    it('accumulates mention counts across aliases into the salience', () => {
      const once = extractEntities('', 'Nvidia reported earnings.')
      const twice = extractEntities('', 'Nvidia reported earnings. NVDA shares jumped.')
      expect(salienceOf(twice, 'ent-nvidia')).toBeGreaterThan(salienceOf(once, 'ent-nvidia'))
    })
  })

  describe('title boost', () => {
    it('scores a title mention higher than a body mention', () => {
      const inTitle = extractEntities('Cameco wins supply deal', 'The company announced results.')
      const inBody = extractEntities('Miner wins supply deal', 'Cameco announced results.')
      expect(salienceOf(inTitle, 'ent-cameco')).toBeGreaterThan(salienceOf(inBody, 'ent-cameco'))
    })

    it('keeps salience within (0, 1] even for heavy repetition', () => {
      const spam = Array(50).fill('Nvidia and the Fed and uranium.').join(' ')
      for (const mention of extractEntities('Nvidia Fed uranium', spam)) {
        expect(mention.salience).toBeGreaterThan(0)
        expect(mention.salience).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('word boundaries', () => {
    it('does not match "Meta" inside "metadata"', () => {
      expect(ids(extractEntities('', 'The metadata standards improved.'))).not.toContain('ent-meta')
      expect(ids(extractEntities('', 'Metadata standards improved.'))).not.toContain('ent-meta')
    })

    it('matches "Meta" as a standalone word', () => {
      expect(ids(extractEntities('', 'Meta unveiled a new model.'))).toContain('ent-meta')
    })

    it('does not match substrings of longer words for multi-char names', () => {
      expect(ids(extractEntities('', 'The armada sailed on.'))).not.toContain('ent-arm')
      expect(ids(extractEntities('', 'A golden retriever.'))).not.toContain('ent-gold')
    })

    it('ignores "Google News" feed boilerplate but still matches real Google mentions', () => {
      const boilerplate = extractEntities('', 'Match report  ESPN  Google News')
      expect(ids(boilerplate)).not.toContain('ent-alphabet')
      const real = extractEntities('', 'Google unveiled a new TPU. Google News boilerplate here.')
      expect(ids(real)).toContain('ent-alphabet')
    })

    it('ignores HTML markup and URLs in feed bodies', () => {
      const html =
        '<ol><li><a href="https://news.google.com/rss/articles/abc" target="_blank">Match report</a>' +
        '<font color="#6f6f6f">ESPN</font></li></ol> see https://news.google.com/foo'
      expect(ids(extractEntities('', html))).not.toContain('ent-alphabet')
    })

    it('handles terms with punctuation like U.S. and OPEC+', () => {
      const matched = extractEntities('', 'OPEC+ agreed to cuts as U.S. output rose.')
      expect(ids(matched)).toEqual(expect.arrayContaining(['ent-opec', 'ent-united-states']))
    })
  })

  describe('review regressions', () => {
    const salienceOf = (mentions: ReturnType<typeof extractEntities>, id: string) =>
      mentions.find((m) => m.entityId === id)?.salience

    it('counts overlapping terms for the same entity once per text span', () => {
      // Title-only mention: exactly one count + title boost, even though
      // "Nvidia"/"NVIDIA" both exist as terms.
      expect(salienceOf(extractEntities('Nvidia beats estimates', ''), 'ent-nvidia')).toBeCloseTo(0.6)
      // "U.S. Federal Reserve" contains "Federal Reserve": one mention, not two.
      expect(
        salienceOf(extractEntities('', 'The U.S. Federal Reserve met.'), 'ent-federal-reserve')
      ).toBeCloseTo(0.2)
      // "OPEC+" also contains "OPEC": one mention.
      expect(salienceOf(extractEntities('', 'OPEC+ met today.'), 'ent-opec')).toBeCloseTo(0.2)
    })

    it('decodes HTML entities and curly apostrophes before matching', () => {
      expect(ids(extractEntities('', 'Johnson &amp; Johnson reported earnings.'))).toContain(
        'ent-johnson-johnson'
      )
      expect(ids(extractEntities('', 'Johnson &amp;amp; Johnson reported earnings.'))).toContain(
        'ent-johnson-johnson'
      )
      expect(ids(extractEntities('', 'The People’s Bank of China eased policy.'))).toContain('ent-pboc')
    })

    it('rejects sentence-initial acronym collocations and all-caps shouting', () => {
      expect(ids(extractEntities('', 'Fed up with delays, commuters protested.'))).not.toContain(
        'ent-federal-reserve'
      )
      const shouting = extractEntities('WHO SAID IT FIRST? THE UN DID, NOT THE OTHERS.', '')
      expect(ids(shouting)).not.toContain('ent-who')
      expect(ids(shouting)).not.toContain('ent-united-nations')
      // Normal case still matches.
      expect(ids(extractEntities('', 'The Fed raised rates.'))).toContain('ent-federal-reserve')
      expect(ids(extractEntities('', 'The WHO declared an emergency.'))).toContain('ent-who')
    })

    it('does not mislink generic phrases through removed aliases', () => {
      expect(ids(extractEntities('', "The National People's Congress convened."))).not.toContain(
        'ent-us-congress'
      )
      expect(ids(extractEntities('', 'A shell company was used in the scheme.'))).not.toContain(
        'ent-shell'
      )
      expect(ids(extractEntities('', 'Bank of America posted profits.'))).not.toContain(
        'ent-united-states'
      )
      expect(ids(extractEntities('', 'Shell plc posted profits.'))).toContain('ent-shell')
    })
  })
})
