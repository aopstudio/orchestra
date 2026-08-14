import { describe, expect, it } from 'vitest'
import { createBeatClock } from './beatClock'

describe('createBeatClock', () => {
  it('intervalMs is bpi / (bpm/60) * 1000 → 2000ms for 120bpm, 4 beats per interval', () => {
    expect(createBeatClock(120, 4, () => 0).intervalMs).toBe(2000)
  })

  it('beatAt returns fractional beat = t / intervalMs * bpi → 0, 4, 5 at t=0/2000/2500 for 120/4', () => {
    const clock = createBeatClock(120, 4, () => 0)
    expect(clock.beatAt(0)).toBe(0)
    expect(clock.beatAt(2000)).toBe(4)
    expect(clock.beatAt(2500)).toBe(5)
  })

  it('now() delegates to the injected clock, tracking increasing values', () => {
    let t = 100
    const clock = createBeatClock(120, 4, () => t)
    expect(clock.now()).toBe(100)
    t = 400
    expect(clock.now()).toBe(400)
    t = 1200
    expect(clock.now()).toBe(1200)
  })

  it('setTempo keeps beat position continuous (no jump) and updates intervalMs', () => {
    let t = 0
    const clock = createBeatClock(120, 4, () => t)
    t = 5000
    const beatBefore = clock.beatAt(5000) // 120bpm: 5s → beat 10
    clock.setTempo(60) // halve speed from this moment
    expect(clock.bpm).toBe(60)
    expect(clock.intervalMs).toBe(4000) // 60bpm, 4 beats → 4s per interval
    expect(clock.beatAt(5000)).toBeCloseTo(beatBefore) // anchored, no jump
    // 120bpm at t=5000 → beat 10; at 60bpm, 2s later adds 2 beats
    expect(clock.beatAt(7000)).toBeCloseTo(beatBefore + 2)
  })

  it('setTempo ignores non-positive or non-finite values', () => {
    const clock = createBeatClock(120, 4, () => 0)
    clock.setTempo(0)
    expect(clock.bpm).toBe(120)
    clock.setTempo(-40)
    expect(clock.bpm).toBe(120)
    clock.setTempo(Number.NaN)
    expect(clock.bpm).toBe(120)
  })

  it('setBpi restarts the bar so the next beat is beat 1 of the new meter', () => {
    let t = 0
    const clock = createBeatClock(120, 4, () => t)
    t = 5000 // beat 10 at 120bpm/4bpi
    clock.setBpi(3)
    expect(clock.bpi).toBe(3)
    expect(clock.intervalMs).toBe(1500) // 120bpm, 3 beats → 1.5s per bar
    // Beat snaps forward to the next multiple of 3 (beat 12) — the new bar's
    // beat 1. 12 % 3 === 0 → the UI shows 1/3 and the metronome accents it.
    expect(clock.beatAt(5000)).toBe(12)
    // Half a second later (0.5s = 1 beat at 120bpm) we're on beat 13 = beat 2/3.
    expect(clock.beatAt(5500)).toBe(13)
  })

  it('setBpi when already on a bar boundary keeps the beat in place', () => {
    let t = 0
    const clock = createBeatClock(120, 4, () => t)
    t = 4000 // beat 8 (multiple of 4)
    clock.setBpi(4)
    expect(clock.beatAt(4000)).toBe(8) // already on a 4-boundary, no jump
  })

  it('setBpi ignores non-integer, <1, or >16 values', () => {
    const clock = createBeatClock(120, 4, () => 0)
    clock.setBpi(0)
    expect(clock.bpi).toBe(4)
    clock.setBpi(17)
    expect(clock.bpi).toBe(4)
    clock.setBpi(3.5)
    expect(clock.bpi).toBe(4)
  })
})
