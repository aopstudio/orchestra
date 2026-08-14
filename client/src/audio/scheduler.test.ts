import { describe, expect, it } from 'vitest'
import { countDueEvents, type SchedulerEvent } from './scheduler'
import { nextBeatBoundary, normalizePhase } from './metronome'

function ev(audioTime: number): SchedulerEvent {
  return { audioTime, callback: () => undefined }
}

describe('countDueEvents', () => {
  it('counts the head prefix whose audioTime is at or before the horizon', () => {
    const events = [ev(0.1), ev(0.2), ev(0.3), ev(0.5)]
    expect(countDueEvents(events, 0.25)).toBe(2)
    expect(countDueEvents(events, 0.3)).toBe(3)
    expect(countDueEvents(events, 0.499)).toBe(3)
  })

  it('includes events exactly on the horizon', () => {
    expect(countDueEvents([ev(0.5)], 0.5)).toBe(1)
  })

  it('returns 0 for an empty queue', () => {
    expect(countDueEvents([], 10)).toBe(0)
  })

  it('returns 0 when nothing is due', () => {
    expect(countDueEvents([ev(1), ev(2)], 0.5)).toBe(0)
  })

  it('stops at the first not-yet-due event even if a later one is due', () => {
    const events = [ev(1), ev(2), ev(0.1)]
    expect(countDueEvents(events, 1.5)).toBe(1)
  })
})

describe('nextBeatBoundary', () => {
  it('rounds up to the next beat boundary', () => {
    expect(nextBeatBoundary(0.1, 0.5)).toBe(0.5)
    expect(nextBeatBoundary(1.234, 0.5)).toBe(1.5)
  })

  it('returns the exact time when already on a boundary', () => {
    expect(nextBeatBoundary(0.5, 0.5)).toBe(0.5)
  })

  it('returns now for a non-positive interval', () => {
    expect(nextBeatBoundary(0.5, 0)).toBe(0.5)
  })
})

describe('normalizePhase', () => {
  it('keeps a valid 0-based beat-within-bar in [0, bpi)', () => {
    expect(normalizePhase(0, 4)).toBe(0)
    expect(normalizePhase(2, 4)).toBe(2)
    expect(normalizePhase(3, 4)).toBe(3)
  })

  it('wraps a beat index beyond bpi back into the bar', () => {
    expect(normalizePhase(4, 4)).toBe(0)
    expect(normalizePhase(7, 4)).toBe(3)
    expect(normalizePhase(-1, 4)).toBe(3)
  })

  it('normalizes a fractional server beat to its current in-bar position', () => {
    // floor(187.2) = 187; 187 % 3 = 1 (3/4 meter)
    expect(normalizePhase(187.2, 3)).toBe(1)
  })

  it('treats non-finite input as phase 0', () => {
    expect(normalizePhase(Number.NaN, 4)).toBe(0)
  })
})
