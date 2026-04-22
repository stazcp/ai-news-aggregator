import { parseCategoryDigestSummary } from '../utils'

describe('parseCategoryDigestSummary', () => {
  it('parses structured JSON digests', () => {
    const digest = parseCategoryDigestSummary(
      JSON.stringify({
        lede: 'Global risk and policy pressure are setting the tone for the day.',
        takeaways: [
          'Conflict and central-bank tension are shaping the highest-signal clusters.',
          'Political and institutional fights remain a major secondary theme.',
        ],
      })
    )

    expect(digest.lede).toBe('Global risk and policy pressure are setting the tone for the day.')
    expect(digest.takeaways).toEqual([
      'Conflict and central-bank tension are shaping the highest-signal clusters.',
      'Political and institutional fights remain a major secondary theme.',
    ])
  })

  it('falls back cleanly for legacy plain-text summaries', () => {
    const digest = parseCategoryDigestSummary(
      'Risk and policy conflict are defining the day. Markets and geopolitics are driving attention. Domestic political fights remain active.'
    )

    expect(digest.lede).toBe('Risk and policy conflict are defining the day.')
    expect(digest.takeaways).toEqual([
      'Markets and geopolitics are driving attention.',
      'Domestic political fights remain active.',
    ])
  })
})
