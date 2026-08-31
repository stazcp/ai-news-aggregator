import { selectDigestCategories, selectStoriesForSummary, SummaryCandidate } from '../storySummaries'

// Keep the test hermetic: never construct the real Groq client (which needs
// GROQ_API_KEY at module load) or touch the network.
jest.mock('@/lib/ai/groq', () => ({
  summarizeCluster: jest.fn(),
  summarizeCategoryDigest: jest.fn(),
}))

function candidate(overrides: Partial<SummaryCandidate> & { id: string }): SummaryCandidate {
  return {
    score: 0,
    summary: null,
    summaryArticleCount: null,
    memberCount: 3,
    category: null,
    ...overrides,
  }
}

describe('selectStoriesForSummary', () => {
  it('selects stories with no summary yet, best score first', () => {
    const picked = selectStoriesForSummary([
      candidate({ id: 'st-1', score: 1 }),
      candidate({ id: 'st-2', score: 5 }),
      candidate({ id: 'st-3', score: 3 }),
    ])
    expect(picked).toEqual(['st-2', 'st-3', 'st-1'])
  })

  it('skips summarized stories that have not grown materially', () => {
    const picked = selectStoriesForSummary([
      candidate({ id: 'st-1', summary: 'done', summaryArticleCount: 4, memberCount: 5 }),
    ])
    expect(picked).toEqual([])
  })

  it('reselects a summarized story once membership reaches 1.5x the summarized count', () => {
    const picked = selectStoriesForSummary([
      candidate({ id: 'st-1', summary: 'done', summaryArticleCount: 4, memberCount: 6 }),
      candidate({ id: 'st-2', summary: 'done', summaryArticleCount: 4, memberCount: 5 }),
    ])
    expect(picked).toEqual(['st-1'])
  })

  it('caps the selection at the per-run limit', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      candidate({ id: `st-${i + 1}`, score: 30 - i })
    )
    expect(selectStoriesForSummary(many)).toHaveLength(20)
  })

  it('breaks equal scores by numeric story id for determinism', () => {
    const picked = selectStoriesForSummary([
      candidate({ id: 'st-10', score: 2 }),
      candidate({ id: 'st-9', score: 2 }),
    ])
    expect(picked).toEqual(['st-9', 'st-10'])
  })
})

describe('selectDigestCategories', () => {
  it('ranks categories by story count, then best score, then name', () => {
    const picked = selectDigestCategories([
      { category: 'Tech', score: 1 },
      { category: 'Tech', score: 2 },
      { category: 'World News', score: 9 },
      { category: 'Business', score: 4 },
    ])
    expect(picked).toEqual(['Tech', 'World News', 'Business'])
  })

  it('ignores stories without a category and caps at the limit', () => {
    const stories = [
      { category: null, score: 99 },
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((category) => ({ category, score: 1 })),
    ]
    const picked = selectDigestCategories(stories)
    expect(picked).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })
})
