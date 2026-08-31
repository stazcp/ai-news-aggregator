import { Article, StoryCluster } from '@/types'
import { getSql } from './db'
import { contentHash } from './persist'

export interface ClusterPersistResult {
  storiesCreated: number
  storiesUpdated: number
  membersAdded: number
  clustersSkipped: number
  /** Ids of every story touched this run (created or updated), best-scored first. */
  storyIds: string[]
}

/** Existing stories older than this are never candidates for identity reuse. */
const CONTINUITY_WINDOW_DAYS = 7
/** Minimum |intersection| / |smaller member set| to reuse an existing story id. */
const MIN_OVERLAP = 0.5
/** Clusters need this many DB-backed members to be worth persisting. */
const MIN_MEMBERS = 2

export interface IncomingCluster {
  index: number
  memberIds: string[]
}

export interface ExistingStory {
  id: string
  memberIds: string[]
}

/** Numeric-aware compare so 'st-9' sorts before 'st-10' (older story wins ties). */
function compareStoryIds(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

/**
 * Deterministic greedy matching of incoming clusters to existing stories.
 * A pair qualifies when its overlap (|intersection| / |smaller member set|)
 * is at least MIN_OVERLAP. Qualifying pairs are ranked by ABSOLUTE shared
 * member count first, then Jaccard, then oldest story id, then incoming
 * order — ranking by the containment ratio alone would let a tiny fragment
 * fully contained in a story score 1.0 and hijack its id away from the
 * story's true continuation. Each story / incoming cluster is used at most
 * once.
 */
export function matchClustersToStories(
  incoming: IncomingCluster[],
  existing: ExistingStory[]
): Map<number, string> {
  const pairs: { index: number; storyId: string; shared: number; jaccard: number }[] = []
  for (const cluster of incoming) {
    const members = new Set(cluster.memberIds)
    if (members.size === 0) continue
    for (const story of existing) {
      if (story.memberIds.length === 0) continue
      let shared = 0
      for (const id of story.memberIds) if (members.has(id)) shared++
      const overlap = shared / Math.min(members.size, story.memberIds.length)
      if (overlap >= MIN_OVERLAP) {
        const union = members.size + story.memberIds.length - shared
        pairs.push({ index: cluster.index, storyId: story.id, shared, jaccard: shared / union })
      }
    }
  }
  pairs.sort(
    (a, b) =>
      b.shared - a.shared ||
      b.jaccard - a.jaccard ||
      compareStoryIds(a.storyId, b.storyId) ||
      a.index - b.index
  )
  const assigned = new Map<number, string>()
  const usedStories = new Set<string>()
  for (const pair of pairs) {
    if (assigned.has(pair.index) || usedStories.has(pair.storyId)) continue
    assigned.set(pair.index, pair.storyId)
    usedStories.add(pair.storyId)
  }
  return assigned
}

/** Most common category across a cluster's members; alphabetical on ties. */
export function dominantCategory(categories: (string | undefined | null)[]): string | null {
  const counts = new Map<string, number>()
  for (const c of categories) {
    if (c) counts.set(c, (counts.get(c) || 0) + 1)
  }
  let best: string | null = null
  for (const [category, count] of counts) {
    if (best === null || count > counts.get(best)! || (count === counts.get(best)! && category < best)) {
      best = category
    }
  }
  return best
}

/**
 * Persists an in-memory clustering snapshot with stable story identity:
 * incoming clusters that substantially overlap a recently seen story reuse its
 * id (metadata refreshed, new members appended); the rest become new stories.
 * Idempotent — re-running the same snapshot updates in place, never duplicates.
 */
export async function persistClusters(
  clusters: StoryCluster[],
  articles: Article[]
): Promise<ClusterPersistResult> {
  const sql = getSql()
  const result: ClusterPersistResult = {
    storiesCreated: 0,
    storiesUpdated: 0,
    membersAdded: 0,
    clustersSkipped: 0,
    storyIds: [],
  }
  if (clusters.length === 0) return result

  // Defensive sweep: memberless stories are invisible to the continuity JOIN
  // and would otherwise sit in top-story reads forever (pre-atomic-insert
  // crashes could create them; nothing legitimate ever has zero members).
  await sql`
    DELETE FROM story_clusters sc
    WHERE NOT EXISTS (SELECT 1 FROM cluster_articles ca WHERE ca.cluster_id = sc.id)
      AND sc.first_seen_at < now() - interval '1 hour'
  `

  // Map in-memory article ids to DB ids via content_hash (sha256 of the URL),
  // so the snapshot's provenance is independent of how articles were loaded.
  const hashById = new Map<string, string>()
  for (const a of articles) {
    if (a.url) hashById.set(a.id, contentHash(a))
  }
  const dbRows = await sql`
    SELECT id, content_hash FROM articles WHERE content_hash = ANY(${[...new Set(hashById.values())]})
  `
  const dbIdByHash = new Map(dbRows.map((r) => [r.content_hash as string, r.id as string]))

  // Resolve each cluster's member set to DB ids; drop unknown articles.
  const incoming: IncomingCluster[] = clusters.map((c, index) => {
    const memberIds = [
      ...new Set(
        (c.articleIds || [])
          .map((id) => {
            const hash = hashById.get(id)
            return hash ? dbIdByHash.get(hash) : undefined
          })
          .filter(Boolean) as string[]
      ),
    ]
    return { index, memberIds }
  })
  const persistable = incoming.filter((c) => c.memberIds.length >= MIN_MEMBERS)
  result.clustersSkipped = clusters.length - persistable.length
  if (persistable.length === 0) return result

  // Load full member sets of recent stories that share at least one member.
  const allMemberIds = [...new Set(persistable.flatMap((c) => c.memberIds))]
  const candidateRows = await sql`
    SELECT ca.cluster_id, ca.article_id
    FROM cluster_articles ca
    JOIN story_clusters sc ON sc.id = ca.cluster_id
    WHERE sc.last_seen_at > now() - make_interval(days => ${CONTINUITY_WINDOW_DAYS})
      AND ca.cluster_id IN (
        SELECT DISTINCT cluster_id FROM cluster_articles WHERE article_id = ANY(${allMemberIds})
      )
  `
  const existingById = new Map<string, string[]>()
  for (const row of candidateRows) {
    const members = existingById.get(row.cluster_id as string) || []
    members.push(row.article_id as string)
    existingById.set(row.cluster_id as string, members)
  }
  const existing: ExistingStory[] = [...existingById.entries()].map(([id, memberIds]) => ({
    id,
    memberIds,
  }))

  const assigned = matchClustersToStories(persistable, existing)

  const articleById = new Map(articles.map((a) => [a.id, a]))
  for (const { index, memberIds } of persistable) {
    const cluster = clusters[index]
    const category = dominantCategory(
      (cluster.articleIds || []).map((id) => articleById.get(id)?.category)
    )
    const imageUrls = cluster.imageUrls?.length ? JSON.stringify(cluster.imageUrls) : null
    const severityLevel = cluster.severity?.level ?? null
    const severityLabel = cluster.severity?.label ?? null
    const score = cluster.score ?? null

    let storyId = assigned.get(index)
    if (storyId) {
      await sql`
        UPDATE story_clusters SET
          title = ${cluster.clusterTitle},
          category = ${category},
          score = ${score},
          severity_level = ${severityLevel},
          severity_label = ${severityLabel},
          image_urls = COALESCE(${imageUrls}::jsonb, image_urls),
          last_seen_at = now()
        WHERE id = ${storyId}
      `
      const added = await sql`
        INSERT INTO cluster_articles (cluster_id, article_id)
        SELECT ${storyId}, a FROM unnest(${memberIds}::text[]) AS x(a)
        ON CONFLICT (cluster_id, article_id) DO NOTHING
        RETURNING article_id
      `
      result.membersAdded += added.length
      result.storiesUpdated++
    } else {
      // Single statement so the story and its members commit atomically over
      // the Neon HTTP driver — a crash can't leave a memberless orphan story
      // that the continuity JOIN would never find again.
      const inserted = await sql`
        WITH s AS (
          INSERT INTO story_clusters (title, category, score, severity_level, severity_label, image_urls)
          VALUES (${cluster.clusterTitle}, ${category}, ${score}, ${severityLevel}, ${severityLabel}, ${imageUrls}::jsonb)
          RETURNING id
        ), m AS (
          INSERT INTO cluster_articles (cluster_id, article_id)
          SELECT s.id, x.a FROM s, unnest(${memberIds}::text[]) AS x(a)
          RETURNING article_id
        )
        SELECT s.id, (SELECT count(*) FROM m)::int AS added FROM s
      `
      storyId = inserted[0].id as string
      result.membersAdded += inserted[0].added as number
      result.storiesCreated++
    }
    result.storyIds.push(storyId)
  }
  return result
}
