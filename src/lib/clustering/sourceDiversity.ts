import { Article, StoryCluster } from '@/types'

function sourceKey(article: Article): string {
  return (article.source?.name || '').trim().toLowerCase()
}

// A "story" whose members all come from one source is almost always feed
// boilerplate making unrelated items look similar (e.g. every Hacker News item
// sharing the same "Comments" footer), not one event covered by several
// outlets. Dissolve such groups so their articles stay unclustered. Run on the
// seeds before any merge: a merge only unions members, so multi-source seeds
// stay multi-source, and a single-source blob can't ride a title merge into a
// real story.
export function dropSingleSourceClusters(
  clusters: StoryCluster[],
  articles: Article[]
): StoryCluster[] {
  const articleById = new Map(articles.map((a) => [a.id, a]))
  return clusters.filter((cluster) => {
    const sources = new Set(
      cluster.articleIds
        .map((id) => articleById.get(id))
        .filter((a): a is Article => Boolean(a))
        .map(sourceKey)
    )
    return sources.size >= 2
  })
}
