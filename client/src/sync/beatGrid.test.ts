import { describe, expect, it } from 'vitest'
import { createBeatGrid } from './beatGrid'

describe('createBeatGrid', () => {
  it('toAudioTime maps a future server time to audio-clock seconds', () => {
    const grid = createBeatGrid({
      offset: 100, // unused by toAudioTime: serverNow is already in the server-clock domain
      ctxNow: () => 1.0,
      serverNow: () => 1100,
      bpm: 120,
      bpi: 4,
    })

    // audio = ctxNow + (serverTime - serverNow) / 1000
    expect(grid.toAudioTime(1200)).toBe(1.1)
    expect(grid.toAudioTime(1000)).toBe(0.9)
  })

  it('quantize snaps a beat to the nearest quantum boundary', () => {
    const grid = createBeatGrid({
      offset: 0,
      ctxNow: () => 0,
      serverNow: () => 0,
      bpm: 120,
      bpi: 4,
    })

    // Spec contract: 4.3 stays at boundary 4, 4.6 rounds up to 8, 8.0 is exact.
    expect(grid.quantize(4.3, 4)).toBe(4)
    expect(grid.quantize(4.6, 4)).toBe(8)
    expect(grid.quantize(8.0, 4)).toBe(8)
    expect(grid.quantize(0, 4)).toBe(0)
  })

  it('beatOfServerTime converts server milliseconds to fractional beats from beat 0', () => {
    const grid = createBeatGrid({
      offset: 0,
      ctxNow: () => 0,
      serverNow: () => 0,
      bpm: 120,
      bpi: 4,
    })

    // intervalMs = bpi / (bpm / 60) * 1000 = 4 / 2 * 1000 = 2000ms per bar of 4 beats
    expect(grid.beatOfServerTime(2000)).toBe(4)
    expect(grid.beatOfServerTime(2500)).toBe(5)
    expect(grid.beatOfServerTime(0)).toBe(0)
  })

  it('setTempo re-maps beats for the same server time (120 → 240 doubles the beat count)', () => {
    const grid = createBeatGrid({
      offset: 0,
      ctxNow: () => 0,
      serverNow: () => 0,
      bpm: 120,
      bpi: 4,
    })

    // intervalMs = 4 / (120/60) * 1000 = 2000ms per bar of 4 beats
    expect(grid.beatOfServerTime(2000)).toBe(4)

    grid.setTempo(240)

    // intervalMs = 4 / (240/60) * 1000 = 1000ms per bar of 4 beats
    expect(grid.beatOfServerTime(2000)).toBe(8)
  })

  it('setTempo ignores non-positive and non-finite bpm values', () => {
    const grid = createBeatGrid({
      offset: 0,
      ctxNow: () => 0,
      serverNow: () => 0,
      bpm: 120,
      bpi: 4,
    })

    grid.setTempo(0)
    expect(grid.beatOfServerTime(2000)).toBe(4)

    grid.setTempo(NaN)
    expect(grid.beatOfServerTime(2000)).toBe(4)

    grid.setTempo(Infinity)
    expect(grid.beatOfServerTime(2000)).toBe(4)
  })

  it('setTempo leaves toAudioTime and quantize untouched', () => {
    const grid = createBeatGrid({
      offset: 100, // unused by toAudioTime: serverNow is already in the server-clock domain
      ctxNow: () => 1.0,
      serverNow: () => 1100,
      bpm: 120,
      bpi: 4,
    })

    expect(grid.toAudioTime(1200)).toBe(1.1)
    expect(grid.quantize(4.3, 4)).toBe(4)

    grid.setTempo(240)

    expect(grid.toAudioTime(1200)).toBe(1.1)
    expect(grid.quantize(4.3, 4)).toBe(4)
  })
})
