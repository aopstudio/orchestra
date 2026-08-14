/**
 * Sample-accurate metronome running on the audio clock.
 *
 * The metronome never uses setTimeout. Each beat is scheduled through the
 * LookaheadScheduler's queue; when the scheduler flushes a beat (≈100ms
 * before it sounds) the beat's chained callback schedules the next beat at
 * `audioTime + interval`. Tempo changes therefore take effect from the next
 * beat.
 *
 * The beat GRID is anchored to the server's clock: `syncToServer()` re-anchors
 * the grid at a server-derived audio time + beat-within-bar, so the accent
 * physically lands on the same wall-clock instant the server calls "beat 1".
 * A generation token invalidates any beats scheduled before a re-anchor, so a
 * meter switch re-syncs instantly instead of drifting with the old grid.
 */

import type { LookaheadScheduler } from './scheduler'

const ACCENT_FREQUENCY = 1600
const BEAT_FREQUENCY = 1000
const MIN_BPM = 1
const MIN_BEATS_PER_BAR = 1
const MAX_BEATS_PER_BAR = 16

/**
 * Pure scheduling calc: the next beat-boundary time at or after `nowSec`
 * given a `intervalSec` beat interval.
 */
export function nextBeatBoundary(nowSec: number, intervalSec: number): number {
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) return nowSec
  return Math.ceil(nowSec / intervalSec) * intervalSec
}

/** Clamp beats-per-bar to a sane meter range (mirrors the server's 1..16). */
function clampBeatsPerBar(value: number): number {
  if (!Number.isInteger(value) || value < MIN_BEATS_PER_BAR) return 4
  if (value > MAX_BEATS_PER_BAR) return MAX_BEATS_PER_BAR
  return value
}

/**
 * Pure phase calc: normalize a 0-based beat-within-bar position into [0, bpi).
 * The server grid is the authority; the metronome's accent must track it so
 * the accent lands on beat 1 of the bar the UI is displaying.
 */
export function normalizePhase(beatInBar: number, beatsPerBar: number): number {
  if (!Number.isFinite(beatInBar)) return 0
  const bpi = clampBeatsPerBar(beatsPerBar)
  return ((Math.floor(beatInBar) % bpi) + bpi) % bpi
}

export class Metronome {
  private readonly scheduler: LookaheadScheduler
  private bpm: number
  private beatsPerBar: number
  private running = false
  private beat = 0
  /** Bumped on every re-anchor; stale chains check it and stop themselves. */
  private generation = 0

  constructor(scheduler: LookaheadScheduler, bpm: number, beatsPerBar = 4) {
    this.scheduler = scheduler
    this.bpm = Math.max(MIN_BPM, bpm)
    this.beatsPerBar = clampBeatsPerBar(beatsPerBar)
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(MIN_BPM, bpm)
  }

  /** Time signature (beats per bar): the accent lands on beat 1 of each bar. */
  setBeatsPerBar(beatsPerBar: number): void {
    this.beatsPerBar = clampBeatsPerBar(beatsPerBar)
  }

  /**
   * Re-anchor the beat grid at `anchorAudioTime` (a server-derived instant on
   * the local audio clock) whose 0-based beat-within-bar is `beatInBar`.
   * Invalidates any beats already scheduled from the previous grid, so the
   * accent physically lands on the server's beat 1. If the anchor is already
   * in the past (clock latency), beats are advanced until the next future
   * instant, preserving the phase progression.
   */
  syncToServer(anchorAudioTime: number, beatInBar: number): void {
    this.beat = normalizePhase(beatInBar, this.beatsPerBar)
    this.generation += 1
    if (!this.running) return
    const interval = 60 / this.bpm
    let t = anchorAudioTime
    while (t < this.scheduler.currentTime + 0.02) {
      t += interval
      this.beat = (this.beat + 1) % this.beatsPerBar
    }
    this.scheduleBeat(t)
  }

  isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.beat = 0
    const interval = 60 / this.bpm
    this.scheduleBeat(nextBeatBoundary(this.scheduler.currentTime, interval))
  }

  stop(): void {
    this.running = false
  }

  private scheduleBeat(audioTime: number): void {
    // If a bpm change or a suspended/resumed context left the chained time
    // in the past, nudge onto a clean future boundary.
    if (audioTime < this.scheduler.currentTime - 0.05) {
      const interval = 60 / this.bpm
      audioTime = nextBeatBoundary(this.scheduler.currentTime, interval)
    }

    const gen = this.generation
    const accent = this.beat === 0
    this.beat = (this.beat + 1) % this.beatsPerBar
    this.scheduler.scheduleMetronome(audioTime, accent ? ACCENT_FREQUENCY : BEAT_FREQUENCY)

    // Self-reschedule on the audio clock: when this beat is flushed
    // (≈100ms before it sounds), chain the next beat. If the metronome has
    // been stopped or re-anchored in the meantime, the chain ends here.
    this.scheduler.scheduleCallback(audioTime, () => {
      if (!this.running || gen !== this.generation) return
      this.scheduleBeat(audioTime + 60 / this.bpm)
    })
  }
}
