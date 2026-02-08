import { Article, StoryCluster } from '@/types'

type Vec = Map<string, number>

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'to',
  'in',
  'on',
  'for',
  'with',
  'at',
  'by',
  'from',
  'as',
  'that',
  'this',
  'these',
  'those',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'its',
  'into',
  'about',
  'after',
  'before',
  'over',
  'under',
  'up',
  'down',
  'out',
  'off',
  'than',
  'then',
  'but',
  'not',
  'no',
  'so',
  'just',
  'only',
  'more',
  'most',
  'less',
  'least',
  'new',
  'latest',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t) && t.length > 2)
}

function docText(a: Article): string {
  // Include a bit of content to improve semantic signal without exploding tokens
  const content = (a.content || '').slice(0, 500)
  return [a.title || '', a.description || '', content].join(' ')
}

export function buildTfIdf(articles: Article[]): {
  vecs: Map<string, Vec>
  idf: Map<string, number>
  norms: Map<string, number>
} {
  const tf: Map<string, Map<string, number>> = new Map()
  const df: Map<string, number> = new Map()

  for (const a of articles) {
    const tokens = tokenize(docText(a))
    const counts: Map<string, number> = new Map()
    for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1)
    tf.set(a.id, counts)
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1)
  }

  const N = articles.length
  const idf: Map<string, number> = new Map()
  for (const [t, d] of df) idf.set(t, Math.log(1 + N / (1 + d)))

  const vecs: Map<string, Vec> = new Map()
  const norms: Map<string, number> = new Map()
  for (const a of articles) {
    const counts = tf.get(a.id)!
    const v: Vec = new Map()
    let norm = 0
    for (const [t, c] of counts) {
      const w = (1 + Math.log(c)) * (idf.get(t) || 0)
      if (w) {
        v.set(t, w)
        norm += w * w
      }
    }
    vecs.set(a.id, v)
    norms.set(a.id, Math.sqrt(norm) || 1)
  }

  return { vecs, idf, norms }
}

function cosine(a: Vec, b: Vec, normA: number, normB: number): number {
  let sum = 0
  if (a.size < b.size) {
    for (const [t, wa] of a) {
      const wb = b.get(t)
      if (wb) sum += wa * wb
    }
  } else {
    for (const [t, wb] of b) {
      const wa = a.get(t)
      if (wa) sum += wa * wb
    }
  }
  return sum / (normA * normB || 1)
}

function addToCentroid(centroid: Vec, doc: Vec): Vec {
  for (const [t, w] of doc) centroid.set(t, (centroid.get(t) || 0) + w)
  return centroid
}

function centroidSim(centroid: Vec, doc: Vec): number {
  // Compute similarity by treating centroid as already summed weights; approximate norm
  let normC = 0
  for (const [, w] of centroid) normC += w * w
  normC = Math.sqrt(normC) || 1
  let sum = 0
  for (const [t, w] of doc) {
    const wc = centroid.get(t)
    if (wc) sum += wc * w
  }
  let normD = 0
  for (const [, w] of doc) normD += w * w
  normD = Math.sqrt(normD) || 1
  return sum / (normC * normD)
}

export function preClusterArticles(
  articles: Article[],
  {
    threshold = 0.42,
    minSize = 3,
    maxGroup = 30,
  }: { threshold?: number; minSize?: number; maxGroup?: number } = {}
): StoryCluster[] {
  if (articles.length === 0) return []
  const { vecs, norms } = buildTfIdf(articles)

  // Sort newest first to bias clusters toward current events
  const sorted = [...articles].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )

  type Seed = { ids: string[]; centroid: Vec; count: number; title: string }
  const seeds: Seed[] = []

  for (const a of sorted) {
    const va = vecs.get(a.id)!
    let bestIdx = -1
    let bestSim = 0
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]
      const sim = centroidSim(s.centroid, va)
      if (sim > bestSim) {
        bestSim = sim
        bestIdx = i
      }
    }
    if (bestIdx >= 0 && bestSim >= threshold && seeds[bestIdx].ids.length < maxGroup) {
      const s = seeds[bestIdx]
      s.ids.push(a.id)
      addToCentroid(s.centroid, va)
      s.count += 1
    } else {
      const c: Vec = new Map()
      addToCentroid(c, va)
      seeds.push({ ids: [a.id], centroid: c, count: 1, title: a.title })
    }
  }

  const clusters: StoryCluster[] = seeds
    .filter((s) => s.ids.length >= minSize)
    .map((s) => ({ clusterTitle: s.title, articleIds: s.ids }))

  return clusters
}

export function mergeClustersByOverlap(
  clusters: StoryCluster[],
  { jaccard = 0.6 }: { jaccard?: number } = {}
): StoryCluster[] {
  const merged: StoryCluster[] = []
  const used = new Set<number>()
  for (let i = 0; i < clusters.length; i++) {
    if (used.has(i)) continue
    let base = clusters[i]
    const baseSet = new Set(base.articleIds)
    for (let j = i + 1; j < clusters.length; j++) {
      if (used.has(j)) continue
      const other = clusters[j]
      const inter = other.articleIds.filter((id) => baseSet.has(id)).length
      const union = new Set([...base.articleIds, ...other.articleIds]).size
      const jac = inter / (union || 1)
      if (jac >= jaccard) {
        base = {
          clusterTitle:
            base.clusterTitle.length >= other.clusterTitle.length
              ? base.clusterTitle
              : other.clusterTitle,
          articleIds: Array.from(new Set([...base.articleIds, ...other.articleIds])),
        }
        used.add(j)
      }
    }
    merged.push(base)
  }
  return merged
}

// Split an incoherent cluster into tighter subclusters using a higher similarity threshold
export function splitIncoherentCluster(
  articles: Article[],
  cluster: StoryCluster,
  { threshold = 0.52, minSize = 3 }: { threshold?: number; minSize?: number } = {}
): StoryCluster[] {
  const set = new Set(cluster.articleIds)
  const subset = articles.filter((a) => set.has(a.id))
  if (subset.length < minSize) return []
  const subs = preClusterArticles(subset, { threshold, minSize, maxGroup: 50 })
  return subs
}

function titleTokens(title: string): Set<string> {
  const toks = tokenize(title).filter((t) => !STOPWORDS.has(t))
  return new Set(toks)
}

function jaccardSets(a: Set<string>, b: Set<string>): number {
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = new Set([...a, ...b]).size
  return inter / (union || 1)
}

export function mergeClustersByTitle(
  clusters: StoryCluster[],
  { threshold = 0.7 }: { threshold?: number } = {}
): StoryCluster[] {
  if (clusters.length <= 1) return clusters
  const merged: StoryCluster[] = []
  const used = new Set<number>()
  const tokens = clusters.map((c) => titleTokens(c.clusterTitle || ''))

  for (let i = 0; i < clusters.length; i++) {
    if (used.has(i)) continue
    let base = clusters[i]
    let baseTok = tokens[i]
    for (let j = i + 1; j < clusters.length; j++) {
      if (used.has(j)) continue
      const sim = jaccardSets(baseTok, tokens[j])
      if (sim >= threshold) {
        base = {
          clusterTitle:
            (base.clusterTitle || '').length >= (clusters[j].clusterTitle || '').length
              ? base.clusterTitle
              : clusters[j].clusterTitle,
          articleIds: Array.from(
            new Set([...(base.articleIds || []), ...(clusters[j].articleIds || [])])
          ),
        }
        baseTok = titleTokens(base.clusterTitle || '')
        used.add(j)
      }
    }
    merged.push(base)
  }
  return merged
}

/**
 * Extract "key entities" from text - proper nouns, compound names, acronyms.
 * These are words that identify specific things: Olympics, Trump, Apple, Paris, etc.
 *
 * Fully dynamic approach - no hardcoded word lists:
 * 1. Consecutive capitalized words → compound entity ("World Cup" → "world_cup")
 * 2. Mid-sentence capitalized words → simple entity ("Olympics" → "olympics")
 * 3. Acronyms in ALL CAPS → entity ("NATO", "FBI")
 * 4. Capitalized word + number → named events ("Paris 2024" → "paris_2024")
 *
 * Precision is achieved by requiring 2+ shared entities for cluster merging,
 * which naturally filters out common words that appear across unrelated clusters.
 */
function extractEntities(text: string): Set<string> {
  const entities = new Set<string>()
  if (!text) return entities

  // 1. Extract compound proper nouns (consecutive capitalized words)
  // "World Cup", "Super Bowl", "White House" → "world_cup", "super_bowl", "white_house"
  const compoundPattern = /[A-Z][a-zA-Z'']*(?:\s+[A-Z][a-zA-Z'']*)+/g
  const compounds = text.match(compoundPattern) || []
  for (const compound of compounds) {
    entities.add(compound.toLowerCase().replace(/\s+/g, '_').replace(/['']/g, ''))
  }

  // 2. Extract single capitalized words (simple proper nouns)
  // Split on sentence boundaries first
  const sentences = text.split(/[.!?]\s+/)
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/)
    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      // Match capitalized word (allows apostrophes for names like O'Brien, McDonald's)
      if (/^[A-Z][a-zA-Z'']*$/.test(word) && word.length >= 3) {
        if (i === 0) {
          // Always skip the first word of a sentence — it's capitalized due
          // to grammar, not necessarily because it's a proper noun. We can't
          // distinguish "Biden announces..." from "Today is..." at sentence
          // start. Important proper nouns will still be captured mid-sentence
          // in other articles or via compound patterns (step 1) / acronyms (step 3).
          continue
        }
        entities.add(word.toLowerCase().replace(/['']/g, ''))
      }
    }
  }

  // 3. Extract acronyms (2-6 uppercase letters)
  const acronyms = text.match(/\b[A-Z]{2,6}\b/g) || []
  for (const acro of acronyms) {
    entities.add(acro.toLowerCase())
  }

  // 4. Extract capitalized word + number patterns (e.g., "Paris 2024", "G20")
  const namedEvents = text.match(/[A-Z][a-zA-Z]*\s*\d{2,4}/g) || []
  for (const event of namedEvents) {
    entities.add(event.toLowerCase().replace(/\s+/g, '_'))
  }

  return entities
}

/**
 * Extract entities from a cluster by combining its title and article titles.
 */
function extractClusterEntities(
  cluster: StoryCluster,
  articleMap?: Map<string, Article>
): Set<string> {
  const allText: string[] = [cluster.clusterTitle || '']

  // Add article titles for more entity coverage
  if (articleMap && cluster.articleIds) {
    for (const id of cluster.articleIds.slice(0, 10)) {
      // Limit to first 10 articles
      const article = articleMap.get(id)
      if (article?.title) allText.push(article.title)
    }
  }

  // Join with '. ' so each title is treated as its own sentence in extractEntities,
  // preventing the entire combined text from becoming one giant "sentence" where
  // only the very first word is skipped.
  const combined = allText.join('. ')
  return extractEntities(combined)
}

/**
 * Compute the average pairwise TF-IDF cosine similarity between two sets of
 * article IDs.  Uses a sample of up to `sampleSize` pairs to keep cost O(1).
 */
function crossClusterSimilarity(
  idsA: string[],
  idsB: string[],
  vecs: Map<string, Vec>,
  norms: Map<string, number>,
  sampleSize = 20
): number {
  const pairsA = idsA.filter((id) => vecs.has(id))
  const pairsB = idsB.filter((id) => vecs.has(id))
  if (pairsA.length === 0 || pairsB.length === 0) return 0

  let total = 0
  let count = 0
  // Iterate up to sampleSize pairs (deterministic: first N×M combinations)
  outer: for (const idA of pairsA) {
    for (const idB of pairsB) {
      total += cosine(vecs.get(idA)!, vecs.get(idB)!, norms.get(idA)!, norms.get(idB)!)
      count++
      if (count >= sampleSize) break outer
    }
  }
  return count > 0 ? total / count : 0
}

/**
 * Merge clusters that share significant entities (same topic/event) AND
 * pass a TF-IDF cosine coherence check.
 *
 * The coherence gate prevents unrelated clusters that happen to share common
 * entities (e.g. "Olympics" + "Paris") from being merged when their articles
 * are actually about different events.
 *
 * Entity sets are NOT unioned after merge to prevent snowball absorption where
 * a growing cluster inherits entities from each absorbed cluster and matches
 * progressively less related clusters.
 *
 * @param minSharedEntities - Minimum shared entities to consider merge (default: 1)
 * @param minEntityLength - Minimum entity string length to keep (filters noise)
 * @param minCoherence - Minimum avg cross-cluster TF-IDF cosine to allow merge (default: 0.12)
 */
export function mergeClustersByEntity(
  clusters: StoryCluster[],
  articleMap: Map<string, Article>,
  {
    minSharedEntities = 1,
    minEntityLength = 4,
    minCoherence = 0.12,
  }: { minSharedEntities?: number; minEntityLength?: number; minCoherence?: number } = {}
): StoryCluster[] {
  if (clusters.length <= 1) return clusters

  // Build TF-IDF once for all articles referenced by any cluster
  const allIds = new Set(clusters.flatMap((c) => c.articleIds || []))
  const allArticles = [...allIds].map((id) => articleMap.get(id)).filter(Boolean) as Article[]
  const { vecs, norms } = buildTfIdf(allArticles)

  // Extract entities for each cluster
  const clusterEntities = clusters.map((c) => {
    const entities = extractClusterEntities(c, articleMap)
    // Filter by minimum length
    return new Set([...entities].filter((e) => e.length >= minEntityLength))
  })

  const merged: StoryCluster[] = []
  const used = new Set<number>()

  for (let i = 0; i < clusters.length; i++) {
    if (used.has(i)) continue

    let base = clusters[i]
    // Use only the original cluster's entities — do NOT union after merge
    // to prevent snowball absorption of progressively less related clusters
    const baseEntities = clusterEntities[i]

    for (let j = i + 1; j < clusters.length; j++) {
      if (used.has(j)) continue

      // Count shared entities
      let sharedCount = 0
      for (const entity of baseEntities) {
        if (clusterEntities[j].has(entity)) {
          sharedCount++
        }
      }

      if (sharedCount >= minSharedEntities) {
        // Coherence gate: verify articles are actually about the same event
        const sim = crossClusterSimilarity(
          base.articleIds || [],
          clusters[j].articleIds || [],
          vecs,
          norms
        )
        if (sim < minCoherence) continue

        // Merge clusters
        base = {
          clusterTitle:
            (base.clusterTitle || '').length >= (clusters[j].clusterTitle || '').length
              ? base.clusterTitle
              : clusters[j].clusterTitle,
          articleIds: Array.from(
            new Set([...(base.articleIds || []), ...(clusters[j].articleIds || [])])
          ),
        }
        used.add(j)
      }
    }

    merged.push(base)
  }

  return merged
}

function dominantCategory(articles: Article[]): string | undefined {
  const freq = new Map<string, number>()
  for (const a of articles) {
    if (a?.category) freq.set(a.category, (freq.get(a.category) || 0) + 1)
  }
  let best: string | undefined
  let n = -1
  for (const [k, v] of freq) if (v > n) (best = k), (n = v)
  return best
}

function hoursBetween(a: string, b: string): number {
  try {
    const d = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 36e5
    return d
  } catch {
    return Infinity
  }
}

export function expandClusterMembership(
  allArticles: Article[],
  cluster: StoryCluster,
  opts: {
    simThreshold?: number
    maxAdd?: number
    timeWindowHours?: number
    categoryStrict?: boolean
  } = {}
): StoryCluster {
  const simThreshold = opts.simThreshold ?? parseFloat(process.env.CLUSTER_EXPAND_SIM || '0.42')
  const maxAdd = opts.maxAdd ?? parseInt(process.env.CLUSTER_EXPAND_MAX_ADD || '50', 10)
  const timeWindowHours =
    opts.timeWindowHours ?? parseInt(process.env.CLUSTER_EXPAND_TIME_HOURS || '168', 10)
  const categoryStrict =
    opts.categoryStrict ??
    (process.env.CLUSTER_EXPAND_CATEGORY_STRICT || 'false').toLowerCase() !== 'false'

  const idSet = new Set(cluster.articleIds)
  const members = allArticles.filter((a) => idSet.has(a.id))
  if (members.length === 0) return cluster

  const { vecs } = buildTfIdf(allArticles)
  // Build centroid of current members
  const centroid: Vec = new Map()
  for (const m of members) {
    const vm = vecs.get(m.id)
    if (!vm) continue
    for (const [t, w] of vm) centroid.set(t, (centroid.get(t) || 0) + w)
  }

  // Determine filters
  const domCat = dominantCategory(members)
  // Compute time bounds (median window center = latest member date)
  const latest = members
    .map((m) => m.publishedAt)
    .sort()
    .slice(-1)[0]

  // Score candidates not already in cluster
  const candidates: { id: string; score: number }[] = []
  for (const a of allArticles) {
    if (idSet.has(a.id)) continue
    if (categoryStrict && domCat && a.category && a.category !== domCat) continue
    if (latest && a.publishedAt && hoursBetween(latest, a.publishedAt) > timeWindowHours) continue
    const v = vecs.get(a.id)
    if (!v) continue
    const s = centroidSim(centroid, v)
    if (s >= simThreshold) candidates.push({ id: a.id, score: s })
  }
  candidates.sort((a, b) => b.score - a.score)
  const toAdd = candidates.slice(0, maxAdd).map((c) => c.id)
  const articleIds = Array.from(new Set([...cluster.articleIds, ...toAdd]))
  return { ...cluster, articleIds }
}

// Expose private helpers for unit testing only
export const _testExports = {
  extractEntities,
  extractClusterEntities,
  crossClusterSimilarity,
  cosine,
  tokenize,
  jaccardSets,
}
