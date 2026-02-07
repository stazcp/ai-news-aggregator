# Narrative Intelligence — Revised Execution Plan (v2)

This document defines the **pragmatic path** from current state → ship-worthy product.

**Status:** Working news aggregator with AI clustering, but only 11 sources per top story. Need 50+ sources for narrative divergence to be meaningful.

---

## Current State Assessment

### What Works ✅

- 88 RSS feeds aggregating news
- TF-IDF + LLM clustering pipeline
- AI summaries via Groq
- Modern React/Next.js UI
- Caching infrastructure

### Critical Gap ❌

- **Only 11 sources per top story** (need 50+ for Ground News-level diversity)
- **Low article limits** (100 total, 5 per feed)
- **TF-IDF misses paraphrases** ("stocks plunge" ≠ "bad day for wallet")
- No divergence detection (core differentiator)

---

## Phase 0: Clustering Foundation (MUST DO FIRST)

**Problem:** Can't detect narrative divergence with only 11 sources. Need 50+ sources per story.

**Timeline:** 2 weeks  
**Cost:** $0.60/month (saves money vs current $1.50/month!)

### Week 1: Entity-Enhanced Clustering

**Goal:** 11 → 40 sources per story

**Implementation:**

1. **Add Entity Extraction** (`textCluster.ts`)

   - Extract: market indices, companies, people, locations, money amounts
   - Weight entity overlap 30% in similarity scoring
   - Cost: $0 (regex + dictionaries)
   - Time: 4-6 hours

2. **Increase Feed Limits**
   NEWS_GLOBAL_LIMIT=2000 # Up from 100
   FEED_ITEMS_PER_FEED=15 # Up from 5
   PRECLUSTER_THRESHOLD=0.35 # Down from 0.42 3. **Add More RSS Feeds**
   - Google News topic feeds (10 feeds → instant 1000s of sources)
   - Regional outlets (20 feeds)
   - International coverage (20 feeds)
   - Target: 150+ feeds

**Deliverable:** Top stories have 30-50 sources

---

### Week 2: Semantic Clustering

**Goal:** 40 → 70+ sources per story

**Implementation:**

Use `@xenova/transformers` for BERT-level semantic matching:

import { pipeline } from '@xenova/transformers'

// Downloads 80MB model once, then free forever
const embedder = await pipeline(
'feature-extraction',
'Xenova/all-MiniLM-L6-v2'
)

// Hybrid approach: TF-IDF + Entities + Embeddings
function computeHybridSimilarity(articleA, articleB) {
return (
tfidfSimilarity(articleA, articleB) _ 0.30 +
entityOverlap(articleA, articleB) _ 0.30 +
embeddingSimilarity(articleA, articleB) \* 0.40
)
}**Cost:** $0/month (runs on your server)  
**Speed:** Adds 15 seconds to clustering  
**Quality:** 90% of Google News

**Deliverable:** Top stories have 50-80+ sources

---

## Phase 1: Reality Snapshot (P0 — Ship Blocking)

**Prerequisite:** ✅ Phase 0 complete (50+ sources per story)

**Timeline:** 3 weeks  
**Cost:** $2-3/month

### Core Concept

Generate **two separate outputs** per cluster:

1. **Reality Snapshot:** Facts supported by majority of sources
2. **Notable Divergences:** How minority sources differ

### Implementation

#### 1. Source Attribution Mapping

interface SnapshotBullet {
fact: string
supportingSources: string[] // ["BBC", "Reuters", "NYT"]
sourceCount: number
minorityView?: string // If 20-40% disagree
}

interface ClusterSnapshot {
whatHappened: SnapshotBullet[]
whatChanged: SnapshotBullet[]
whyItMatters: SnapshotBullet // Max 1
}#### 2. Modified LLM Prompt (Single Call)

async function generateSnapshotAndDivergences(cluster: StoryCluster) {
const prompt = `
Analyze these ${cluster.articles.length} articles about the same event.

Output JSON with:
{
"snapshot": {
"whatHappened": ["fact 1", "fact 2"],
"whatChanged": ["change 1"],
"whyItMatters": "impact"
},
"divergences": [
{
"type": "emphasis" | "omission" | "framing",
"description": "2 sentence explanation",
"sourceA": ["outlet1", "outlet2"],
"sourceB": ["outlet3", "outlet4"]
}
]
}

Rules:

- Snapshot: ONLY facts present in 50%+ of distinct sources
- No speculation, predictions, or advice
- Divergences: max 3, must be meaningful
- Link every claim to specific sources
  `
  // Use Groq's llama-3.3-70b-versatile
  return await groq.chat.completions.create({...})
  }**Cost:** 1 call per cluster × top 20 clusters = ~$0.10/day

---

#### 3. Structural Pre-Divergence Detection

Before LLM, use deterministic signals:

interface DivergenceCandidate {
type: 'emphasis' | 'omission' | 'framing' | 'timeline'
groupA: Article[]
groupB: Article[]
signal: string // What triggered detection
}

function detectDivergenceCandidates(cluster: StoryCluster): DivergenceCandidate[] {
// Emphasis: entity frequency differences
const leftSources = cluster.articles.filter(a => a.bias === 'left')
const rightSources = cluster.articles.filter(a => a.bias === 'right')

const leftEntities = countEntities(leftSources)
const rightEntities = countEntities(rightSources)

// Example: Left mentions "climate" 50x, right mentions 5x
if (leftEntities.climate / rightEntities.climate > 5) {
candidates.push({
type: 'emphasis',
groupA: leftSources,
groupB: rightSources,
signal: 'climate emphasis divergence'
})
}

// Omission: facts in groupA not in groupB
// Framing: same verbs used differently ("announced" vs "claimed")
// etc.

return candidates
}---

### UI Changes

**Cluster Page Structure:**

---

## Missing Features: POC → Product

Features not yet planned that are required to move from proof-of-concept to a product with real user value and defensibility.

### 1. Coverage Blindspot Detection

Surface which outlets are **not** covering a story. "45 outlets covered this; Fox News, MSNBC, and RT did not." Missing coverage is as revealing as divergent coverage and falls directly out of existing cluster data.

### 2. Story Continuity / Timeline Persistence

Currently every refresh is a stateless snapshot. Stories evolve over days/weeks. Need:

- Story identity persistence across refreshes (stable IDs)
- Timeline of how a narrative evolved ("first reported by X, then picked up by Y")
- "What changed since you last checked"
- Requires a database layer (not just Redis cache)

### 3. Individual Story Pages (SEO + Shareability)

Only `/` exists today — no `/story/:id` route. Without this:

- No organic search traffic (stories aren't indexable)
- No social sharing ("look how differently this was covered")
- No deep-linking into specific divergences
- No OG meta cards for social platforms

Shareable divergence visualizations are the best viral loop for organic growth.

### 4. User Accounts & Persistence

No auth, no profiles, no state. For retention:

- Topic/source preferences
- Reading history / "already seen" markers
- Bookmarks or saved stories
- Email digest (weekly "biggest divergences")

### 5. Divergence Scoring / Quantification

Phase 1 describes finding divergences but doesn't quantify them. A numeric "consensus score" or "divergence index" per story would:

- Enable sorting/filtering by controversy level
- Power alerts ("this story just spiked in divergence")
- Create a unique data asset over time

### 6. Comparison View

Side-by-side view of how 2-3 specific outlets covered the same event. Clustering already groups the articles — the UI just needs to let users pick outlets and compare language, framing, and omissions directly.

### 7. Historical Archive & Pattern Detection

Everything is currently ephemeral (12-hour cache). Over time, "Outlet X has omitted climate context in 73% of energy stories" is a powerful insight. Requires:

- Persistent storage (PostgreSQL or similar, not Redis)
- Story deduplication across time windows
- Aggregate analytics per source
- This is where the compounding data moat lives — historical divergence patterns can't be replicated by a new entrant

### 8. Mobile / PWA / Push Notifications

News is mobile-first. At minimum:

- PWA with offline support and responsive design
- Push notifications for "narrative divergence spikes"
- Breaking story alerts

### 9. Monetization Infrastructure

No pricing tiers, payment system, or free/paid boundary. Natural split:

- **Free:** Reality Snapshots, basic clustering
- **Paid:** Full divergence analysis, historical patterns, API access, alerts, comparison view

### 10. Source Bias Classification System

Phase 1 references `a.bias === 'left'` but no bias classification exists. Options:

- Integrate AllSides / Ad Fontes / MBFC ratings
- Build proprietary classification via LLM
- TBD — needs more research before committing to an approach

---

## MOAT Layers (What Compounds Over Time)

| Layer | Status | Dependency |
|-------|--------|------------|
| Proprietary divergence algorithm | Spec'd (Phase 1), not built | Phase 0 complete |
| Historical divergence data | No persistence layer | Database, not cache |
| Coverage blindspot detection | Not started | Cluster data (available now) |
| Shareable story pages | No `/story/:id` route | SEO + OG cards |
| User network effects | No users | Accounts + contributions |
