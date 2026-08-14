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
import { isValidSong, type InstrumentId } from '@orchestra/shared'
import { WsClient, type WsHandlers } from './net/wsClient'
import { createProtocolHandlers } from './net/handlers'
import { createBeatGrid, type BeatGrid } from './sync/beatGrid'
import { estimateOffset, type SyncSample } from './sync/clockOffset'
import { LookaheadScheduler } from './audio/scheduler'
import { Metronome } from './audio/metronome'
import { createInstruments, type Instruments } from './audio/instruments'
import { playReplay } from './audio/replay'
import { KeyState, drumNoteForKey, noteForKey } from './input/keyboard'
import { connectMidi, type MidiConnection } from './input/midi'
import JamPad from './ui/JamPad'
import GuideTicker from './ui/GuideTicker'
import DrumPad from './ui/DrumPad'
import ScoreView from './ui/ScoreView'
import SongStudio from './ui/SongStudio'
import TutorialModal from './ui/TutorialModal'
import {
  exportSongJson,
  importSongJson,
  loadCustomSongs,
  saveCustomSongs,
} from './songs/customSongs'
import StatusPanel, { type ConnState, type Peer } from './ui/StatusPanel'
import MixerPanel from './ui/MixerPanel'
import InstrumentPicker from './ui/InstrumentPicker'
import LinkUpPanel from './ui/LinkUpPanel'
import TempoPanel from './ui/TempoPanel'
import SongPicker from './ui/SongPicker'
import JudgeBadge, { type JudgeBadgeData } from './ui/JudgeBadge'
import { nextBarBoundary } from './guide/barBoundary'
import { Judge, type JudgeStats } from './guide/judge'
import { SONGS, type Song, type SongNote, type SongPart } from './songs/songs'
import { finalizeRecording, recordNoteOff, recordNoteOn } from './songs/recorder'

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
  // 默认同源 /ws: 开发时经 Vite 代理(5173),生产时由 Node 服务器同端口托管
  const [serverUrl, setServerUrl] = useState(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws`
  })
  const [name, setName] = useState(() => `player-${Math.floor(1000 + Math.random() * 9000)}`)
  /** 加入已有房间时填写的房间码(创建房间时忽略)。 */
  const [roomCodeInput, setRoomCodeInput] = useState('')
  /** MIDI 连接状态(Phase 2)。 */
  const [midiState, setMidiState] = useState<'idle' | 'unsupported' | 'error' | 'connected'>(
    'idle',
  )
  const [midiDevices, setMidiDevices] = useState<string[]>([])

  // --- connection / room state ----------------------------------------------
  const [connState, setConnState] = useState<ConnState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  /** 所在房间码(welcome 下发;创建/加入成功后展示给队友)。 */
  const [roomCode, setRoomCode] = useState<string | null>(null)
  /** 房间码复制反馈(短暂显示"已复制")。 */
  const [roomCodeCopied, setRoomCodeCopied] = useState(false)
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

  // --- Phase 1 mixer: per-instrument volume (persisted, local-only) ----------
  const [mixVolumes, setMixVolumes] = useState<Record<InstrumentId, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('orch.mix') ?? '{}') as Record<
        string,
        number
      >
      return {
        piano: saved.piano ?? 1,
        bass: saved.bass ?? 1,
        drums: saved.drums ?? 1,
        trumpet: saved.trumpet ?? 1,
        violin: saved.violin ?? 1,
      }
    } catch {
      return { piano: 1, bass: 1, drums: 1, trumpet: 1, violin: 1 }
    }
  })
  const mixVolumesRef = useRef(mixVolumes)
  // Keep the ref pointing at the latest mix (the once-created onWelcome handler
  // applies it when instruments first load). Updated after commit, not during
  // render — react-hooks/refs.
  useEffect(() => {
    mixVolumesRef.current = mixVolumes
  })

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
  /** 引导模式: 下落音符滚动条 / 虚拟乐器高亮(琴键与鼓垫)。 */
  const [guideMode, setGuideMode] = useState<'ticker' | 'highlight'>(() => {
    const saved = localStorage.getItem('orch.guideMode')
    return saved === 'highlight' ? 'highlight' : 'ticker'
  })
  /** 谱面(OSMD 总谱/分谱)是否显示。 */
  const [showScore, setShowScore] = useState(() => localStorage.getItem('orch.showScore') === '1')
  /** 自由合奏音色(持久化);武装声部后由声部决定。 */
  const [jamInstrument, setJamInstrument] = useState<InstrumentId>(() => {
    const saved = localStorage.getItem('orch.instrument')
    return saved === 'bass' || saved === 'drums' || saved === 'trumpet' || saved === 'violin'
      ? saved
      : 'piano'
  })
  // 一次性订阅的键盘处理器走首渲染闭包,音色必须经 ref 读取才能拿到最新值
  const jamInstrumentRef = useRef(jamInstrument)
  useEffect(() => {
    jamInstrumentRef.current = jamInstrument
  })
  /** 歌曲当前位置(拍,相对歌曲起点)——驱动谱面跟随高亮。 */
  const [songBeatState, setSongBeatState] = useState<number | null>(null)

  // --- Phase 2 song studio: recording + custom library ----------------------
  const [customSongs, setCustomSongs] = useState<Song[]>(() => loadCustomSongs())
  const [isRecording, setIsRecording] = useState(false)
  const [recordedCount, setRecordedCount] = useState(0)
  const [exportText, setExportText] = useState<string | null>(null)
  /** 分享目标(最近一次停止/保存的曲目)。 */
  const [shareSong, setShareSong] = useState<Song | null>(null)
  /** 服务器返回的分享码。 */
  const [shareId, setShareId] = useState<string | null>(null)
  /** 录制会话: 起点服务器拍 + 收集的音符。 */
  const recordingRef = useRef<{ startBeat: number; notes: SongNote[] } | null>(null)
  /** 最近取回分享曲的点赞信息(评分)。 */
  const [fetchedCode, setFetchedCode] = useState<string | null>(null)
  const [fetchedLikes, setFetchedLikes] = useState<number | null>(null)
  /** 新手教程: 首次访问自动打开,之后可手动重开。 */
  const [tutorialOpen, setTutorialOpen] = useState(
    () => localStorage.getItem('orch.tutorialDone') !== '1',
  )
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
  /** 本地活动声音: `${instrument}:${note}` → 停止函数(松开时调用)。 */
  const localVoicesRef = useRef<Map<string, () => void>>(new Map())
  /** MIDI 连接实例(卸载时断开)。 */
  const midiConnectionRef = useRef<MidiConnection | null>(null)
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
  /** Latest server beat seen on the clock broadcast (null until the first one). */
  const latestBeatRef = useRef<number | null>(null)
  const selectedPartRef = useRef<SongPart | null>(null)
  const judgeRef = useRef<Judge | null>(null)
  const judgeEnabledRef = useRef(true)
  /** Server beat at which the countdown ends and the song actually starts. */
  const countdownUntilRef = useRef<number | null>(null)
  /**
   * 声部武装发生在第一条时钟广播之前时,倒计时锚点无法计算(latestBeat 未知,
   * 用 0 拍当锚点会让倒计时立刻过期、整首歌被跳过)。此时挂起武装,
   * 等 onClock 拿到真实节拍后再启动倒计时。
   */
  const pendingArmRef = useRef(false)
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
      // 应用已保存的声部音量(混音总线在 createInstruments 内建好)
      for (const [instrument, volume] of Object.entries(mixVolumesRef.current)) {
        inst.setInstrumentVolume(instrument as InstrumentId, volume)
      }
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
      const est = await estimateOffset(sendSyncOnce, { samples: 5, maxDelayMs: 400 })
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

  /**
   * 启动倒计时: 锚定到最近的小节边界(≥ COUNTDOWN_BEATS 拍后),让歌曲第一拍
   * 落在节拍器重音上。必须在 latestBeatRef 已知(至少收到一条时钟广播)后调用。
   * 定义在 handlers 之前,以便作为依赖传入 createProtocolHandlers(避免 TDZ)。
   */
  const startCountdown = (): void => {
    const now = latestBeatRef.current
    if (now === null) return
    const until = nextBarBoundary(now, bpiRef.current, COUNTDOWN_BEATS)
    countdownUntilRef.current = until
    const total = Math.ceil(until - now)
    setCountdownBeatsLeft(total)
    setPrepBeats(total)
  }

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
    // 一次性创建协议处理器(见 net/handlers.ts): 所有 handler 只经 refs/setters
    // 访问管线,首次渲染后永不重建。
    handlersRef.current = createProtocolHandlers({
      wsRef,
      instrumentsRef,
      schedulerRef,
      metronomeRef,
      beatGridRef,
      bpmRef,
      bpiRef,
      latestBeatRef,
      beatAnchorRef,
      countdownUntilRef,
      songStartBeatRef,
      selectedPartRef,
      judgeRef,
      judgeEnabledRef,
      pendingArmRef,
      pendingSyncRef,
      runSyncRef,
      startAudioPipeline,
      ensureInstruments,
      startCountdown,
      setMyId,
      setRoomCode,
      setBpm,
      setBpi,
      setConnState,
      setPeers,
      setError,
      setClockBeat,
      setCountdownBeatsLeft,
      setPrepBeats,
      setSongBeatState,
      setGuideCurrent,
      setGuideUpcoming,
      setGuideProgress,
      setJudgeStats,
      setRemoteNotes,
    })
  }
  /* eslint-enable react-hooks/refs */

  // --- user interactions -----------------------------------------------------

  /** 复制房间码到剪贴板(带短暂反馈)。 */
  const handleCopyRoomCode = (): void => {
    if (roomCode === null) return
    void navigator.clipboard
      .writeText(roomCode)
      .then(() => setRoomCodeCopied(true))
      .catch((err: unknown) => {
        console.warn('[App] copy room code failed:', err)
        setRoomCodeCopied(true) // 乐观反馈,失败也不阻塞流程
      })
  }
  useEffect(() => {
    if (!roomCodeCopied) return
    const timer = window.setTimeout(() => setRoomCodeCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [roomCodeCopied])

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

  /**
   * 连接 MIDI 键盘(Phase 2): 必须在用户手势中调用 requestMIDIAccess。
   * Safari 不支持 → unsupported;无设备/被拒 → error;成功 → connected。
   * MIDI 事件复用与键盘相同的 noteOn/noteOff 管线(含引导判定)。
   */
  const handleConnectMidi = async (): Promise<void> => {
    setMidiState('idle')
    try {
      const conn = await connectMidi({
        onNoteOn: (note, velocity) => {
          // 鼓声部下 MIDI 音符直接作为一次敲击(one-shot)
          if (selectedPartRef.current?.instrument === 'drums') {
            noteOn(note, true, velocity)
          } else {
            noteOn(note, false, velocity)
          }
        },
        onNoteOff: (note) => noteOff(note),
      })
      if (conn === null) {
        setMidiState('unsupported')
        return
      }
      midiConnectionRef.current?.disconnect()
      midiConnectionRef.current = conn
      setMidiDevices(conn.deviceNames)
      setMidiState(conn.deviceNames.length > 0 ? 'connected' : 'error')
    } catch (err) {
      console.warn('[App] MIDI connect failed:', err)
      setMidiState('error')
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
        // 试音用短时值,避免长延音叠在一起
        inst.play('piano', note, 100, start + i * 0.12 - ctx.currentTime, 0.35)
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

  /** 当前演奏的乐器: 选了声部用声部的乐器,自由合奏(jam)用玩家选择的音色
   * (经 ref 读取,保证一次性订阅的键盘闭包拿到最新选择)。 */
  const currentInstrument = (): InstrumentId =>
    selectedPartRef.current?.instrument ?? jamInstrumentRef.current

  /**
   * Shared note-on for BOTH the computer keyboard and the JamPad's mouse keys:
   * guard → held-dedupe → local sound + latency readout → sendNote to the room.
   * Reads only refs + stable setters, so a first-render closure stays correct.
   * `oneShot`(鼓垫模式): 每次按下都是独立敲击,不进入 held 去重,也不发送 noteOff。
   */
  const noteOn = (note: number, oneShot = false, velocity = 100): void => {
    if (connStateRef.current !== 'connected') return

    // --- Phase 2 song studio: capture every local press into the recording ---
    const rec = recordingRef.current
    if (rec !== null && latestBeatRef.current !== null) {
      recordNoteOn(rec.notes, note, latestBeatRef.current - rec.startBeat)
      setRecordedCount(rec.notes.length)
    }

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
      const songBeat = (latestBeatRef.current ?? 0) - songStartBeatRef.current
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
    // 按住延音: 记录停止函数,松开(noteOff)时调用
    const stop = inst.play(instrument, note, velocity, targetAudio - ctx.currentTime)
    if (stop !== null) {
      const key = `${instrument}:${note}`
      localVoicesRef.current.get(key)?.()
      localVoicesRef.current.set(key, stop)
    }

    // ① key→sound latency readout: how far the audio output clock has moved
    // past the keydown instant (≈ the hardware input→output latency).
    const latency = sched.latencySince(keydownAt)
    if (latency !== null) {
      setLatencyMs(Math.max(0, Math.round(latency)))
    }

    wsRef.current?.sendNote(note, velocity, instrument)
  }

  /** Shared note-off; releases the remote player's highlight too. */
  const noteOff = (note: number): void => {
    if (!heldNotesRef.current.has(note)) return
    heldNotesRef.current.delete(note)

    // --- Phase 3 song studio: 记录时值(松开时回填该音的 duration) ---
    const rec = recordingRef.current
    if (rec !== null && latestBeatRef.current !== null) {
      recordNoteOff(rec.notes, note, latestBeatRef.current - rec.startBeat)
    }

    setDownNotes((prev) => {
      if (!prev.has(note)) return prev
      const next = new Set(prev)
      next.delete(note)
      return next
    })
    // 松开即止: 停止本地该音色的延音
    const instrument = currentInstrument()
    const key = `${instrument}:${note}`
    localVoicesRef.current.get(key)?.()
    localVoicesRef.current.delete(key)
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

  /** 关闭教程: 记录完成,不再自动弹出。 */
  const handleCloseTutorial = (): void => {
    setTutorialOpen(false)
    localStorage.setItem('orch.tutorialDone', '1')
  }

  /** 切换引导模式(持久化)。 */
  const handleGuideModeChange = (mode: 'ticker' | 'highlight'): void => {
    setGuideMode(mode)
    localStorage.setItem('orch.guideMode', mode)
  }

  /** 请求房间同步开始: 所有已武装玩家在同一小节边界起奏(Phase 1 合奏)。 */
  const handleSyncStart = (): void => {
    wsRef.current?.sendStartSong()
  }

  /** 切换谱面显示(持久化)。 */
  const handleToggleScore = (): void => {
    setShowScore((prev) => {
      localStorage.setItem('orch.showScore', prev ? '0' : '1')
      return !prev
    })
  }

  /** 开始录制: 以当前服务器拍为锚点,之后所有本地弹奏进入录音。 */
  const handleStartRecording = (): void => {
    if (latestBeatRef.current === null) {
      setError('等待节拍网格就绪后再录制(连接后约 1 秒)')
      return
    }
    recordingRef.current = { startBeat: latestBeatRef.current, notes: [] }
    setRecordedCount(0)
    setExportText(null)
    setIsRecording(true)
  }

  /** 停止录制: 保留音符,展示导出文本,等待命名保存。 */
  const handleStopRecording = (): void => {
    const rec = recordingRef.current
    if (rec === null) return
    setIsRecording(false)
    // 排序 + 去重(同音同拍只留一次)
    const notes = finalizeRecording(rec.notes)
    recordingRef.current = { ...rec, notes }
    setRecordedCount(notes.length)
    if (notes.length > 0) {
      const draft: Song = {
        id: 'custom-draft',
        title: '我的新曲',
        bpm: bpmRef.current,
        bpi: bpiRef.current,
        parts: [
          {
            id: 'part1',
            name: '自录',
            instrument: currentInstrument(),
            notes,
          },
        ],
      }
      setShareSong(draft)
      setShareId(null)
      setExportText(exportSongJson(draft))
    }
  }

  /** 保存录音到自定义曲库(立即可选、可进引导/判定/谱面)。 */
  const handleSaveRecording = (title: string): void => {
    const rec = recordingRef.current
    if (rec === null || rec.notes.length === 0) return
    const song: Song = {
      id: `custom-${Date.now().toString(36)}`,
      title,
      bpm: bpmRef.current,
      bpi: bpiRef.current,
      parts: [
        {
          id: 'part1',
          name: '自录',
          instrument: currentInstrument(),
          notes: rec.notes,
        },
      ],
    }
    const next = [...customSongs, song]
    setCustomSongs(next)
    saveCustomSongs(next)
    setExportText(exportSongJson(song))
    setShareSong(song)
    setShareId(null)
    setError(null)
  }

  /** 回放最近一次录制(Phase 3): 按录制时的乐器/曲速经音频管线播放。 */
  const handleReplayRecording = (): void => {
    const rec = recordingRef.current
    const inst = instrumentsRef.current
    const ctx = ctxRef.current
    if (rec === null || inst === null || ctx === null || rec.notes.length === 0) return
    // 使用分享目标里的乐器(保存后即固定);未保存时用当前乐器
    const instrument = shareSong?.parts[0]?.instrument ?? currentInstrument()
    playReplay(ctx, inst, rec.notes, bpmRef.current, instrument)
  }

  /** 导入朋友分享的 JSON 曲目;成功返回 true。 */
  const handleImportSong = (text: string): boolean => {
    const song = importSongJson(text)
    if (song === null) return false
    const next = [...customSongs, song]
    setCustomSongs(next)
    saveCustomSongs(next)
    return true
  }

  /** 把当前曲目 POST 到服务器换取分享码(Phase 3)。 */
  const handleShareSong = async (): Promise<void> => {
    if (shareSong === null) return
    try {
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shareSong),
      })
      if (!res.ok) throw new Error(`share failed: ${res.status}`)
      const data = (await res.json()) as { shareId: string }
      setShareId(data.shareId)
    } catch (err) {
      console.warn('[App] share song failed:', err)
      setError('分享失败: 服务器不可达或拒绝了请求')
    }
  }

  /** 凭分享码从服务器取回曲目并加入曲库;成功返回 true。 */
  const handleFetchShare = async (code: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(code.trim().toUpperCase())}`)
      if (!res.ok) return false
      const song = (await res.json()) as Song
      if (!isValidSong(song)) return false
      const next = [...customSongs, song]
      setCustomSongs(next)
      saveCustomSongs(next)
      // 顺带查点赞数
      const meta = await fetch(
        `/api/songs/${encodeURIComponent(code.trim().toUpperCase())}/meta`,
      ).catch(() => null)
      const likes = meta !== null && meta.ok ? ((await meta.json()) as { likes: number }).likes : 0
      setFetchedCode(code.trim().toUpperCase())
      setFetchedLikes(likes)
      return true
    } catch {
      return false
    }
  }

  /** 给最近取回的分享曲点赞(Phase 3 评分)。 */
  const handleLikeSong = async (): Promise<void> => {
    if (fetchedCode === null) return
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(fetchedCode)}/like`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { likes: number }
      setFetchedLikes(data.likes)
    } catch (err) {
      console.warn('[App] like failed:', err)
    }
  }

  /** Persist per-song BPM overrides. */
  useEffect(() => {
    localStorage.setItem('orch.songBpm', JSON.stringify(songBpmOverrides))
  }, [songBpmOverrides])

  /** 声部音量变更: 立即作用于混音总线并持久化。 */
  const handleMixerChange = (instrument: InstrumentId, volume: number): void => {
    setMixVolumes((prev) => ({ ...prev, [instrument]: volume }))
    instrumentsRef.current?.setInstrumentVolume(instrument, volume)
  }

  /** Persist mixer volumes. */
  useEffect(() => {
    localStorage.setItem('orch.mix', JSON.stringify(mixVolumes))
  }, [mixVolumes])

  /** Persist the free-jam instrument choice. */
  useEffect(() => {
    localStorage.setItem('orch.instrument', jamInstrument)
  }, [jamInstrument])

  /** Pick a song: clears the armed part and applies the song's tempo room-wide. */
  const handleSelectSong = (songId: string): void => {
    // 内置 + 自定义曲库中查找
    const allSongs = [...SONGS, ...customSongs]
    const song = allSongs.find((s) => s.id === songId) ?? null
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
    setSongBeatState(null)
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
    // first beat lands on the metronome accent. 若时钟网格尚不可知(latestBeat
    // 为 null,首条时钟广播未到),挂起武装,onClock 到达后补启动倒计时——
    // 否则用 0 拍当锚点会让倒计时立即过期、整首歌被跳过。
    if (songStartBeatRef.current === null) {
      if (latestBeatRef.current === null) {
        pendingArmRef.current = true
      } else {
        startCountdown()
      }
    }
    judgeRef.current = new Judge(part.notes, { enabled: judgeEnabledRef.current })
    setJudgeStats(judgeRef.current.stats())
    setJudgeBadge(null)
  }

  /** Restart the armed song: reset position + judgment, run the countdown again. */
  const handleRestart = (): void => {
    if (selectedPartRef.current === null) return
    songStartBeatRef.current = null
    if (latestBeatRef.current === null) {
      pendingArmRef.current = true
    } else {
      startCountdown()
    }
    setGuideCurrent(new Set())
    setGuideUpcoming(new Set())
    setGuideProgress(0)
    setSongBeatState(null)
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
      midiConnectionRef.current?.disconnect()
      midiConnectionRef.current = null
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

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <span className="brand-kicker">Orchestra // Phase 0 · Sync Validation</span>
          <h1 className="brand-title">JamPad</h1>
        </div>
        <button
          type="button"
          className="btn btn-tutorial"
          data-testid="tutorial-btn"
          onClick={() => setTutorialOpen(true)}
        >
          新手教程 / 演奏手册
        </button>
        <p className="tagline">
          Two browsers, one room. Hit a key here, <b>hear it in the other room</b> — and watch the
          clock offset and server beat settle in the status panel.
        </p>
      </header>

      <main className="app-main">
        <div className="app-left">
          <LinkUpPanel
            serverUrl={serverUrl}
            onServerUrlChange={setServerUrl}
            name={name}
            onNameChange={setName}
            roomCodeInput={roomCodeInput}
            onRoomCodeInputChange={setRoomCodeInput}
            connState={connState}
            onCreate={() => void handleConnect('create')}
            onJoin={() => void handleConnect('join')}
            midiState={midiState}
            midiDevices={midiDevices}
            onConnectMidi={() => void handleConnectMidi()}
            roomCode={roomCode}
            onCopyRoomCode={handleCopyRoomCode}
            copied={roomCodeCopied}
          />

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

          <InstrumentPicker
            current={selectedPart?.instrument ?? jamInstrument}
            locked={selectedPart !== null}
            lockedLabel={selectedPart?.name}
            enabled={connState === 'connected'}
            onChange={setJamInstrument}
          />

          <MixerPanel volumes={mixVolumes} onChange={handleMixerChange} />

          <SongPicker
            songs={[...SONGS, ...customSongs]}
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
            guideMode={guideMode}
            onGuideModeChange={handleGuideModeChange}
            showScore={showScore}
            onToggleScore={handleToggleScore}
            onSyncStart={handleSyncStart}
          />

          <SongStudio
            enabled={connState === 'connected'}
            recording={isRecording}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            recordedCount={recordedCount}
            onSave={handleSaveRecording}
            onImport={handleImportSong}
            exportText={exportText}
            onShare={() => handleShareSong()}
            shareId={shareId}
            onFetchShare={handleFetchShare}
            onReplay={handleReplayRecording}
            fetchedLikes={fetchedLikes}
            onLike={handleLikeSong}
          />

          <TempoPanel
            connState={connState}
            bpm={bpm}
            onTempoChange={handleTempoChange}
            bpi={bpi}
            onBpiChange={handleBpiChange}
            metronomeOn={metronomeOn}
            onMetronomeToggle={handleMetronomeToggle}
          />
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
          {guideMode === 'ticker' ? (
            <GuideTicker
              notes={selectedPart?.notes ?? []}
              getSongBeat={getSongBeat}
              prepBeats={prepBeats}
              enabled={connState === 'connected'}
            />
          ) : selectedPart?.instrument === 'drums' ? (
            // 乐器高亮模式 + 鼓声部: 琴键(48+)之外的 GM 鼓件在 DrumPad 上高亮
            <DrumPad
              notes={selectedPart.notes}
              guideCurrent={guideCurrent}
              guideUpcoming={guideUpcoming}
              downNotes={downNotes}
              remoteNotes={remoteNotes}
              enabled={connState === 'connected'}
              onHit={(note) => noteOn(note, true)}
            />
          ) : null}
          {showScore && selectedSong !== null && (
            <ScoreView
              song={selectedSong}
              part={selectedPart}
              songBeat={songBeatState}
              enabled={connState === 'connected'}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        <span>clock offset = server − client · positive means server is ahead</span>
        <span>pitch keys: white A–K, Z–M · black W–U, Q–6 (C3–C5) · drums: A/S/D/F… = kick/snare/hat…</span>
      </footer>

      <TutorialModal open={tutorialOpen} onClose={handleCloseTutorial} />
    </div>
  )
}
