import { Article, StoryCluster } from '@/types'
import { dropSingleSourceClusters } from '../sourceDiversity'

function makeArticle(id: string, sourceName: string): Article {
  return {
    id,
    title: `Article ${id}`,
    url: `https://example.com/${id}`,
    urlToImage: '',
    publishedAt: new Date().toISOString(),
    source: { name: sourceName, url: '' },
    category: 'Tech',
  }
}

function makeCluster(title: string, ids: string[]): StoryCluster {
  return { clusterTitle: title, articleIds: ids }
}

describe('dropSingleSourceClusters', () => {
  it('dissolves a group whose members all come from one source', () => {
    const articles = ['a', 'b', 'c'].map((id) => makeArticle(id, 'hacker-news'))
    const result = dropSingleSourceClusters([makeCluster('HN blob', ['a', 'b', 'c'])], articles)
    expect(result).toEqual([])
  })

  it('treats source names case- and whitespace-insensitively', () => {
    const articles = [makeArticle('a', 'Hacker News'), makeArticle('b', ' hacker news ')]
    expect(dropSingleSourceClusters([makeCluster('HN', ['a', 'b'])], articles)).toEqual([])
  })

  it('keeps a group covered by more than one source', () => {
    const articles = [
      makeArticle('a', 'Reuters'),
      makeArticle('b', 'BBC News'),
      makeArticle('c', 'Reuters'),
    ]
    const cluster = makeCluster('Real story', ['a', 'b', 'c'])
    expect(dropSingleSourceClusters([cluster], articles)).toEqual([cluster])
  })

  it('filters only the single-source groups out of a mixed list', () => {
    const articles = [
      makeArticle('h1', 'hacker-news'),
      makeArticle('h2', 'hacker-news'),
      makeArticle('r1', 'Reuters'),
      makeArticle('b1', 'BBC News'),
    ]
    const single = makeCluster('HN blob', ['h1', 'h2'])
    const multi = makeCluster('Real story', ['r1', 'b1'])
    expect(dropSingleSourceClusters([single, multi], articles)).toEqual([multi])
  })
})
