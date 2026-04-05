import { cleanTitle } from '../groq'

describe('cleanTitle', () => {
  it('strips em-dash source suffix (Google News standard)', () => {
    expect(cleanTitle('Abrahamson-Henderson out as Georgia coach – Fox News')).toBe(
      'Abrahamson-Henderson out as Georgia coach'
    )
  })

  it('strips pipe source suffix', () => {
    expect(cleanTitle('India floods kill dozens | The Hindu')).toBe('India floods kill dozens')
  })

  it('strips complex source names', () => {
    expect(
      cleanTitle('Russia fires 286 drones at Ukraine – BBC News | World')
    ).toBe('Russia fires 286 drones at Ukraine')
  })

  it('does not strip em-dash when prefix is too short (structural use)', () => {
    // "US" is only 2 chars before the em-dash — structural, not a source suffix
    expect(cleanTitle('US – Iran talks')).toBe('US – Iran talks')
  })

  it('does not strip pipe when prefix is too short', () => {
    expect(cleanTitle('War | Peace')).toBe('War | Peace')
  })

  it('preserves titles with no source suffix', () => {
    expect(cleanTitle('Afghanistan floods leave 77 dead in 10 days')).toBe(
      'Afghanistan floods leave 77 dead in 10 days'
    )
  })

  it('handles empty string', () => {
    expect(cleanTitle('')).toBe('')
  })

  it('strips NYT newsletter-style suffix', () => {
    expect(cleanTitle('4/4: Saturday Morning – NYT > World News')).toBe('4/4: Saturday Morning')
  })

  it('strips Le Monde style suffix', () => {
    expect(
      cleanTitle("Plague Ships – International : Toute l'actualité sur Le Monde.fr")
    ).toBe('Plague Ships')
  })
})
