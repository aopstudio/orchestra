/**
 * Lookahead audio scheduler (Chris Wilson pattern).
 *
 * A `setInterval` timer polls every 25ms; on each tick every queued event
 * whose `audioTime` falls within the next 100ms is flushed, and its
 * callback commits the sound to the audio graph (`oscillator` + `gain`
 * envelope) starting at the event's absolute audio-clock time. Giving the
 * graph 0–100ms of headroom before each note prevents glitches.
 *
 * The scheduler is intentionally dependency-free: it plays sounds itself
 * (osc/gain) and never imports smplr.
 *
 * Context state: if `ctx.state === 'suspended'`, the scheduler keeps
 * queueing and flushing (events are legal on a suspended context and sound
 * once the clock runs again). Resuming on a user gesture is the caller's
 * job — this class never calls `resume()`.
 */

/** A note to be scheduled: frequency in Hz, duration in seconds. */
export interface ScheduledNote {
  frequency: number
  duration: number
}

/** A queued scheduler event. */
export interface SchedulerEvent {
  /** Absolute AudioContext time (seconds) at which the event should sound. */
  audioTime: number
  callback: () => void
}

/**
 * Pure scheduling calc: how many events from the head of `events` are due
 * at or before `horizon`? The queue is flushed strictly in order, so the
 * scan stops at the first not-yet-due event. Extracted so it can be unit
 * tested without an AudioContext.
 */
export function countDueEvents(events: readonly SchedulerEvent[], horizon: number): number {
  let due = 0
  for (const event of events) {
    if (event.audioTime > horizon) break
    due += 1
  }
  return due
}

interface QueueEntry extends SchedulerEvent {
  /** Whether flushing this entry should fire the `onNote` observer. */
  notify: boolean
}

export class LookaheadScheduler {
  private static readonly INTERVAL_MS = 25
  private static readonly LOOKAHEAD_MS = 100
  private static readonly ATTACK_SEC = 0.005
  private static readonly NOTE_GAIN = 0.2
  private static readonly METRONOME_GAIN = 0.12

  private readonly ctx: AudioContext
  private readonly queue: QueueEntry[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private onNote: ((audioTime: number) => void) | null = null

  constructor(ctx: AudioContext) {
    this.ctx = ctx
  }

  /** Current audio-clock time in seconds. */
  get currentTime(): number {
    return this.ctx.currentTime
  }

  start(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => this.tick(), LookaheadScheduler.INTERVAL_MS)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    // Drop events that were queued but not yet committed to the graph.
    this.queue.length = 0
  }

  /** Queue a note; it will be committed to the graph when due within the lookahead window. */
  schedule(note: ScheduledNote, audioTime: number): void {
    this.push(
      audioTime,
      () => this.playTone(note.frequency, note.duration, audioTime, LookaheadScheduler.NOTE_GAIN),
      true,
    )
  }

  /**
   * Queue a short high-frequency metronome blip.
   * `frequency` is optional so callers can accent beats (default 1000Hz).
   */
  scheduleMetronome(audioTime: number, frequency = 1000): void {
    this.push(
      audioTime,
      () => this.playTone(frequency, 0.02, audioTime, LookaheadScheduler.METRONOME_GAIN),
      true,
    )
  }

  /**
   * Queue a raw callback at an audio time (used by the metronome to
   * self-reschedule on the audio clock). Never fires the `onNote` observer.
   */
  scheduleCallback(audioTime: number, callback: () => void): void {
    this.push(audioTime, callback, false)
  }

  setOnNote(cb: (audioTime: number) => void): void {
    this.onNote = cb
  }

  /**
   * Estimate input→output latency: convert the current audio-clock time to
   * the performance.now() timebase via `getOutputTimestamp()`, then return
   * `(outputPerfTime - keydownPerfTime)` in milliseconds. Returns null when
   * the browser cannot provide the timestamps (not yet rendering).
   */
  latencySince(keydownPerfTime: number): number | null {
    const { contextTime, performanceTime } = this.ctx.getOutputTimestamp()
    if (contextTime === undefined || performanceTime === undefined || performanceTime === 0) {
      return null
    }
    const outputPerfTimeMs = performanceTime + (this.ctx.currentTime - contextTime) * 1000
    return outputPerfTimeMs - keydownPerfTime
  }

  private tick(): void {
    // If suspended, currentTime is frozen so the horizon does not advance and
    // nothing is flushed — events simply stay queued until the context runs.
    const horizon = this.ctx.currentTime + LookaheadScheduler.LOOKAHEAD_MS / 1000
    const due = countDueEvents(this.queue, horizon)
    if (due === 0) return
    const flushed = this.queue.splice(0, due)
    for (const event of flushed) {
      event.callback()
      if (event.notify) this.onNote?.(event.audioTime)
    }
  }

  private push(audioTime: number, callback: () => void, notify: boolean): void {
    this.queue.push({ audioTime, callback, notify })
  }

  /** Commit a tone to the audio graph: osc + gain envelope (attack, decay). */
  private playTone(frequency: number, duration: number, audioTime: number, peakGain: number): void {
    const ctx = this.ctx
    if (ctx.state === 'closed') return
    // Never start in the past: if we flushed late, browsers clamp anyway.
    const t0 = Math.max(audioTime, ctx.currentTime)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(frequency, t0)
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(peakGain, t0 + LookaheadScheduler.ATTACK_SEC)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }
}
