import { dominantCategory, matchClustersToStories } from '../clusterPersist'

describe('matchClustersToStories', () => {
  it('reuses a story when overlap meets half of the smaller member set', () => {
    const assigned = matchClustersToStories(
      [{ index: 0, memberIds: ['a', 'b', 'c', 'd'] }],
      [{ id: 'st-1', memberIds: ['a', 'b'] }] // 2 shared / min(4, 2) = 1.0
    )
    expect(assigned.get(0)).toBe('st-1')
  })

  it('does not reuse a story below the overlap threshold', () => {
    const assigned = matchClustersToStories(
      [{ index: 0, memberIds: ['a', 'x', 'y'] }],
      [{ id: 'st-1', memberIds: ['a', 'b', 'c'] }] // 1 shared / 3 = 0.33
    )
    expect(assigned.size).toBe(0)
  })

  it('gives a contested story only to the best-overlap cluster', () => {
    const assigned = matchClustersToStories(
      [
        { index: 0, memberIds: ['a', 'b', 'x', 'y'] }, // 2/4 = 0.5
        { index: 1, memberIds: ['a', 'b', 'c', 'd'] }, // 4/4 = 1.0
      ],
      [{ id: 'st-1', memberIds: ['a', 'b', 'c', 'd'] }]
    )
    expect(assigned.get(1)).toBe('st-1')
    expect(assigned.has(0)).toBe(false)
  })

  it('pins the exact 0.5 threshold boundary', () => {
    // Exactly half the smaller set shared → reuse.
    const atBoundary = matchClustersToStories(
      [{ index: 0, memberIds: ['a', 'b', 'x', 'y'] }],
      [{ id: 'st-1', memberIds: ['a', 'b', 'c', 'd', 'e', 'f'] }] // 2 / min(4,6) = 0.5
    )
    expect(atBoundary.get(0)).toBe('st-1')
    // Just below → new story.
    const below = matchClustersToStories(
      [{ index: 0, memberIds: ['a', 'x', 'y', 'z'] }],
      [{ id: 'st-1', memberIds: ['a', 'b', 'c', 'd', 'e', 'f'] }] // 1 / 4 = 0.25
    )
    expect(below.size).toBe(0)
  })

  it('does not let a fully-contained fragment hijack a story from its true continuation', () => {
    // st-1 = {a..h}; the snapshot split the topic into a 2-article fragment
    // {a,b} (containment ratio 1.0) and the real continuation {c..h + 4 new}
    // (6 shared). Absolute shared count must win, or story identity churns
    // on every cluster split.
    const assigned = matchClustersToStories(
      [
        { index: 0, memberIds: ['a', 'b'] },
        { index: 1, memberIds: ['c', 'd', 'e', 'f', 'g', 'h', 'n1', 'n2', 'n3', 'n4'] },
      ],
      [{ id: 'st-1', memberIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }]
    )
    expect(assigned.get(1)).toBe('st-1')
    expect(assigned.has(0)).toBe(false)
  })

  it('routes overlapping snapshots to distinct stories by shared count then jaccard', () => {
    // Stories share members c,d (expandClusterMembership can duplicate an
    // article across clusters). The bigger continuation must take st-1 and
    // the small cluster settles on st-2 — no cross-hijack.
    const assigned = matchClustersToStories(
      [
        { index: 0, memberIds: ['c', 'd'] },
        { index: 1, memberIds: ['a', 'b', 'c', 'd', 'x'] },
      ],
      [
        { id: 'st-1', memberIds: ['a', 'b', 'c', 'd'] },
        { id: 'st-2', memberIds: ['c', 'd', 'e', 'f'] },
      ]
    )
    expect(assigned.get(1)).toBe('st-1')
    expect(assigned.get(0)).toBe('st-2')
  })

  it('never assigns one incoming cluster to two stories', () => {
    const assigned = matchClustersToStories(
      [{ index: 0, memberIds: ['a', 'b'] }],
      [
        { id: 'st-1', memberIds: ['a', 'b'] },
        { id: 'st-2', memberIds: ['a', 'b', 'c'] },
      ]
    )
    expect(assigned.size).toBe(1)
    expect(assigned.get(0)).toBe('st-1') // tie broken toward the older story id
  })

  it('matches a re-run snapshot back to its own stories (idempotence)', () => {
    // Run 1 wrote st-1 and st-2; the identical snapshot must map 1:1 onto them.
    const assigned = matchClustersToStories(
      [
        { index: 0, memberIds: ['a', 'b', 'c'] },
        { index: 1, memberIds: ['c', 'd', 'e'] },
      ],
      [
        { id: 'st-1', memberIds: ['a', 'b', 'c'] },
        { id: 'st-2', memberIds: ['c', 'd', 'e'] },
      ]
    )
    expect(assigned.get(0)).toBe('st-1')
    expect(assigned.get(1)).toBe('st-2')
  })

  it('breaks story-id ties numerically, not lexically', () => {
    const assigned = matchClustersToStories(
      [{ index: 0, memberIds: ['a', 'b'] }],
      [
        { id: 'st-10', memberIds: ['a', 'b'] },
        { id: 'st-9', memberIds: ['a', 'b'] },
      ]
    )
    expect(assigned.get(0)).toBe('st-9')
  })

  it('ignores stories and clusters with empty member sets', () => {
    const assigned = matchClustersToStories(
      [{ index: 0, memberIds: [] }],
      [{ id: 'st-1', memberIds: [] }]
    )
    expect(assigned.size).toBe(0)
  })
})

describe('dominantCategory', () => {
  it('picks the most common category', () => {
    expect(dominantCategory(['World News', 'Tech', 'World News'])).toBe('World News')
  })

  it('breaks ties alphabetically', () => {
    expect(dominantCategory(['Tech', 'Business'])).toBe('Business')
  })

  it('ignores missing categories and returns null when none exist', () => {
    expect(dominantCategory(['Tech', undefined, null, 'Tech'])).toBe('Tech')
    expect(dominantCategory([undefined, null])).toBeNull()
  })
})
