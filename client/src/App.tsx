/**
 * Orchestra JamPad — Phase 0 two-browser sync validation.
 *
 * Wires the shared pipeline modules into a working jam:
 *   - WsClient (net) for the room + protocol
 *   - NTP-style clock estimation (sync/clockOffset) re-run every 30s
 *   - Beat grid (sync/beatGrid) to convert server note timestamps onto the
 *     local audio clock
 *   - LookaheadScheduler + Metronome (audio) running on the audio clock
 *   - createInstruments (audio) for piano/fallback sound
 *   - KeyState (input) for computer-keyboard → MIDI
 *
 * The AudioContext is created AND resumed inside the Connect click gesture
 * so autoplay policy is satisfied; everything else is driven by the welcome
 * message from the server.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { InstrumentId } from '@orchestra/shared'
import { WsClient, type WsHandlers } from './net/wsClient'
import { createBeatGrid, type BeatGrid } from './sync/beatGrid'
import { estimateOffset, type SyncSample } from './sync/clockOffset'
import { LookaheadScheduler } from './audio/scheduler'
import { Metronome } from './audio/metronome'
import { createInstruments, type Instruments } from './audio/instruments'
import { KeyState, drumNoteForKey, noteForKey } from './input/keyboard'
import JamPad, { PAD_HIGH_NOTE, PAD_LOW_NOTE } from './ui/JamPad'
import GuideTicker from './ui/GuideTicker'
import StatusPanel, { type ConnState, type Peer } from './ui/StatusPanel'
import SongPicker from './ui/SongPicker'
import JudgeBadge, { type JudgeBadgeData } from './ui/JudgeBadge'
import { advanceGuide } from './guide/guideEngine'
import { nextBarBoundary } from './guide/barBoundary'
import { Judge, type JudgeStats } from './guide/judge'
import { SONGS, getSong, type Song, type SongPart } from './songs/songs'

/** How often the NTP-style clock estimate is refreshed. */
const SYNC_INTERVAL_MS = 30_000
/** Single sync exchange must complete this quickly or it is dropped. */
const SYNC_EXCHANGE_TIMEOUT_MS = 2_000
/** How long a non-open socket is tolerated before surfacing an error. */
const CONNECT_TIMEOUT_MS = 8_000
/** Lookahead for local note scheduling (seconds ahead of the audio clock). */
const LOCAL_LOOKAHEAD_SEC = 0.05
/** Minimum preparation beats before a song starts (the actual countdown may be
 * longer — it always ends on a bar boundary so beat 1 of the song is an accent). */
const COUNTDOWN_BEATS = 4

/** Tempo slider range (BPM). The server validates and broadcasts any change. */
const MIN_TEMPO_BPM = 40
const MAX_TEMPO_BPM = 240

/**
 * Time-signature presets. The server stores the NUMERATOR as bpi (beats per
 * bar); the denominator is a display concern only, so each pill sends bpi.
 */
const TIME_SIGNATURES: ReadonlyArray<{ bpi: number; label: string }> = [
  { bpi: 2, label: '2/4' },
  { bpi: 3, label: '3/4' },
  { bpi: 4, label: '4/4' },
  { bpi: 5, label: '5/4' },
  { bpi: 6, label: '6/8' },
  { bpi: 7, label: '7/8' },
]

interface ClockInfo {
  offset: number
  delay: number
  syncCount: number
}

/** Ignore keystrokes aimed at form fields (typing the name, etc.). */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export default function App() {
  // --- form state -----------------------------------------------------------
  const [serverUrl, setServerUrl] = useState('ws://localhost:5173/ws')
  const [name, setName] = useState(() => `player-${Math.floor(1000 + Math.random() * 9000)}`)
  /** 加入已有房间时填写的房间码(创建房间时忽略)。 */
  const [roomCodeInput, setRoomCodeInput] = useState('')

  // --- connection / room state ----------------------------------------------
  const [connState, setConnState] = useState<ConnState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  /** 所在房间码(welcome 下发;创建/加入成功后展示给队友)。 */
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [bpm, setBpm] = useState(120)
  const [bpi, setBpi] = useState(4)
  /** Whether the local metronome click is audible (off = silent, sync continues). */
  const [metronomeOn, setMetronomeOn] = useState(true)

  // --- validation readouts ---------------------------------------------------
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [clockInfo, setClockInfo] = useState<ClockInfo>({ offset: 0, delay: 0, syncCount: 0 })
  const [clockBeat, setClockBeat] = useState<{ beat: number; tempo: number } | null>(null)
  const [downNotes, setDownNotes] = useState<ReadonlySet<number>>(() => new Set())
  const [remoteNotes, setRemoteNotes] = useState<ReadonlySet<number>>(() => new Set())
  const [soundTestBusy, setSoundTestBusy] = useState(false)

  // --- Phase 1 song-guide state ---------------------------------------------
  const [selectedSong, setSelectedSong] = useState<Song | null>(null)
  const [selectedPart, setSelectedPart] = useState<SongPart | null>(null)
  /** Per-song BPM overrides (persisted) — user-customizable default tempo. */
  const [songBpmOverrides, setSongBpmOverrides] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('orch.songBpm') ?? '{}') as Record<string, number>
    } catch {
      return {}
    }
  })
  const [judgeEnabled, setJudgeEnabled] = useState(true)
  /** Guide window: MIDI notes to press now / arriving soon, from the guide engine. */
  const [guideCurrent, setGuideCurrent] = useState<ReadonlySet<number>>(() => new Set())
  const [guideUpcoming, setGuideUpcoming] = useState<ReadonlySet<number>>(() => new Set())
  /** Countdown beats remaining before the song starts (null = no countdown). */
  const [countdownBeatsLeft, setCountdownBeatsLeft] = useState<number | null>(null)
  /** Fixed width (beats) of the prep zone shown left of the notes in the ticker. */
  const [prepBeats, setPrepBeats] = useState(0)
  /** Song playback progress 0..1 — drives the SongPicker progress line. */
  const [guideProgress, setGuideProgress] = useState(0)
  const [judgeStats, setJudgeStats] = useState<JudgeStats>({
    hits: 0,
    misses: 0,
    mistakes: 0,
    score: 0,
  })
  const [judgeBadge, setJudgeBadge] = useState<JudgeBadgeData | null>(null)

  // --- shared mutable pipeline objects (kept in refs so async handlers stay fresh) --
  const wsRef = useRef<WsClient | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const schedulerRef = useRef<LookaheadScheduler | null>(null)
  const metronomeRef = useRef<Metronome | null>(null)
  const instrumentsRef = useRef<Instruments | null>(null)
  const beatGridRef = useRef<BeatGrid | null>(null)
  const offsetRef = useRef(0)
  const bpmRef = useRef(120)
  const bpiRef = useRef(4)
  const metronomeOnRef = useRef(true)
  /** Resolver for the in-flight sync exchange, resolved by the syncAck handler. */
  const pendingSyncRef = useRef<((sample: SyncSample) => void) | null>(null)
  const syncingRef = useRef(false)
  const keyStateRef = useRef<KeyState>(new KeyState())
  /** MIDI notes currently held (keyboard or mouse) — dedupes noteOn across inputs. */
  const heldNotesRef = useRef<Set<number>>(new Set())
  const connStateRef = useRef<ConnState>('idle')
  const urlRef = useRef(serverUrl)
  const connectingSinceRef = useRef<number | null>(null)

  // --- Phase 1 song-guide refs (the once-created onClock handler reads these) --
  /** Server beat at the moment the first part was armed — the song's t=0. */
  const songStartBeatRef = useRef<number | null>(null)
  /** Clock anchor on the audio timeline: server beat at a local audio time. */
  /** Clock anchor: server beat at a LOCAL monotonic timestamp (performance.now). */
  const beatAnchorRef = useRef<{ beat: number; localTime: number; tempo: number } | null>(null)
  /** Latest server beat seen on the clock broadcast. */
  const latestBeatRef = useRef(0)
  const selectedPartRef = useRef<SongPart | null>(null)
  const judgeRef = useRef<Judge | null>(null)
  const judgeEnabledRef = useRef(true)
  /** Server beat at which the countdown ends and the song actually starts. */
  const countdownUntilRef = useRef<number | null>(null)
  /** Monotonic id for the transient judgment badge (retriggers its animation). */
  const badgeSeqRef = useRef(0)

  // --- audio helpers ---------------------------------------------------------

  /**
   * Create (or resume) the shared AudioContext. Must run inside a user
   * gesture the first time — both Connect and Sound Test are click handlers.
   */
  const ensureAudio = async (): Promise<AudioContext> => {
    let ctx = ctxRef.current
    if (ctx === null || ctx.state === 'closed') {
      ctx = new AudioContext()
      ctxRef.current = ctx
    }
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    return ctx
  }

  /** Lazily load the sampled instruments once; CDN failures fall back to the synth. */
  const ensureInstruments = async (): Promise<Instruments | null> => {
    const ctx = ctxRef.current
    if (ctx === null) return null
    let inst = instrumentsRef.current
    if (inst === null) {
      inst = await createInstruments(ctx)
      instrumentsRef.current = inst
    }
    return inst
  }

  /** Scheduler + sample-accurate metronome, started once and reused on reconnect. */
  const startAudioPipeline = async (bpmValue: number): Promise<void> => {
    const ctx = await ensureAudio()
    if (schedulerRef.current === null) {
      schedulerRef.current = new LookaheadScheduler(ctx)
      schedulerRef.current.start()
    }
    if (metronomeRef.current === null) {
      metronomeRef.current = new Metronome(schedulerRef.current, bpmValue, bpiRef.current)
    } else {
      metronomeRef.current.setBpm(bpmValue)
      metronomeRef.current.setBeatsPerBar(bpiRef.current)
    }
    if (!metronomeRef.current.isRunning() && metronomeOnRef.current) {
      metronomeRef.current.start()
    }
  }

  /**
   * Live song-beat sampler for the GuideTicker: reads the clock anchor on the
   * AUDIO timeline and extrapolates by tempo — the SAME timeline the metronome
   * is anchored to, so the ticker and the click stay in lockstep between the
   * 500ms clock broadcasts. Returns null while the song hasn't started.
   */
  const getSongBeat = useCallback((): number | null => {
    const anchor = beatAnchorRef.current
    if (anchor === null) return null
    // Extrapolate from a LOCAL monotonic timestamp captured when the clock
    // message arrived: performance.now() advances every frame (unlike the
    // audio clock, which is frozen while the AudioContext is suspended), so
    // the playhead sweeps continuously. Each 500ms clock broadcast re-anchors.
    const elapsedSec = (performance.now() - anchor.localTime) / 1000
    const liveServerBeat = anchor.beat + elapsedSec * (anchor.tempo / 60)
    // Countdown: beat is NEGATIVE (prep beats before the song start), so the
    // ticker sweeps through the empty prep zone into the song's first beat.
    const until = countdownUntilRef.current
    if (until !== null) return liveServerBeat - until
    const startBeat = songStartBeatRef.current
    if (startBeat === null) return null
    return liveServerBeat - startBeat
  }, [])

  /** Toggle the local metronome click. Sync and the beat display continue either way. */
  const handleMetronomeToggle = (): void => {
    setMetronomeOn((on) => {
      const next = !on
      metronomeOnRef.current = next
      if (next) {
        metronomeRef.current?.start()
      } else {
        metronomeRef.current?.stop()
      }
      return next
    })
  }

  // --- clock sync ------------------------------------------------------------

  /**
   * One NTP-style exchange: stamp t1 locally, send a sync message, and return
   * a promise resolved by the syncAck handler with t2/t3 (server stamps) and
   * t4 = local receipt time. Fails fast if the ack never arrives.
   */
  const sendSyncOnce = (): Promise<SyncSample> =>
    new Promise<SyncSample>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (pendingSyncRef.current === resolve) pendingSyncRef.current = null
        reject(new Error('sync exchange timed out'))
      }, SYNC_EXCHANGE_TIMEOUT_MS)
      pendingSyncRef.current = (sample) => {
        window.clearTimeout(timer)
        resolve(sample)
      }
      wsRef.current?.sendSync(performance.now())
    })

  /** Re-estimate the clock offset, then rebuild the beat grid on the new value. */
  const runSync = async (): Promise<void> => {
    if (syncingRef.current) return
    syncingRef.current = true
    try {
      const est = await estimateOffset(sendSyncOnce, { samples: 5, maxDelayMs: 100 })
      offsetRef.current = est.offset
      setClockInfo((prev) => ({
        offset: est.offset,
        delay: est.delay,
        syncCount: prev.syncCount + 1,
      }))
      // serverNow must return the CURRENT server-clock estimate each call, so
      // it closes over the ref (updated above), never a captured value.
      beatGridRef.current = createBeatGrid({
        offset: est.offset,
        ctxNow: () => schedulerRef.current?.currentTime ?? 0,
        serverNow: () => performance.now() + offsetRef.current,
        bpm: bpmRef.current,
        bpi: bpiRef.current,
      })
    } catch (err) {
      console.warn('[App] clock sync failed:', err)
    } finally {
      syncingRef.current = false
    }
  }
  const runSyncRef = useRef(runSync)
  // Keep the ref pointing at the latest runSync without touching it during
  // render (react-hooks/refs). Runs after every commit; the once-created
  // protocol handlers always see the freshest sync routine through the ref.
  useEffect(() => {
    runSyncRef.current = runSync
  })

  // --- protocol handlers -----------------------------------------------------
  // Created once; every handler reads pipeline objects through refs so a
  // stale closure can never touch the wrong (or nulled) pipeline.

  const handlersRef = useRef<WsHandlers | null>(null)
  // Once-created protocol handlers: every handler reads pipeline objects
  // through refs, so creating them a single time on first render is required
  // (they must not be recreated per render/reconnect). This is the documented
  // React lazy-ref-init pattern; react-hooks/refs flags it conservatively, and
  // the whole room pipeline depends on the single-instance behaviour.
  /* eslint-disable react-hooks/refs -- intentional once-created handler ref */
  if (handlersRef.current === null) {
    handlersRef.current = {
      onWelcome: (msg) => {
        setMyId(msg.id)
        setRoomCode(msg.roomCode)
        setBpm(msg.bpm)
        setBpi(msg.bpi)
        bpmRef.current = msg.bpm
        bpiRef.current = msg.bpi
        // A welcome means the server accepted us into the room; this is the
        // single transition into the connected state (drives the badge, the
        // JamPad enabled flag, and the keyboard keydown gate).
        setConnState('connected')
        // A welcome means a fresh room session — start the peer roster over.
        setPeers([])
        setError(null)
        void (async () => {
          try {
            await startAudioPipeline(msg.bpm)
            await runSyncRef.current()
          } catch (err) {
            console.warn('[App] audio pipeline failed:', err)
          }
          // Instrument samples load from a CDN; do not block sync on them.
          void ensureInstruments()
            .then(() => {
              // E2E hook: instruments ready (only when the ?e2e flag is set).
              if (window.location.search.includes('e2e')) {
                const hook = window as unknown as { __orchInstrumentsReady?: boolean }
                hook.__orchInstrumentsReady = true
              }
            })
            .catch((err) => console.warn('[App] instrument load failed:', err))
        })()
      },

      onRoomError: (msg) => {
        // 房间不存在/已满: 保持 socket 断开以便用户改码重试。
        // 关闭 ws 后 handleConnect 才能创建新连接(它对已 OPEN/CONNECTING
        // 的 socket 会直接返回)。
        console.warn('[App] room error:', msg.message)
        wsRef.current?.close()
        wsRef.current = null
        setError(msg.message)
        setConnState('idle')
      },

      onPeerJoined: (msg) => {
        setPeers((prev) =>
          prev.some((p) => p.id === msg.id) ? prev : [...prev, { id: msg.id, name: msg.name }],
        )
      },

      onPeerLeft: (msg) => {
        setPeers((prev) => prev.filter((p) => p.id !== msg.id))
      },

      onClock: (msg) => {
        latestBeatRef.current = msg.beat
        setClockBeat({ beat: msg.beat, tempo: msg.tempo })
        // The clock broadcast carries bpi: pick it up defensively so a late
        // joiner who missed the welcome/bpi echo still has the right meter.
        if (Number.isFinite(msg.bpi)) {
          setBpi(msg.bpi)
          bpiRef.current = msg.bpi
        }
        // Re-anchor the metronome grid to the server's next beat boundary so
        // the accent PHYSICALLY lands on beat 1 (not just the displayed label).
        // The server said beat `msg.beat` at `msg.serverTime`; the next integer
        // beat boundary is ceil(beat), at serverTime + (ceil - beat) * ms/beat.
        const grid = beatGridRef.current
        if (grid !== null && metronomeRef.current !== null) {
          const msPerBeat = 60000 / msg.tempo
          const nextBeat = Math.ceil(msg.beat)
          const nextBeatServerTime = msg.serverTime + (nextBeat - msg.beat) * msPerBeat
          metronomeRef.current.syncToServer(
            grid.toAudioTime(nextBeatServerTime),
            nextBeat % msg.bpi,
          )
        }
        // Record the clock anchor at a LOCAL monotonic timestamp so the ticker
        // can sweep continuously between broadcasts (performance.now advances
        // even while the AudioContext is suspended, unlike the audio clock).
        beatAnchorRef.current = {
          beat: msg.beat,
          localTime: performance.now(),
          tempo: msg.tempo,
        }

        // --- Phase 1 guide + judgment, driven by the shared server beat ---
        // songBeat is the server beat relative to when the part was armed, so
        // every player's guide sits on the same absolute grid.
        const part = selectedPartRef.current
        // Countdown: if a start was requested, show the preparation beats and
        // only begin the song (anchor songStartBeat) once the countdown elapses.
        const countdownUntil = countdownUntilRef.current
        if (countdownUntil !== null) {
          const beatsLeft = countdownUntil - msg.beat
          if (beatsLeft > 0) {
            setCountdownBeatsLeft(Math.ceil(beatsLeft))
            return
          }
          countdownUntilRef.current = null
          songStartBeatRef.current = countdownUntil
          setCountdownBeatsLeft(null)
        }
        const startBeat = songStartBeatRef.current
        if (part !== null && startBeat !== null) {
          const songBeat = msg.beat - startBeat
          const win = advanceGuide(part.notes, songBeat, { lookaheadBeats: 4 })
          // The engine returns SongNote[]; the pad highlights by MIDI note.
          setGuideCurrent(new Set(win.current.map((n) => n.note)))
          setGuideUpcoming(new Set(win.upcoming.map((n) => n.note)))
          setGuideProgress(win.progress)
          const judge = judgeRef.current
          if (judge !== null && judgeEnabledRef.current) {
            judge.advance(songBeat)
            setJudgeStats(judge.stats())
          }
        }
      },

      onTempo: (msg) => {
        // Any player's tempo change (including our own echo) is authoritative:
        // re-lock the metronome and beat grid so every client hears the same
        // speed. The metronome picks the new bpm up from its next beat.
        setBpm(msg.bpm)
        bpmRef.current = msg.bpm
        metronomeRef.current?.setBpm(msg.bpm)
        beatGridRef.current?.setTempo(msg.bpm)
      },

      onBpi: (msg) => {
        // Any player's meter change (including our own echo) is authoritative.
        // The server re-anchors the bar so the next beat IS beat 1 of the new
        // meter (real-metronome semantics), then immediately pushes a clock;
        // onClock's syncToServer re-anchors the audible grid to it.
        setBpi(msg.bpi)
        bpiRef.current = msg.bpi
        metronomeRef.current?.setBeatsPerBar(msg.bpi)
      },

      onNote: (msg) => {
        // E2E hook: count remote notes received (only when the ?e2e flag is set).
        if (window.location.search.includes('e2e')) {
          const hook = window as unknown as { __orchNotes?: number }
          hook.__orchNotes = (hook.__orchNotes ?? 0) + 1
        }
        const inst = instrumentsRef.current
        const sched = schedulerRef.current
        if (inst === null || sched === null) return
        // Convert the server-stamped time onto the local audio clock; before
        // the first sync completes, fall back to playing immediately.
        const grid = beatGridRef.current
        const at = grid === null ? 0 : grid.toAudioTime(msg.serverTime) - sched.currentTime
        // 按发送者的乐器回放,保证鼓手/贝斯手/键盘手在每个人耳中都是自己的音色。
        inst.play(msg.instrument, msg.note, msg.velocity, at)

        // Highlight the same key on the visible pad, but only for notes that
        // exist on it — the sound above plays for every note, remoteNotes is
        // a purely visual concern.
        if (msg.note >= PAD_LOW_NOTE && msg.note <= PAD_HIGH_NOTE) {
          setRemoteNotes((prev) => (prev.has(msg.note) ? prev : new Set(prev).add(msg.note)))
        }
      },

      onNoteOff: (msg) => {
        setRemoteNotes((prev) => {
          if (!prev.has(msg.note)) return prev
          const next = new Set(prev)
          next.delete(msg.note)
          return next
        })
      },

      onSyncAck: (msg) => {
        const resolve = pendingSyncRef.current
        if (resolve !== null) {
          pendingSyncRef.current = null
          resolve({ t1: msg.t1, t2: msg.t2, t3: msg.t3, t4: performance.now() })
        }
      },
    }
  }
  /* eslint-enable react-hooks/refs */

  // --- user interactions -----------------------------------------------------

  /** Create/Join: creates the AudioContext (user gesture) and the socket, then
   *  sends the room intent (createRoom or join with code). */
  const handleConnect = async (mode: 'create' | 'join'): Promise<void> => {
    const ws = wsRef.current
    if (
      ws !== null &&
      (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    if (mode === 'join' && roomCodeInput.trim() === '') {
      setError('请先填写要加入的房间码')
      return
    }
    setError(null)
    setConnState('connecting')
    try {
      await ensureAudio()
      const handlers = handlersRef.current
      if (handlers === null) {
        throw new Error('internal error: protocol handlers not initialised')
      }
      const displayName = name.trim() === '' ? 'player' : name.trim()
      const next = new WsClient(urlRef.current, handlers)
      wsRef.current = next
      next.connect()
      if (mode === 'create') {
        next.createRoom(displayName)
      } else {
        next.joinRoom(roomCodeInput.trim().toUpperCase(), displayName)
      }
    } catch (err) {
      console.warn('[App] connect failed:', err)
      setError(err instanceof Error ? err.message : String(err))
      setConnState('idle')
    }
  }

  /** Sound Test: local C-major arpeggio to verify audio before joining. */
  const handleSoundTest = async (): Promise<void> => {
    if (soundTestBusy) return
    setSoundTestBusy(true)
    try {
      const ctx = await ensureAudio()
      const inst = await ensureInstruments()
      if (inst === null) return
      const arpeggio = [60, 64, 67, 72, 67, 64]
      const start = ctx.currentTime + LOCAL_LOOKAHEAD_SEC
      arpeggio.forEach((note, i) => {
        inst.play('piano', note, 100, start + i * 0.12 - ctx.currentTime)
      })
    } catch (err) {
      console.warn('[App] sound test failed:', err)
    } finally {
      setSoundTestBusy(false)
    }
  }

  /**
   * Tempo slider: optimistically refresh the readout, then hand the change to
   * the server. The metronome and beat grid are NOT touched here — the server
   * broadcasts the new tempo back (self echo included) and onTempo applies it,
   * which is what keeps every client locked to the same speed.
   */
  const handleTempoChange = (nextBpm: number): void => {
    if (!Number.isFinite(nextBpm)) return
    const clamped = Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, Math.round(nextBpm)))
    setBpm(clamped)
    wsRef.current?.sendSetTempo(clamped)
  }

  /**
   * Time-signature change: update the meter locally, then hand it to the
   * server. The server broadcasts the new bpi back (self echo included) and
   * onBpi applies it to every client's bar subdivision.
   */
  const handleBpiChange = (nextBpi: number): void => {
    setBpi(nextBpi)
    bpiRef.current = nextBpi
    wsRef.current?.sendSetBpi(nextBpi)
  }

  /** 当前演奏的乐器: 选了声部用声部的乐器,自由合奏(jam)用钢琴。 */
  const currentInstrument = (): InstrumentId => selectedPartRef.current?.instrument ?? 'piano'

  /**
   * Shared note-on for BOTH the computer keyboard and the JamPad's mouse keys:
   * guard → held-dedupe → local sound + latency readout → sendNote to the room.
   * Reads only refs + stable setters, so a first-render closure stays correct.
   * `oneShot`(鼓垫模式): 每次按下都是独立敲击,不进入 held 去重,也不发送 noteOff。
   */
  const noteOn = (note: number, oneShot = false): void => {
    if (connStateRef.current !== 'connected') return
    if (!oneShot) {
      if (heldNotesRef.current.has(note)) return
      heldNotesRef.current.add(note)
    }
    setDownNotes((prev) => (prev.has(note) ? prev : new Set(prev).add(note)))

    // --- Phase 1 judgment: judge every local press against the armed part ---
    // Runs BEFORE the instrument check so judging works even while samples are
    // still loading (instruments fall back to a synth after a timeout).
    const judge = judgeRef.current
    if (
      judge !== null &&
      judgeEnabledRef.current &&
      selectedPartRef.current !== null &&
      songStartBeatRef.current !== null
    ) {
      const songBeat = latestBeatRef.current - songStartBeatRef.current
      const result = judge.press(note, songBeat)
      if (result.kind === 'hit' || result.kind === 'mistake') {
        setJudgeStats(judge.stats())
        badgeSeqRef.current += 1
        setJudgeBadge({ kind: result.kind, note, id: badgeSeqRef.current })
      }
    }

    const sched = schedulerRef.current
    const inst = instrumentsRef.current
    const ctx = ctxRef.current
    if (sched === null || inst === null || ctx === null) return

    // Local feedback is immediate (direct instrument call); remote notes are
    // replayed from their server timestamp by the onNote handler.
    const keydownAt = performance.now()
    const targetAudio = sched.currentTime + LOCAL_LOOKAHEAD_SEC
    const instrument = currentInstrument()
    inst.play(instrument, note, 100, targetAudio - ctx.currentTime)

    // ① key→sound latency readout: how far the audio output clock has moved
    // past the keydown instant (≈ the hardware input→output latency).
    const latency = sched.latencySince(keydownAt)
    if (latency !== null) {
      setLatencyMs(Math.max(0, Math.round(latency)))
    }

    wsRef.current?.sendNote(note, 100, instrument)
  }

  /** Shared note-off; releases the remote player's highlight too. */
  const noteOff = (note: number): void => {
    if (!heldNotesRef.current.has(note)) return
    heldNotesRef.current.delete(note)
    setDownNotes((prev) => {
      if (!prev.has(note)) return prev
      const next = new Set(prev)
      next.delete(note)
      return next
    })
    wsRef.current?.sendNoteOff(note)
  }

  /** Computer-keyboard note-on. 鼓模式下键位是鼓垫(one-shot),音高模式下是钢琴键。 */
  const handleKeyDown = (key: string, repeat = false): void => {
    if (selectedPartRef.current?.instrument === 'drums') {
      if (repeat) return
      const drumNote = drumNoteForKey(key)
      if (drumNote !== null) noteOn(drumNote, true)
      return
    }
    const note = keyStateRef.current.press(key, repeat)
    if (note !== null) noteOn(note)
  }

  const handleKeyUp = (key: string): void => {
    if (keyStateRef.current.isDown(key)) {
      const note = noteForKey(key)
      keyStateRef.current.release(key)
      if (note !== null) noteOff(note)
    }
  }

  /** JamPad mouse/touch note-on — same pipeline as the keyboard. */
  const handleNoteDown = (note: number): void => {
    noteOn(note)
  }

  /** JamPad mouse/touch note-off — same pipeline as the keyboard. */
  const handleNoteUp = (note: number): void => {
    noteOff(note)
  }

  // --- Phase 1 song selection / judgment -----------------------------------

  /** Effective BPM for a song: user override if set, else the song's default. */
  const effectiveSongBpm = (song: Song): number => songBpmOverrides[song.id] ?? song.bpm

  /** Persist per-song BPM overrides. */
  useEffect(() => {
    localStorage.setItem('orch.songBpm', JSON.stringify(songBpmOverrides))
  }, [songBpmOverrides])

  /** Pick a song: clears the armed part and applies the song's tempo room-wide. */
  const handleSelectSong = (songId: string): void => {
    const song = getSong(songId) ?? null
    setSelectedSong(song)
    setSelectedPart(null)
    selectedPartRef.current = null
    // Selecting a song drives the whole room to its (customizable) default tempo.
    if (song !== null) {
      handleTempoChange(effectiveSongBpm(song))
    }
    // The next part pick re-anchors the song start at the then-current beat.
    songStartBeatRef.current = null
    countdownUntilRef.current = null
    setCountdownBeatsLeft(null)
    setPrepBeats(0)
    judgeRef.current = null
    setGuideCurrent(new Set())
    setGuideUpcoming(new Set())
    setGuideProgress(0)
    setJudgeStats({ hits: 0, misses: 0, mistakes: 0, score: 0 })
    setJudgeBadge(null)
  }

  /** Arm a part: start a COUNTDOWN, then the song begins (t=0 = armBeat + countdown). */
  const handleSelectPart = (partId: string): void => {
    if (selectedSong === null) return
    const part = selectedSong.parts.find((p) => p.id === partId) ?? null
    if (part === null) return
    setSelectedPart(part)
    selectedPartRef.current = part
    // Swapping parts mid-song keeps the current position; the first arm (or a
    // restart) starts a countdown ending on the NEXT BAR BOUNDARY so the song's
    // first beat lands on the metronome accent.
    if (songStartBeatRef.current === null) {
      const until = nextBarBoundary(latestBeatRef.current, bpiRef.current, COUNTDOWN_BEATS)
      countdownUntilRef.current = until
      const total = Math.ceil(until - latestBeatRef.current)
      setCountdownBeatsLeft(total)
      setPrepBeats(total)
    }
    judgeRef.current = new Judge(part.notes, { enabled: judgeEnabledRef.current })
    setJudgeStats(judgeRef.current.stats())
    setJudgeBadge(null)
  }

  /** Restart the armed song: reset position + judgment, run the countdown again. */
  const handleRestart = (): void => {
    if (selectedPartRef.current === null) return
    songStartBeatRef.current = null
    const until = nextBarBoundary(latestBeatRef.current, bpiRef.current, COUNTDOWN_BEATS)
    countdownUntilRef.current = until
    const total = Math.ceil(until - latestBeatRef.current)
    setCountdownBeatsLeft(total)
    setPrepBeats(total)
    setGuideCurrent(new Set())
    setGuideUpcoming(new Set())
    setGuideProgress(0)
    judgeRef.current = new Judge(selectedPartRef.current.notes, {
      enabled: judgeEnabledRef.current,
    })
    setJudgeStats(judgeRef.current.stats())
    setJudgeBadge(null)
  }

  /** Toggle the judgment pipeline (mirrors the metronome toggle). */
  const handleToggleJudge = (): void => {
    setJudgeEnabled((prev) => !prev)
  }

  /** Change a song's default tempo (persisted); applies it to the room live. */
  const handleSongBpmChange = (songId: string, bpm: number): void => {
    if (!Number.isFinite(bpm)) return
    const clamped = Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, Math.round(bpm)))
    setSongBpmOverrides((prev) => ({ ...prev, [songId]: clamped }))
    if (selectedSong !== null && selectedSong.id === songId) {
      handleTempoChange(clamped)
    }
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) return
    handleKeyDown(e.key, e.repeat)
  }

  const onKeyUp = (e: KeyboardEvent): void => {
    handleKeyUp(e.key)
  }

  // --- effects ---------------------------------------------------------------

  useEffect(() => {
    connStateRef.current = connState
  }, [connState])

  useEffect(() => {
    urlRef.current = serverUrl
  }, [serverUrl])

  // Keep the judge's enabled flag in sync with the toggle (the judge lives in
  // a ref so the once-created onClock/noteOn handlers can reach it). The
  // Judge's own `enabled` is fixed at construction; gate on the ref instead.
  useEffect(() => {
    judgeEnabledRef.current = judgeEnabled
  }, [judgeEnabled])

  // Transient judgment badge: auto-dismiss after 900ms; a new event retriggers
  // the timer so rapid hits/misses each get their full show.
  useEffect(() => {
    if (judgeBadge === null) return
    const timer = window.setTimeout(() => setJudgeBadge(null), 900)
    return () => window.clearTimeout(timer)
  }, [judgeBadge])

  // Global keyboard → piano routing. Handlers only read refs + stable setters,
  // so subscribing once is safe (the exhaustive-deps warning is a false
  // positive here: onKeyDown/onKeyUp are recreated each render but never
  // capture render-scoped values — they read everything through refs).
  /* eslint-disable react-hooks/exhaustive-deps -- intentional one-time subscription */
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps */

  // Socket health poll: downgrade the state badge and surface an error when
  // the backend stays unreachable (the WsClient itself keeps retrying).
  useEffect(() => {
    const timer = window.setInterval(() => {
      const ws = wsRef.current
      if (ws === null) return
      if (ws.readyState !== WebSocket.OPEN) {
        if (connectingSinceRef.current === null) {
          connectingSinceRef.current = Date.now()
        } else if (Date.now() - connectingSinceRef.current > CONNECT_TIMEOUT_MS) {
          setError(`cannot reach server at ${urlRef.current} — is the backend running?`)
        }
        setConnState('connecting')
      } else {
        connectingSinceRef.current = null
      }
    }, 500)
    return () => window.clearInterval(timer)
  }, [])

  // Periodic clock re-sync (runSync guards against overlap with an in-flight run).
  useEffect(() => {
    const timer = window.setInterval(() => {
      void runSyncRef.current()
    }, SYNC_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  // Full teardown on unmount. Refs are nulled so a StrictMode remount (dev)
  // rebuilds every pipeline object instead of reusing a closed AudioContext.
  useEffect(
    () => () => {
      wsRef.current?.close()
      metronomeRef.current?.stop()
      schedulerRef.current?.stop()
      wsRef.current = null
      schedulerRef.current = null
      metronomeRef.current = null
      instrumentsRef.current = null
      beatGridRef.current = null
      const ctx = ctxRef.current
      ctxRef.current = null
      if (ctx !== null && ctx.state !== 'closed') {
        void ctx.close().catch((err) => console.warn('[App] AudioContext close failed:', err))
      }
    },
    [],
  )

  // --- render ----------------------------------------------------------------

  const displayName = name.trim() === '' ? 'player' : name.trim()
  const tempoFillPct = ((bpm - MIN_TEMPO_BPM) / (MAX_TEMPO_BPM - MIN_TEMPO_BPM)) * 100

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <span className="brand-kicker">Orchestra // Phase 0 · Sync Validation</span>
          <h1 className="brand-title">JamPad</h1>
        </div>
        <p className="tagline">
          Two browsers, one room. Hit a key here, <b>hear it in the other room</b> — and watch the
          clock offset and server beat settle in the status panel.
        </p>
      </header>

      <main className="app-main">
        <div className="app-left">
          <section className="panel">
            <h2 className="panel-title">Link Up</h2>
            <form
              className="connect-form"
              onSubmit={(e) => {
                e.preventDefault()
                void handleConnect('create')
              }}
            >
              <label className="field">
                <span className="field-label">Server</span>
                <input
                  className="field-input"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="field-input"
                  data-testid="name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span className="field-label">Room Code</span>
                <input
                  className="field-input field-input-code"
                  data-testid="room-code-input"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  placeholder="加入已有房间时填写"
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={6}
                />
              </label>
              <div className="connect-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="create-btn"
                  disabled={connState === 'connecting'}
                >
                  {connState === 'connecting' ? 'Connecting…' : '创建房间'}
                </button>
                <button
                  type="button"
                  className="btn"
                  data-testid="join-btn"
                  disabled={connState === 'connecting' || roomCodeInput.trim() === ''}
                  onClick={() => void handleConnect('join')}
                >
                  加入房间
                </button>
              </div>
              <p className="field-hint">
                创建房间后会得到 6 位房间码;把码告诉朋友,他们填码点「加入房间」。
              </p>
            </form>
          </section>

          <StatusPanel
            connState={connState}
            serverUrl={serverUrl}
            roomCode={roomCode}
            myName={displayName}
            myId={myId}
            peers={peers}
            latencyMs={latencyMs}
            clockOffsetMs={clockInfo.offset}
            syncDelayMs={clockInfo.delay}
            syncCount={clockInfo.syncCount}
            beat={clockBeat?.beat ?? null}
            bpm={bpm}
            bpi={bpi}
            error={error}
          />

          <SongPicker
            songs={SONGS}
            selectedSongId={selectedSong?.id ?? null}
            onSelectSong={handleSelectSong}
            selectedPartId={selectedPart?.id ?? null}
            onSelectPart={handleSelectPart}
            enabled={connState === 'connected'}
            progress={guideProgress}
            judgeEnabled={judgeEnabled}
            onToggleJudge={handleToggleJudge}
            judgeStats={judgeStats}
            countdownBeatsLeft={countdownBeatsLeft}
            onRestart={handleRestart}
            songBpmOverrides={songBpmOverrides}
            onSongBpmChange={handleSongBpmChange}
          />

          <section className="panel">
            <h2 className="panel-title">
              <span>Tempo · Meter</span>
              <button
                type="button"
                className={`metronome-toggle${metronomeOn ? ' metronome-toggle-on' : ''}`}
                data-testid="metronome-toggle"
                aria-pressed={metronomeOn}
                onClick={handleMetronomeToggle}
              >
                <span className="metronome-toggle-dot" />
                Metronome {metronomeOn ? 'ON' : 'OFF'}
              </button>
            </h2>
            <div
              className={
                connState === 'connected' ? 'tempo-control' : 'tempo-control tempo-control-off'
              }
            >
              <div className="tempo-head">
                <span className="tempo-label">Room BPM</span>
                <span className="tempo-value" data-testid="tempo-value">
                  {bpm}
                </span>
              </div>
              <input
                type="range"
                className="tempo-slider"
                data-testid="tempo-slider"
                min={MIN_TEMPO_BPM}
                max={MAX_TEMPO_BPM}
                step={1}
                value={bpm}
                disabled={connState !== 'connected'}
                onChange={(e) => handleTempoChange(Number(e.target.value))}
                aria-label="Metronome tempo in beats per minute"
                style={{
                  background: `linear-gradient(to right, var(--amber) ${tempoFillPct}%, var(--line) ${tempoFillPct}%)`,
                }}
              />
              <div className="tempo-range">
                <span>{MIN_TEMPO_BPM}</span>
                <span>{MAX_TEMPO_BPM}</span>
              </div>
              <p className="tempo-hint">
                Any player can change it — everyone in the room hears the new speed from the next
                beat.
              </p>
            </div>
            <div className={connState === 'connected' ? 'tsig-control' : 'tsig-control tsig-off'}>
              <div className="tsig-head">
                <span className="tsig-label">拍号 · Beats / Bar</span>
              </div>
              <div className="tsig-pills" role="group" aria-label="Time signature">
                {TIME_SIGNATURES.map(({ bpi: sigBpi, label }) => (
                  <button
                    key={sigBpi}
                    type="button"
                    className={bpi === sigBpi ? 'tsig-pill tsig-pill-active' : 'tsig-pill'}
                    data-testid={`tsig-${sigBpi}`}
                    disabled={connState !== 'connected'}
                    aria-pressed={bpi === sigBpi}
                    onClick={() => handleBpiChange(sigBpi)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="tsig-hint">
                Any player can change it — everyone re-bars from the same beat position.
              </p>
            </div>
          </section>
        </div>

        <div className="pad-zone">
          <JudgeBadge badge={judgeBadge} />
          <JamPad
            downNotes={downNotes}
            remoteNotes={remoteNotes}
            guideCurrent={guideCurrent}
            guideUpcoming={guideUpcoming}
            enabled={connState === 'connected'}
            onNoteDown={handleNoteDown}
            onNoteUp={handleNoteUp}
            soundTest={() => void handleSoundTest()}
            soundTestBusy={soundTestBusy}
          />
          <GuideTicker
            notes={selectedPart?.notes ?? []}
            getSongBeat={getSongBeat}
            prepBeats={prepBeats}
            enabled={connState === 'connected'}
          />
        </div>
      </main>

      <footer className="app-footer">
        <span>clock offset = server − client · positive means server is ahead</span>
        <span>pitch keys: white A–K, Z–M · black W–U, Q–6 (C3–C5) · drums: A/S/D/F… = kick/snare/hat…</span>
      </footer>
    </div>
  )
}
