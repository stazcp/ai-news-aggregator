/**
 * @jest-environment jsdom
 */

import { applyJitter, getBackoffInterval, getIdleInterval } from '../utils'

describe('use-refresh-status utils', () => {
  const originalRandom = Math.random

  beforeEach(() => {
    // Make jitter deterministic (Math.random() returns 0.5 → no delta)
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    ;(Math.random as jest.Mock).mockRestore()
  })

  describe('applyJitter', () => {
    it('returns the base interval when Math.random() is 0.5', () => {
      expect(applyJitter(10_000)).toBe(10_000)
    })

    it('never goes below 1 second even with negative jitter', () => {
      ;(Math.random as jest.Mock).mockReturnValue(0) // Max negative jitter
      expect(applyJitter(500)).toBe(1000)
    })
  })

  describe('getBackoffInterval', () => {
    it('doubles each attempt until hitting the max', () => {
      expect(getBackoffInterval(1, { baseMs: 5_000, maxMs: 60_000 })).toBe(5_000)
      expect(getBackoffInterval(2, { baseMs: 5_000, maxMs: 60_000 })).toBe(10_000)
      expect(getBackoffInterval(3, { baseMs: 5_000, maxMs: 60_000 })).toBe(20_000)
      expect(getBackoffInterval(5, { baseMs: 5_000, maxMs: 60_000 })).toBe(60_000) // capped
      expect(getBackoffInterval(10, { baseMs: 5_000, maxMs: 60_000 })).toBe(60_000) // stays capped
    })
  })

  describe('getIdleInterval', () => {
    it('uses slower polling when not enabled (user has data)', () => {
      // cache age < 60 minutes
      expect(getIdleInterval(30, { enabled: false })).toBe(30 * 60 * 1000)
      // cache age between 5 and 5.5 hours
      expect(getIdleInterval(320, { enabled: false })).toBe(5 * 60 * 1000)
      // cache age > 6 hours
      expect(getIdleInterval(400, { enabled: false })).toBe(60 * 1000)
    })

    it('uses faster polling when enabled (user waiting)', () => {
      expect(getIdleInterval(30, { enabled: true })).toBe(15 * 60 * 1000)
      expect(getIdleInterval(320, { enabled: true })).toBe(2 * 60 * 1000)
      expect(getIdleInterval(400, { enabled: true })).toBe(30 * 1000)
    })
  })
})
