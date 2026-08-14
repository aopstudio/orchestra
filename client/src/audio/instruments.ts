/**
 * Instrument wrappers around smplr (sampled piano / bass + TR-808 drums) with
 * a built-in WebAudio oscillator fallback so the demo ALWAYS makes sound.
 *
 * 延音语义(Phase 1 修正): 按下即响、**松开即止**——
 * - `play()` 返回一个停止函数,调用方(本地 noteOff / 远端 noteOff)松开时调用;
 *   期间持续延音(默认持续到 DEFAULT_SUSTAIN,防止漏放导致无限响)。
 * - 鼓等一击型乐器返回 null(一次性敲击,无需停止)。
 * - smplr 采样路径: `start()` 返回的 StopFn 即停止函数。
 * - 合成降级路径: 包络改为长持续 + 快速释放(增益归零,幂等)。
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
import type { InstrumentId } from '@orchestra/shared'

/** 停止函数: 幂等,松开音符时调用。 */
export type NoteStopFn = () => void

export interface Instruments {
  /**
   * 播放一个音。按住期间延音,松开时调用返回的停止函数;
   * 一击型(鼓)返回 null。`durationSec` 可覆盖默认持续时长(回放等用)。
   */
  play(
    instrument: InstrumentId,
    note: number,
    velocity: number,
    at: number,
    durationSec?: number,
  ): NoteStopFn | null
  /** 停止某乐器某音当前活动的声音(供 noteOff 使用)。 */
  stop(instrument: InstrumentId, note: number): void
  /** Play a GM drum note (35–51) at `ctx.currentTime + at` seconds. */
  drum(note: number, velocity: number, at: number): void
  /** 设置某乐器的混音音量(0..1,作用于所有本地与远端该乐器的声音)。 */
  setInstrumentVolume(instrument: InstrumentId, volume: number): void
}

const LOAD_TIMEOUT_MS = 10_000

/**
 * 衰减型乐器(钢琴/贝斯): 按下后自然指数衰减,即使不松手也会越来越轻;
 * 松手只是提前截断。NATURAL_RING 是按住时的自然响铃时长。
 */
const NATURAL_RING: Record<InstrumentId, number> = {
  piano: 2.5,
  bass: 1.2,
  drums: 0.4,
  trumpet: 0, // 持续型,不用
  violin: 0, // 持续型,不用
}

/** 持续型乐器(小号/提琴): 按住期间保持响度,松开才停止(延音上限兜底)。 */
const DEFAULT_SUSTAIN: Record<InstrumentId, number> = {
  piano: 0, // 衰减型,不用
  bass: 0, // 衰减型,不用
  drums: 0.4,
  trumpet: 1.2,
  violin: 4,
}

const DECAYING: ReadonlySet<InstrumentId> = new Set(['piano', 'bass'])

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

/** 通用 Soundfont 加载: 成功返回实例,失败/超时返回 null(不抛出)。
 *  `destination` 把该乐器的输出路由到混音总线,实现声部音量控制。
 *  `instrumentUrl` 指向自托管音源(同源加载,音色一致且不依赖外部 CDN)。 */
async function loadSoundfont(
  ctx: AudioContext,
  instrument: string,
  destination: AudioNode,
  instrumentUrl: string,
): Promise<ReturnType<typeof Soundfont> | null> {
  try {
    const inst = Soundfont(ctx, { instrument, instrumentUrl, destination })
    if (await awaitReady(inst.ready, `Soundfont ${instrument}`)) {
      return inst
    }
  } catch (err) {
    console.warn(`Soundfont ${instrument} unavailable (using oscillator fallback):`, err)
  }
  return null
}

/** 夹到 [0,1]。 */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

export async function createInstruments(ctx: AudioContext): Promise<Instruments> {
  // 混音总线: 每乐器一个增益 → 主增益 → 扬声器。声部音量滑块改的就是总线增益。
  const master = ctx.createGain()
  master.gain.value = 1
  master.connect(ctx.destination)
  const buses: Record<InstrumentId, GainNode> = {
    piano: ctx.createGain(),
    bass: ctx.createGain(),
    drums: ctx.createGain(),
    trumpet: ctx.createGain(),
    violin: ctx.createGain(),
  }
  for (const bus of Object.values(buses)) {
    bus.gain.value = 1
    bus.connect(master)
  }

  // 按需并行加载五个采样乐器;任一失败独立降级,不影响其他。
  // 音源自托管: 与页面同源,所有人听到一致的真实采样(见 scripts/fetch-soundfonts.sh)
  const sfUrl = (name: string): string => `/soundfonts/${name}-ogg.js`
  const [piano, bass, drums, trumpet, violin] = await Promise.all([
    loadSoundfont(ctx, 'acoustic_grand_piano', buses.piano, sfUrl('acoustic_grand_piano')),
    loadSoundfont(ctx, 'electric_bass_finger', buses.bass, sfUrl('electric_bass_finger')),
    (async () => {
      try {
        // 鼓机同样自托管(dm.json + 全部样本,见 fetch-soundfonts.sh);
        // smplr 会从 url 重写 baseUrl,样本解析为 /soundfonts/tr808/<group>/<name>.ogg
        const inst = DrumMachine(ctx, {
          instrument: 'TR-808',
          destination: buses.drums,
          url: '/soundfonts/tr808/dm.json',
        })
        if (await awaitReady(inst.ready, 'DrumMachine TR-808')) {
          return inst
        }
      } catch (err) {
        console.warn('DrumMachine TR-808 unavailable (using oscillator fallback):', err)
      }
      return null
    })(),
    loadSoundfont(ctx, 'muted_trumpet', buses.trumpet, sfUrl('muted_trumpet')),
    loadSoundfont(ctx, 'violin', buses.violin, sfUrl('violin')),
  ])

  type SoundfontInstance = ReturnType<typeof Soundfont>

  /** 采样路径: 返回 smplr 的 StopFn 作为停止函数。 */
  function startSampled(
    inst: SoundfontInstance,
    note: number,
    velocity: number,
    time: number,
    duration: number,
  ): NoteStopFn {
    return inst.start({ note, velocity, time, duration })
  }

  /** 当前活动声音: `${instrument}:${note}` → 停止函数。 */
  const activeVoices = new Map<string, NoteStopFn>()
  const voiceKey = (instrument: InstrumentId, note: number): string => `${instrument}:${note}`

  return {
    play(instrument, note, velocity, at, durationSec) {
      const time = ctx.currentTime + at
      const bus = buses[instrument]
      if (instrument === 'drums') {
        // 一击型,无延音/停止
        if (drums !== null) {
          try {
            const target = GM_DRUM_TO_808[note] ?? note
            drums.start({ note: target, velocity, time })
            return null
          } catch (err) {
            console.warn('DrumMachine start failed (switching to fallback):', err)
          }
        }
        fallbackDrum(ctx, note, velocity, time, bus)
        return null
      }

      const decaying = DECAYING.has(instrument)
      // 衰减型: 按住时按自然响铃时长发声(越来越轻);持续型: 按住保持响度
      const ring = durationSec ?? (decaying ? NATURAL_RING[instrument] : DEFAULT_SUSTAIN[instrument])
      const key = voiceKey(instrument, note)
      // 理论上同键不会重叠(受 held 去重保护);防御性停掉旧声音
      activeVoices.get(key)?.()

      let stop: NoteStopFn | null = null
      const sampled =
        instrument === 'bass'
          ? bass
          : instrument === 'trumpet'
            ? trumpet
            : instrument === 'violin'
              ? violin
              : piano
      if (sampled !== null) {
        try {
          // 采样路径: 衰减型给一个长上限(让采样自带的自然衰减完整播放),
          // 持续型按 ring 控制;显式 durationSec(回放)总是直接采用。
          const sampledDuration = durationSec !== undefined ? durationSec : decaying ? 8 : ring
          stop = startSampled(sampled, note, velocity, time, sampledDuration)
        } catch (err) {
          console.warn(`Soundfont ${instrument} start failed (switching to fallback):`, err)
          stop = null
        }
      }
      if (stop === null) {
        if (instrument === 'bass') {
          stop = fallbackBass(ctx, note, velocity, time, bus, ring)
        } else if (instrument === 'trumpet') {
          stop = fallbackTrumpet(ctx, note, velocity, time, bus, ring)
        } else if (instrument === 'violin') {
          stop = fallbackViolin(ctx, note, velocity, time, bus, ring)
        } else {
          stop = fallbackPiano(ctx, note, velocity, time, bus, ring)
        }
      }

      activeVoices.set(key, stop)
      return () => {
        stop()
        activeVoices.delete(key)
      }
    },

    stop(instrument, note) {
      const key = voiceKey(instrument, note)
      const s = activeVoices.get(key)
      if (s !== undefined) {
        s()
        activeVoices.delete(key)
      }
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
        }
      }
      fallbackDrum(ctx, note, velocity, time, buses.drums)
    },

    setInstrumentVolume(instrument, volume) {
      const clamped = clamp01(volume)
      // 平滑过渡,避免滑块拖动时爆音
      buses[instrument].gain.setTargetAtTime(clamped, ctx.currentTime, 0.05)
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
  /** 快速衰减目标(可选): 起音后先落到该值再指数尾巴消散——钢琴等衰减型。 */
  decayTo?: number
}

/**
 * Oscillator + gain envelope (attack ~5ms, exponential decay).
 * 返回幂等停止函数: 快速把增益归零(取消既有包络),不二次调用 osc.stop
 * (osc 已在调度时刻排定自动停止,提前静音即可,避免 double-stop 异常)。
 */
function playTone(ctx: AudioContext, opts: ToneOptions, out: AudioNode): NoteStopFn {
  if (ctx.state === 'closed') return () => {}
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
  if (opts.decayTo !== undefined) {
    // 衰减型: 0.25s 内明显回落(钢琴"按下即变轻"的听感),再指数尾巴消散
    gain.gain.exponentialRampToValueAtTime(Math.max(opts.decayTo, 0.0001), t0 + 0.25)
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)
  osc.connect(gain)
  gain.connect(out)
  osc.start(t0)
  osc.stop(t0 + opts.duration + 0.05)

  let stopped = false
  return () => {
    if (stopped || ctx.state === 'closed') return
    stopped = true
    const now = Math.max(ctx.currentTime, t0)
    // 快速释放: 取消之后的包络事件,增益在 ~20ms 时间常数内归零
    gain.gain.cancelScheduledValues(now)
    gain.gain.setTargetAtTime(0, now, 0.02)
  }
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

/** Filtered noise burst (hats, snare, clap, cymbals). 一击型,无需停止。 */
function playNoise(ctx: AudioContext, opts: NoiseOptions, out: AudioNode): void {
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
  gain.connect(out)
  source.start(t0)
  source.stop(t0 + opts.duration + 0.05)
}

/** 把多个停止函数合并为一个(任一音色部件的释放都生效)。 */
function combineStops(stops: NoteStopFn[]): NoteStopFn {
  return () => {
    for (const s of stops) s()
  }
}

/** 合成钢琴: 衰减型——快速起音后自然指数衰减,即使不松手也越来越轻。 */
function fallbackPiano(
  ctx: AudioContext,
  note: number,
  velocity: number,
  at: number,
  out: AudioNode,
  durationSec: number,
): NoteStopFn {
  const vel = velocity / 127
  const freq = midiToFrequency(note)
  // 两段衰减: 0.25s 内先明显回落(≈ -16dB),再指数尾巴自然消散,
  // 还原钢琴"按下即开始变轻"的手感。
  const body = playTone(
    ctx,
    {
      type: 'triangle',
      frequency: freq,
      at,
      duration: durationSec,
      peak: 0.25 * vel,
      decayTo: 0.04 * vel,
    },
    out,
  )
  // Subtle octave harmonic for a slightly richer tone (同样快速衰减)。
  const harmonic = playTone(
    ctx,
    {
      type: 'sawtooth',
      frequency: freq * 2.001,
      at,
      duration: durationSec * 0.8,
      peak: 0.07 * vel,
      decayTo: 0.012 * vel,
    },
    out,
  )
  return combineStops([body, harmonic])
}

/** 合成贝斯: 锯齿波 + 低通滤波,模拟电贝斯拨弦;松开即止。 */
function fallbackBass(
  ctx: AudioContext,
  note: number,
  velocity: number,
  at: number,
  out: AudioNode,
  durationSec: number,
): NoteStopFn {
  const vel = velocity / 127
  const freq = midiToFrequency(note)
  const t0 = Math.max(at, ctx.currentTime)
  if (ctx.state === 'closed') return () => {}
  const osc = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq, t0)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(600, t0)
  filter.Q.value = 2
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(0.32 * vel, t0 + 0.01)
  // 拨弦感: 快速回落后再自然消散(贝斯也是衰减型)
  gain.gain.exponentialRampToValueAtTime(0.06 * vel, t0 + 0.12)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec)
  osc.connect(filter)
  filter.connect(gain)
  gain.connect(out)
  osc.start(t0)
  osc.stop(t0 + durationSec + 0.05)

  let stopped = false
  return () => {
    if (stopped || ctx.state === 'closed') return
    stopped = true
    const now = Math.max(ctx.currentTime, t0)
    gain.gain.cancelScheduledValues(now)
    gain.gain.setTargetAtTime(0, now, 0.02)
  }
}

/** 合成小号: 方波 + 带通 + 起音包络,明亮而有"号角感";松开即止。 */
function fallbackTrumpet(
  ctx: AudioContext,
  note: number,
  velocity: number,
  at: number,
  out: AudioNode,
  durationSec: number,
): NoteStopFn {
  const vel = velocity / 127
  const freq = midiToFrequency(note)
  const t0 = Math.max(at, ctx.currentTime)
  if (ctx.state === 'closed') return () => {}
  const osc = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(freq, t0)
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(freq * 2, t0)
  filter.Q.value = 1.5
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(0.28 * vel, t0 + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec)
  osc.connect(filter)
  filter.connect(gain)
  gain.connect(out)
  osc.start(t0)
  osc.stop(t0 + durationSec + 0.05)

  let stopped = false
  return () => {
    if (stopped || ctx.state === 'closed') return
    stopped = true
    const now = Math.max(ctx.currentTime, t0)
    gain.gain.cancelScheduledValues(now)
    gain.gain.setTargetAtTime(0, now, 0.02)
  }
}

/** 合成小提琴: 锯齿波 + 轻微颤音(LFO 调制频率),持续而温暖;松开即止。 */
function fallbackViolin(
  ctx: AudioContext,
  note: number,
  velocity: number,
  at: number,
  out: AudioNode,
  durationSec: number,
): NoteStopFn {
  const vel = velocity / 127
  const freq = midiToFrequency(note)
  const t0 = Math.max(at, ctx.currentTime)
  if (ctx.state === 'closed') return () => {}
  const osc = ctx.createOscillator()
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq, t0)
  // 颤音: 5Hz 的 LFO 把频率摆动 ±6Hz
  lfo.frequency.setValueAtTime(5, t0)
  lfoGain.gain.setValueAtTime(6, t0)
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(freq * 3, t0)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(0.22 * vel, t0 + 0.08)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec)
  osc.connect(filter)
  filter.connect(gain)
  gain.connect(out)
  osc.start(t0)
  lfo.start(t0)
  osc.stop(t0 + durationSec + 0.05)
  lfo.stop(t0 + durationSec + 0.05)

  let stopped = false
  return () => {
    if (stopped || ctx.state === 'closed') return
    stopped = true
    const now = Math.max(ctx.currentTime, t0)
    gain.gain.cancelScheduledValues(now)
    gain.gain.setTargetAtTime(0, now, 0.02)
  }
}

function fallbackDrum(
  ctx: AudioContext,
  note: number,
  velocity: number,
  at: number,
  out: AudioNode,
): void {
  const vel = velocity / 127
  switch (note) {
    case 35:
    case 36: // kick: sine with 150→50Hz pitch drop
      playTone(
        ctx,
        { type: 'sine', frequency: 150, freqEnd: 50, at, duration: 0.4, peak: 0.8 * vel },
        out,
      )
      break
    case 37: // rimshot: short highpassed click
      playNoise(
        ctx,
        { at, duration: 0.08, peak: 0.4 * vel, filterType: 'highpass', filterFreq: 2000 },
        out,
      )
      break
    case 38:
    case 40: // snare: tonal body + bandpassed noise
      playTone(
        ctx,
        { type: 'triangle', frequency: 180, at, duration: 0.15, peak: 0.3 * vel },
        out,
      )
      playNoise(
        ctx,
        { at, duration: 0.18, peak: 0.5 * vel, filterType: 'bandpass', filterFreq: 1800 },
        out,
      )
      break
    case 39: // clap
      playNoise(
        ctx,
        { at, duration: 0.25, peak: 0.5 * vel, filterType: 'bandpass', filterFreq: 1200 },
        out,
      )
      break
    case 42:
    case 44: // closed hat
      playNoise(
        ctx,
        { at, duration: 0.05, peak: 0.4 * vel, filterType: 'highpass', filterFreq: 6000 },
        out,
      )
      break
    case 46: // open hat
      playNoise(
        ctx,
        { at, duration: 0.25, peak: 0.4 * vel, filterType: 'highpass', filterFreq: 6000 },
        out,
      )
      break
    case 41:
    case 43:
    case 45:
    case 47: // mid/low tom
      playTone(
        ctx,
        { type: 'sine', frequency: 120, freqEnd: 60, at, duration: 0.3, peak: 0.6 * vel },
        out,
      )
      break
    case 48:
    case 50: // high tom
      playTone(
        ctx,
        { type: 'sine', frequency: 180, freqEnd: 90, at, duration: 0.25, peak: 0.6 * vel },
        out,
      )
      break
    case 49: // crash
      playNoise(
        ctx,
        { at, duration: 0.8, peak: 0.35 * vel, filterType: 'highpass', filterFreq: 4000 },
        out,
      )
      break
    case 51: // cowbell
      playTone(
        ctx,
        { type: 'square', frequency: 800, at, duration: 0.3, peak: 0.25 * vel },
        out,
      )
      break
    default: // any other GM note: generic bandpassed click
      playNoise(
        ctx,
        { at, duration: 0.1, peak: 0.3 * vel, filterType: 'bandpass', filterFreq: 2500 },
        out,
      )
  }
}
