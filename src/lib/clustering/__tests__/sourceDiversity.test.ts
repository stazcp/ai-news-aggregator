import { StoryCluster } from '@/types'
import { dropSingleSourceClusters, outletFromSource } from '../sourceDiversity'

function makeCluster(title: string, ids: string[]): StoryCluster {
  return { clusterTitle: title, articleIds: ids }
}

function outlets(map: Record<string, string>): (id: string) => string | undefined {
  return (id) => map[id]
}

describe('dropSingleSourceClusters', () => {
  it('dissolves a group whose members all come from one outlet', () => {
    const outletOf = outlets({ a: 'hacker-news', b: 'hacker-news', c: 'hacker-news' })
    const result = dropSingleSourceClusters([makeCluster('HN blob', ['a', 'b', 'c'])], outletOf)
    expect(result).toEqual([])
  })

  it('does not count a member with no known outlet as a distinct source', () => {
    const outletOf = outlets({ a: 'hacker-news', b: 'hacker-news' })
    const result = dropSingleSourceClusters([makeCluster('HN', ['a', 'b', 'x'])], outletOf)
    expect(result).toEqual([])
  })

  it('keeps a group covered by more than one outlet', () => {
    const outletOf = outlets({ a: 'reuters', b: 'bbc', c: 'reuters' })
    const cluster = makeCluster('Real story', ['a', 'b', 'c'])
    expect(dropSingleSourceClusters([cluster], outletOf)).toEqual([cluster])
  })

  it('filters only the single-outlet groups out of a mixed list', () => {
    const outletOf = outlets({ h1: 'hacker-news', h2: 'hacker-news', r1: 'reuters', b1: 'bbc' })
    const single = makeCluster('HN blob', ['h1', 'h2'])
    const multi = makeCluster('Real story', ['r1', 'b1'])
    expect(dropSingleSourceClusters([single, multi], outletOf)).toEqual([multi])
  })
})

describe('outletFromSource', () => {
  it('keeps canonical slugs as they are', () => {
    expect(outletFromSource('hacker-news')).toBe('hacker-news')
    expect(outletFromSource('reuters')).toBe('reuters')
  })

  it('treats a missing or unknown source as no outlet', () => {
    expect(outletFromSource('unknown')).toBeUndefined()
    expect(outletFromSource('')).toBeUndefined()
    expect(outletFromSource(null)).toBeUndefined()
  })

  it('normalizes a legacy raw feed title to its outlet', () => {
    expect(outletFromSource('World - CBSNews.com')).toBe('cbsnews')
  })
})
