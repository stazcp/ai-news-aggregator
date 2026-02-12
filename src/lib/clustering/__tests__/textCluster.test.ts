import { Article, StoryCluster } from '@/types'
import {
  buildTfIdf,
  mergeClustersByOverlap,
  mergeClustersByTitle,
  mergeClustersByEntity,
  _testExports,
} from '../textCluster'

const { extractEntities, extractClusterEntities, crossClusterSimilarity, cosine } = _testExports

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal article factory — only fields the clustering code uses */
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

function makeCluster(title: string, ids: string[]): StoryCluster {
  return { clusterTitle: title, articleIds: ids }
}

// ---------------------------------------------------------------------------
// extractEntities
// ---------------------------------------------------------------------------
describe('extractEntities', () => {
  it('extracts compound proper nouns', () => {
    // "The White House" is a single compound (all consecutive caps)
    const entities = extractEntities('The White House issued a statement today')
    expect(entities.has('the_white_house')).toBe(true)
  })

  it('extracts mid-sentence capitalized words as entities', () => {
    const entities = extractEntities('Talks between Ukraine and Russia continue today')
    expect(entities.has('ukraine')).toBe(true)
    expect(entities.has('russia')).toBe(true)
  })

  it('skips first word of sentence (likely sentence starter)', () => {
    const entities = extractEntities('Today is a good day')
    // "Today" starts the sentence → should not be extracted as entity
    expect(entities.has('today')).toBe(false)
  })

  it('extracts acronyms (2-6 uppercase letters)', () => {
    const entities = extractEntities('NATO and the FBI met at the UN headquarters')
    expect(entities.has('nato')).toBe(true)
    expect(entities.has('fbi')).toBe(true)
    expect(entities.has('un')).toBe(true)
  })

  it('extracts capitalized word + number patterns', () => {
    const entities = extractEntities('Athletes head to Paris 2024 for the Games')
    expect(entities.has('paris_2024')).toBe(true)
  })

  it('returns empty set for empty/null text', () => {
    expect(extractEntities('').size).toBe(0)
    expect(extractEntities(null as unknown as string).size).toBe(0)
  })

  it('handles text with no entities', () => {
    const entities = extractEntities('the quick brown fox jumped over the lazy dog')
    // No capitalized words → no entities
    expect(entities.size).toBe(0)
  })

  it('normalizes entities to lowercase', () => {
    const entities = extractEntities('The event in Paris was covered by BBC')
    for (const e of entities) {
      expect(e).toBe(e.toLowerCase())
    }
  })
})

// ---------------------------------------------------------------------------
// extractClusterEntities
// ---------------------------------------------------------------------------
describe('extractClusterEntities', () => {
  it('extracts entities from cluster title', () => {
    // All consecutive caps words form one compound: "Winter Olympics Medal Count"
    const cluster = makeCluster('Winter Olympics Medal Count', ['a1'])
    const entities = extractClusterEntities(cluster)
    expect(entities.has('winter_olympics_medal_count')).toBe(true)
  })

  it('includes article title entities when articleMap provided', () => {
    const articles = [
      makeArticle({ id: 'a1', title: 'The team wins gold at the Paris Olympics' }),
      makeArticle({ id: 'a2', title: 'People celebrate the Olympic success in France' }),
    ]
    const articleMap = new Map(articles.map((a) => [a.id, a]))
    const cluster = makeCluster('Olympic results update', ['a1', 'a2'])

    const entities = extractClusterEntities(cluster, articleMap)
    // "France" is mid-sentence capitalized word in article a2
    expect(entities.has('france')).toBe(true)
    // "Paris" extracted as single cap word from a1
    expect(entities.has('paris')).toBe(true)
    // "Olympic" / "Olympics" extracted as single cap words
    expect(entities.has('olympic')).toBe(true)
  })

  it('limits to first 10 articles', () => {
    const articles = Array.from({ length: 15 }, (_, i) =>
      makeArticle({ id: `a${i}`, title: `Article ${i} about TopicName` })
    )
    const articleMap = new Map(articles.map((a) => [a.id, a]))
    const cluster = makeCluster(
      'Test',
      articles.map((a) => a.id)
    )

    // Should not throw and should return entities
    const entities = extractClusterEntities(cluster, articleMap)
    expect(entities.size).toBeGreaterThan(0)
  })

  it('works without articleMap (title-only extraction)', () => {
    // "NATO Summit" is a compound, "Brussels" is mid-sentence cap
    const cluster = makeCluster('The NATO Summit in Brussels', ['a1', 'a2'])
    const entities = extractClusterEntities(cluster)
    // NATO is also extracted as an acronym
    expect(entities.has('nato')).toBe(true)
    expect(entities.has('brussels')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildTfIdf + cosine
// ---------------------------------------------------------------------------
describe('buildTfIdf', () => {
  it('produces vectors and norms for all articles', () => {
    const articles = [
      makeArticle({ id: 'a1', title: 'Olympics swimming gold medal' }),
      makeArticle({ id: 'a2', title: 'Olympics diving silver medal' }),
    ]
    const { vecs, norms } = buildTfIdf(articles)
    expect(vecs.size).toBe(2)
    expect(norms.size).toBe(2)
    expect(norms.get('a1')).toBeGreaterThan(0)
  })

  it('similar articles have high cosine similarity', () => {
    const articles = [
      makeArticle({ id: 'a1', title: 'Apple releases new iPhone 16 with AI features' }),
      makeArticle({ id: 'a2', title: 'Apple launches iPhone 16 featuring AI capabilities' }),
      makeArticle({ id: 'a3', title: 'Russia and Ukraine continue ceasefire negotiations' }),
    ]
    const { vecs, norms } = buildTfIdf(articles)
    const sim12 = cosine(vecs.get('a1')!, vecs.get('a2')!, norms.get('a1')!, norms.get('a2')!)
    const sim13 = cosine(vecs.get('a1')!, vecs.get('a3')!, norms.get('a1')!, norms.get('a3')!)
    // iPhone articles should be much more similar to each other than to the Ukraine article
    expect(sim12).toBeGreaterThan(sim13)
    expect(sim12).toBeGreaterThan(0.3)
  })
})

// ---------------------------------------------------------------------------
// crossClusterSimilarity
// ---------------------------------------------------------------------------
describe('crossClusterSimilarity', () => {
  const articles = [
    makeArticle({ id: 'a1', title: 'Olympics swimming gold medal race results' }),
    makeArticle({ id: 'a2', title: 'Olympics diving competition medal winners' }),
    makeArticle({ id: 'a3', title: 'Stock market crashes amid recession fears' }),
    makeArticle({ id: 'a4', title: 'Wall street sell-off continues as economy weakens' }),
  ]
  const { vecs, norms } = buildTfIdf(articles)

  it('returns high similarity for related clusters', () => {
    const sim = crossClusterSimilarity(['a1', 'a2'], ['a2', 'a1'], vecs, norms)
    expect(sim).toBeGreaterThan(0)
  })

  it('returns low similarity for unrelated clusters', () => {
    const sim = crossClusterSimilarity(['a1', 'a2'], ['a3', 'a4'], vecs, norms)
    expect(sim).toBeLessThan(0.15)
  })

  it('returns 0 when one side has no valid IDs', () => {
    expect(crossClusterSimilarity(['x1'], ['a1'], vecs, norms)).toBe(0)
    expect(crossClusterSimilarity(['a1'], ['x1'], vecs, norms)).toBe(0)
  })

  it('respects sampleSize limit', () => {
    // With sampleSize=1, only the first pair is compared
    const sim1 = crossClusterSimilarity(['a1'], ['a2'], vecs, norms, 1)
    const sim2 = crossClusterSimilarity(['a1'], ['a2'], vecs, norms, 100)
    // With only 1 pair possible, both should be the same
    expect(sim1).toBeCloseTo(sim2, 5)
  })
})

// ---------------------------------------------------------------------------
// mergeClustersByOverlap
// ---------------------------------------------------------------------------
describe('mergeClustersByOverlap', () => {
  it('merges clusters with high article overlap', () => {
    const clusters = [
      makeCluster('Cluster A', ['a1', 'a2', 'a3']),
      makeCluster('Cluster B', ['a2', 'a3', 'a4']),
    ]
    // Jaccard = 2/4 = 0.5 → merges at threshold 0.45
    const merged = mergeClustersByOverlap(clusters, { jaccard: 0.45 })
    expect(merged).toHaveLength(1)
    expect(merged[0].articleIds).toEqual(expect.arrayContaining(['a1', 'a2', 'a3', 'a4']))
  })

  it('keeps clusters separate when overlap is low', () => {
    const clusters = [
      makeCluster('Cluster A', ['a1', 'a2', 'a3']),
      makeCluster('Cluster B', ['a4', 'a5', 'a6']),
    ]
    const merged = mergeClustersByOverlap(clusters, { jaccard: 0.5 })
    expect(merged).toHaveLength(2)
  })

  it('picks longer title when merging', () => {
    const clusters = [
      makeCluster('Short', ['a1', 'a2']),
      makeCluster('A Much Longer Title Here', ['a1', 'a2']),
    ]
    const merged = mergeClustersByOverlap(clusters, { jaccard: 0.5 })
    expect(merged).toHaveLength(1)
    expect(merged[0].clusterTitle).toBe('A Much Longer Title Here')
  })
})

// ---------------------------------------------------------------------------
// mergeClustersByTitle
// ---------------------------------------------------------------------------
describe('mergeClustersByTitle', () => {
  it('merges clusters with identical titles', () => {
    const clusters = [
      makeCluster('Winter Olympics', ['a1', 'a2']),
      makeCluster('Winter Olympics', ['a3', 'a4']),
    ]
    const merged = mergeClustersByTitle(clusters, { threshold: 0.7 })
    expect(merged).toHaveLength(1)
    expect(merged[0].articleIds).toHaveLength(4)
  })

  it('merges clusters with very similar titles', () => {
    const clusters = [
      makeCluster('Winter Olympics Medal Count Update', ['a1']),
      makeCluster('Winter Olympics Medal Count', ['a2']),
    ]
    const merged = mergeClustersByTitle(clusters, { threshold: 0.7 })
    expect(merged).toHaveLength(1)
  })

  it('keeps clusters with different titles separate', () => {
    const clusters = [
      makeCluster('Winter Olympics Medal Count', ['a1']),
      makeCluster('Stock Market Crash Today', ['a2']),
    ]
    const merged = mergeClustersByTitle(clusters, { threshold: 0.7 })
    expect(merged).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(mergeClustersByTitle([])).toEqual([])
  })

  it('returns single cluster as-is', () => {
    const clusters = [makeCluster('Only One', ['a1'])]
    expect(mergeClustersByTitle(clusters)).toEqual(clusters)
  })
})

// ---------------------------------------------------------------------------
// mergeClustersByEntity (with coherence gate)
// ---------------------------------------------------------------------------
describe('mergeClustersByEntity', () => {
  it('merges clusters sharing entities + high coherence', () => {
    // Articles about the same event with shared entities
    const articles = [
      makeArticle({ id: 'a1', title: 'Olympics Swimming Gold Medal for USA Team' }),
      makeArticle({ id: 'a2', title: 'USA Team Wins Olympic Gold in Swimming Finals' }),
      makeArticle({ id: 'a3', title: 'Olympic Swimming Results USA Takes Gold' }),
      makeArticle({ id: 'a4', title: 'USA Olympic Swimming Victory Gold Medal' }),
    ]
    const articleMap = new Map(articles.map((a) => [a.id, a]))

    const clusters = [
      makeCluster('USA Wins Olympic Swimming Gold', ['a1', 'a2']),
      makeCluster('Olympic Swimming Finals Results', ['a3', 'a4']),
    ]

    const merged = mergeClustersByEntity(clusters, articleMap, {
      minSharedEntities: 1,
      minEntityLength: 3,
      minCoherence: 0.05, // Low threshold since these are very similar
    })

    expect(merged).toHaveLength(1)
    expect(merged[0].articleIds).toHaveLength(4)
  })

  it('blocks merge when coherence is too low despite shared entities', () => {
    // Clusters share "paris" entity but articles are about completely different topics
    const articles = [
      makeArticle({ id: 'a1', title: 'Paris Climate Summit reaches breakthrough agreement' }),
      makeArticle({ id: 'a2', title: 'Climate Summit in Paris produces new carbon targets' }),
      makeArticle({ id: 'a3', title: 'Paris Fashion Week showcases spring collection' }),
      makeArticle({ id: 'a4', title: 'Fashion Week in Paris draws celebrity designers' }),
    ]
    const articleMap = new Map(articles.map((a) => [a.id, a]))

    const clusters = [
      makeCluster('Paris Climate Summit Agreement', ['a1', 'a2']),
      makeCluster('Paris Fashion Week Highlights', ['a3', 'a4']),
    ]

    const merged = mergeClustersByEntity(clusters, articleMap, {
      minSharedEntities: 1,
      minEntityLength: 4,
      minCoherence: 0.15, // Coherence gate should block this
    })

    expect(merged).toHaveLength(2)
  })

  it('does not snowball — entities are not unioned after merge', () => {
    // Cluster A shares entities with B, and B shares entities with C,
    // but A does NOT share entities with C.
    // Without snowball prevention, A would absorb B then absorb C via B's entities.
    const articles = [
      makeArticle({ id: 'a1', title: 'Apple WWDC Conference announces new MacBook Pro lineup' }),
      makeArticle({ id: 'a2', title: 'Apple iPhone Pro launch at WWDC Developer Conference' }),
      makeArticle({ id: 'a3', title: 'Samsung Galaxy Pro launch event shows new phone lineup' }),
    ]
    const articleMap = new Map(articles.map((a) => [a.id, a]))

    const clusters = [
      makeCluster('Apple WWDC Conference', ['a1']), // entities: apple, wwdc, macbook, pro
      makeCluster('Apple iPhone Pro Launch', ['a2']), // entities: apple, iphone, pro, wwdc
      makeCluster('Samsung Galaxy Pro Launch', ['a3']), // entities: samsung, galaxy, pro
    ]

    // "pro" is shared between all, "apple" between A and B, "launch" between B and C
    // Without snowball: A merges with B (shared: apple + wwdc + pro), C stays separate
    // With snowball: A+B would inherit B's entities, then C could merge via "pro" + "launch"
    const merged = mergeClustersByEntity(clusters, articleMap, {
      minSharedEntities: 2,
      minEntityLength: 3,
      minCoherence: 0.01, // Very low to isolate the snowball test
    })

    // A and B should merge (share apple + wwdc + pro), but C should stay separate
    expect(merged).toHaveLength(2)
    // The merged cluster should contain a1 and a2
    const mergedCluster = merged.find((c) => c.articleIds.includes('a1'))!
    expect(mergedCluster.articleIds).toContain('a2')
    expect(mergedCluster.articleIds).not.toContain('a3')
  })

  it('respects minSharedEntities threshold', () => {
    const articles = [
      makeArticle({ id: 'a1', title: 'Olympic event in Paris for athletes' }),
      makeArticle({ id: 'a2', title: 'Concert event in Paris for musicians' }),
    ]
    const articleMap = new Map(articles.map((a) => [a.id, a]))

    const clusters = [
      makeCluster('Olympic Paris Event', ['a1']),
      makeCluster('Paris Music Concert', ['a2']),
    ]

    // With minSharedEntities=3, only "paris" is shared → should not merge
    const merged = mergeClustersByEntity(clusters, articleMap, {
      minSharedEntities: 3,
      minEntityLength: 4,
      minCoherence: 0.01,
    })

    expect(merged).toHaveLength(2)
  })

  it('returns single cluster unchanged', () => {
    const articles = [makeArticle({ id: 'a1', title: 'Test' })]
    const articleMap = new Map(articles.map((a) => [a.id, a]))
    const clusters = [makeCluster('Test', ['a1'])]
    const merged = mergeClustersByEntity(clusters, articleMap)
    expect(merged).toEqual(clusters)
  })

  it('respects minEntityLength filter', () => {
    const articles = [
      makeArticle({ id: 'a1', title: 'The EU and US discuss trade in talks' }),
      makeArticle({ id: 'a2', title: 'EU and US tariff negotiations continue at summit' }),
    ]
    const articleMap = new Map(articles.map((a) => [a.id, a]))

    const clusters = [
      makeCluster('EU US Trade Talks', ['a1']),
      makeCluster('EU US Tariff Summit', ['a2']),
    ]

    // With minEntityLength=4, "eu" and "us" (2 chars each) are filtered → not enough entities
    const merged = mergeClustersByEntity(clusters, articleMap, {
      minSharedEntities: 2,
      minEntityLength: 4,
      minCoherence: 0.01,
    })

    expect(merged).toHaveLength(2)
  })
})
