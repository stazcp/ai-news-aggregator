import { StoryCluster } from '@/types'
import { sourceSlug } from '@/lib/evidence/sourceSlug'

// A "story" whose members all come from one outlet is almost always feed
// boilerplate making unrelated items look similar (e.g. every Hacker News item
// sharing the same "Comments" footer), not one event covered by several
// outlets. Dissolve such groups so their articles stay unclustered. Run on the
// seeds before any merge: a merge only unions members, so multi-source seeds
// stay multi-source, and a single-source blob can't ride a title merge into a
// real story. The cost is that a genuine single-outlet seed can't join a
// matching multi-source story through the merge; those articles stay
// unclustered rather than risk a blob contaminating a real story.
//
// outletOf must return the outlet, not the feed: raw RSS feed titles
// ("Hacker News: Front Page" / "Hacker News: Best") would count one outlet
// twice. Members with no known outlet don't count towards diversity.
export function dropSingleSourceClusters(
  clusters: StoryCluster[],
  outletOf: (articleId: string) => string | undefined
): StoryCluster[] {
  return clusters.filter((cluster) => {
    const outlets = new Set<string>()
    for (const id of cluster.articleIds) {
      const outlet = outletOf(id)
      if (outlet) outlets.add(outlet)
    }
    return outlets.size >= 2
  })
}

// Outlet key for an articles.source value. Re-slugging is idempotent for
// canonical slugs and normalizes legacy rows that still hold raw feed titles;
// sourceSlug's 'unknown' fallback is no outlet, not a distinct one.
export function outletFromSource(source: string | null | undefined): string | undefined {
  const slug = sourceSlug(source || '')
  return slug === 'unknown' ? undefined : slug
}
