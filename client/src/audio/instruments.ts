/**
 * Instrument wrappers around smplr (sampled piano + TR-808 drums) with a
 * built-in WebAudio oscillator fallback so the demo ALWAYS makes sound.
 *
 * smplr v1 API notes (verified against node_modules/smplr@1.0.0):
 * - `Soundfont` and `DrumMachine` are callable factories, not classes:
 *   `Soundfont(ctx, opts)` / `DrumMachine(ctx, opts)` — no `new`.
 * - Both expose `ready: Promise<void>` and `start(NoteEvent): StopFn`.
 * - `NoteEvent = { note: string | number; velocity?: number; time?: number;
 *   duration?: number; ... }` — `time` is an ABSOLUTE AudioContext time in
 *   seconds (defaults to currentTime), `duration` is seconds.
 * - `DrumMachine` maps TR-808 samples sequentially from MIDI 36, which does
 *   NOT match the GM drum map. It accepts group aliases ("kick", "snare",
 *   ...), so GM notes 35–51 are translated to the closest TR-808 group.
 *
 * smplr loads samples from a CDN; every construction and start() call is
 * wrapped so a blocked/offline CDN falls back to the internal synth instead
 * of killing the demo.
 */

import { Soundfont, DrumMachine } from 'smplr'

export interface Instruments {
  /** Play a note (MIDI 0–127) at `ctx.currentTime + at` seconds. */
  piano(note: number, velocity: number, at: number): void
  /** Play a GM drum note (35–51) at `ctx.currentTime + at` seconds. */
  drum(note: number, velocity: number, at: number): void
}

const LOAD_TIMEOUT_MS = 10_000
const PIANO_DURATION = 1.5

/** GM drum notes (35–51) → closest TR-808 group alias. */
const GM_DRUM_TO_808: Record<number, string> = {
  35: 'kick', // Acoustic Bass Drum
  36: 'kick', // Bass Drum 1
  37: 'rimshot', // Side Stick
  38: 'snare', // Acoustic Snare
  39: 'clap', // Hand Clap
  40: 'snare', // Electric Snare
  41: 'tom-low', // Low Floor Tom
  42: 'hihat-close', // Closed Hi-Hat
  43: 'tom-low', // High Floor Tom
  44: 'hihat-close', // Pedal Hi-Hat
  45: 'mid-tom', // Low Tom
  46: 'hihat-open', // Open Hi-Hat
  47: 'mid-tom', // Low-Mid Tom
  48: 'tom-hi', // Hi-Mid Tom
  49: 'cymbal', // Crash Cymbal 1
  50: 'tom-hi', // High Tom
  51: 'cowbell', // Ride Cymbal 1 (808 cowbell as nearest metallic one-shot)
}

/**
 * Await an instrument's `ready` promise, treating both rejection and a
 * hanging CDN (timeout) as "not available" so the fallback kicks in.
 */
function awaitReady(ready: Promise<void>, label: string): Promise<boolean> {
  const settled = ready.then(
    () => true,
    (err: unknown) => {
      console.warn(`${label} failed to load (using oscillator fallback):`, err)
      return false
    },
  )
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`${label} load timed out after ${LOAD_TIMEOUT_MS}ms (using oscillator fallback)`)
      resolve(false)
    }, LOAD_TIMEOUT_MS)
    void settled.then((ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
  })
}

export async function createInstruments(ctx: AudioContext): Promise<Instruments> {
  let piano: ReturnType<typeof Soundfont> | null = null
  try {
    const inst = Soundfont(ctx, { instrument: 'acoustic_grand_piano' })
    if (await awaitReady(inst.ready, 'Soundfont piano')) {
      piano = inst
    }
  } catch (err) {
    console.warn('Soundfont piano unavailable (using oscillator fallback):', err)
  }

  let drums: ReturnType<typeof DrumMachine> | null = null
  try {
    const inst = DrumMachine(ctx, { instrument: 'TR-808' })
    if (await awaitReady(inst.ready, 'DrumMachine TR-808')) {
      drums = inst
    }
  } catch (err) {
    console.warn('DrumMachine TR-808 unavailable (using oscillator fallback):', err)
  }

  return {
    piano(note, velocity, at) {
      const time = ctx.currentTime + at
      if (piano !== null) {
        try {
          piano.start({ note, velocity, time, duration: PIANO_DURATION })
          return
        } catch (err) {
          console.warn('Soundfont piano start failed (switching to fallback):', err)
          piano = null
        }
      }
      fallbackPiano(ctx, note, velocity, time)
    },
    drum(note, velocity, at) {
      const time = ctx.currentTime + at
      if (drums !== null) {
        try {
          const target = GM_DRUM_TO_808[note] ?? note
          drums.start({ note: target, velocity, time })
          return
        } catch (err) {
          console.warn('DrumMachine start failed (switching to fallback):', err)
          drums = null
        }
      }
      fallbackDrum(ctx, note, velocity, time)
    },
  }
}

// ---------------------------------------------------------------------------
// Internal oscillator-based fallback synth
// ---------------------------------------------------------------------------

function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

interface ToneOptions {
  type: OscillatorType
  frequency: number
  /** Optional exponential sweep target; creates a pitch drop (kick/tom). */
  freqEnd?: number
  at: number
  duration: number
  peak: number
}

/** Oscillator + gain envelope (attack ~5ms, exponential decay). */
function playTone(ctx: AudioContext, opts: ToneOptions): void {
  if (ctx.state === 'closed') return
  const t0 = Math.max(opts.at, ctx.currentTime)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = opts.type
  osc.frequency.setValueAtTime(opts.frequency, t0)
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(opts.freqEnd, 1), t0 + opts.duration)
  }
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(opts.peak, t0 + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + opts.duration + 0.05)
}

interface NoiseOptions {
  at: number
  duration: number
  peak: number
  filterType: BiquadFilterType
  filterFreq: number
}

/** Shared white-noise buffer, regenerated only if the sample rate changes. */
let noiseBuffer: AudioBuffer | null = null

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer === null || noiseBuffer.sampleRate !== ctx.sampleRate) {
    const length = Math.ceil(ctx.sampleRate * 0.5)
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1
    }
  }
  return noiseBuffer
}

/** Filtered noise burst (hats, snare, clap, cymbals). */
function playNoise(ctx: AudioContext, opts: NoiseOptions): void {
  if (ctx.state === 'closed') return
  const t0 = Math.max(opts.at, ctx.currentTime)
  const source = ctx.createBufferSource()
  source.buffer = getNoiseBuffer(ctx)
  source.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = opts.filterType
  filter.frequency.value = opts.filterFreq
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(opts.peak, t0 + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  source.start(t0)
  source.stop(t0 + opts.duration + 0.05)
}

function fallbackPiano(ctx: AudioContext, note: number, velocity: number, at: number): void {
  const vel = velocity / 127
  const freq = midiToFrequency(note)
  playTone(ctx, {
    type: 'triangle',
    frequency: freq,
    at,
    duration: 1.0,
    peak: 0.25 * vel,
  })
  // Subtle octave harmonic for a slightly richer tone.
  playTone(ctx, {
    type: 'sawtooth',
    frequency: freq * 2.001,
    at,
    duration: 0.6,
    peak: 0.07 * vel,
  })
}

function fallbackDrum(ctx: AudioContext, note: number, velocity: number, at: number): void {
  const vel = velocity / 127
  switch (note) {
    case 35:
    case 36: // kick: sine with 150→50Hz pitch drop
      playTone(ctx, {
        type: 'sine',
        frequency: 150,
        freqEnd: 50,
        at,
        duration: 0.4,
        peak: 0.8 * vel,
      })
      break
    case 37: // rimshot: short highpassed click
      playNoise(ctx, {
        at,
        duration: 0.08,
        peak: 0.4 * vel,
        filterType: 'highpass',
        filterFreq: 2000,
      })
      break
    case 38:
    case 40: // snare: tonal body + bandpassed noise
      playTone(ctx, { type: 'triangle', frequency: 180, at, duration: 0.15, peak: 0.3 * vel })
      playNoise(ctx, {
        at,
        duration: 0.18,
        peak: 0.5 * vel,
        filterType: 'bandpass',
        filterFreq: 1800,
      })
      break
    case 39: // clap
      playNoise(ctx, {
        at,
        duration: 0.25,
        peak: 0.5 * vel,
        filterType: 'bandpass',
        filterFreq: 1200,
      })
      break
    case 42:
    case 44: // closed hat
      playNoise(ctx, {
        at,
        duration: 0.05,
        peak: 0.4 * vel,
        filterType: 'highpass',
        filterFreq: 6000,
      })
      break
    case 46: // open hat
      playNoise(ctx, {
        at,
        duration: 0.25,
        peak: 0.4 * vel,
        filterType: 'highpass',
        filterFreq: 6000,
      })
      break
    case 41:
    case 43:
    case 45:
    case 47: // mid/low tom
      playTone(ctx, {
        type: 'sine',
        frequency: 120,
        freqEnd: 60,
        at,
        duration: 0.3,
        peak: 0.6 * vel,
      })
      break
    case 48:
    case 50: // high tom
      playTone(ctx, {
        type: 'sine',
        frequency: 180,
        freqEnd: 90,
        at,
        duration: 0.25,
        peak: 0.6 * vel,
      })
      break
    case 49: // crash
      playNoise(ctx, {
        at,
        duration: 0.8,
        peak: 0.35 * vel,
        filterType: 'highpass',
        filterFreq: 4000,
      })
      break
    case 51: // cowbell
      playTone(ctx, { type: 'square', frequency: 800, at, duration: 0.3, peak: 0.25 * vel })
      break
    default: // any other GM note: generic bandpassed click
      playNoise(ctx, {
        at,
        duration: 0.1,
        peak: 0.3 * vel,
        filterType: 'bandpass',
        filterFreq: 2500,
      })
  }
}
