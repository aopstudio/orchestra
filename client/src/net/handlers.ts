/**
 * 协议处理器工厂(从 App.tsx 拆出)。
 *
 * 所有 handler 只通过 deps 里的 refs/setters/函数访问管线对象,因此可以
 * **一次性创建**(App 在首次渲染时惰性初始化),后续重连/重渲染都不会重建。
 * 这是 React 文档的 lazy-ref-init 模式;react-hooks/refs 规则会保守地标记,
 * 调用方(App)用块级 eslint-disable 豁免并注明理由。
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { SyncSample } from '../sync/clockOffset'
import type { Instruments } from '../audio/instruments'
import type { LookaheadScheduler } from '../audio/scheduler'
import type { Metronome } from '../audio/metronome'
import type { BeatGrid } from '../sync/beatGrid'
import type { Judge } from '../guide/judge'
import type { SongPart } from '../songs/songs'
import type { Peer, ConnState } from '../ui/StatusPanel'
import { advanceGuide } from '../guide/guideEngine'
import { PAD_HIGH_NOTE, PAD_LOW_NOTE } from '../ui/JamPad'
import type { WsClient, WsHandlers } from './wsClient'

export interface HandlerDeps {
  // 管线对象(经 refs 访问,保证闭包永远读到最新实例)
  wsRef: MutableRefObject<WsClient | null>
  instrumentsRef: MutableRefObject<Instruments | null>
  schedulerRef: MutableRefObject<LookaheadScheduler | null>
  metronomeRef: MutableRefObject<Metronome | null>
  beatGridRef: MutableRefObject<BeatGrid | null>
  bpmRef: MutableRefObject<number>
  bpiRef: MutableRefObject<number>
  latestBeatRef: MutableRefObject<number | null>
  beatAnchorRef: MutableRefObject<{ beat: number; localTime: number; tempo: number } | null>
  countdownUntilRef: MutableRefObject<number | null>
  songStartBeatRef: MutableRefObject<number | null>
  selectedPartRef: MutableRefObject<SongPart | null>
  judgeRef: MutableRefObject<Judge | null>
  judgeEnabledRef: MutableRefObject<boolean>
  pendingArmRef: MutableRefObject<boolean>
  pendingSyncRef: MutableRefObject<((sample: SyncSample) => void) | null>
  runSyncRef: MutableRefObject<() => Promise<void>>
  // 首次渲染闭包安全: 以下函数只读 refs / 稳定 setter
  startAudioPipeline: (bpmValue: number) => Promise<void>
  ensureInstruments: () => Promise<Instruments | null>
  startCountdown: () => void
  // 稳定 setter
  setMyId: Dispatch<SetStateAction<string | null>>
  setRoomCode: Dispatch<SetStateAction<string | null>>
  setBpm: Dispatch<SetStateAction<number>>
  setBpi: Dispatch<SetStateAction<number>>
  setConnState: Dispatch<SetStateAction<ConnState>>
  setPeers: Dispatch<SetStateAction<Peer[]>>
  setError: Dispatch<SetStateAction<string | null>>
  setClockBeat: Dispatch<SetStateAction<{ beat: number; tempo: number } | null>>
  setCountdownBeatsLeft: Dispatch<SetStateAction<number | null>>
  setPrepBeats: Dispatch<SetStateAction<number>>
  setSongBeatState: Dispatch<SetStateAction<number | null>>
  setGuideCurrent: Dispatch<SetStateAction<ReadonlySet<number>>>
  setGuideUpcoming: Dispatch<SetStateAction<ReadonlySet<number>>>
  setGuideProgress: Dispatch<SetStateAction<number>>
  setJudgeStats: Dispatch<SetStateAction<{ hits: number; misses: number; mistakes: number; score: number }>>
  setRemoteNotes: Dispatch<SetStateAction<ReadonlySet<number>>>
}

/**
 * 创建一次性协议处理器。必须在首次渲染时调用并缓存结果
 * (App 用 `if (handlersRef.current === null) handlersRef.current = createProtocolHandlers(deps)`)。
 */
export function createProtocolHandlers(deps: HandlerDeps): WsHandlers {
  const {
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
  } = deps

  return {
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
      // 若武装发生在第一条时钟广播之前(latestBeat 未知),现在补启动倒计时
      if (pendingArmRef.current && latestBeatRef.current !== null) {
        pendingArmRef.current = false
        startCountdown()
      }
      // Countdown: if a start was requested, show the preparation beats and
      // only begin the song (anchor songStartBeat) once the countdown elapses.
      const countdownUntil = countdownUntilRef.current
      if (countdownUntil !== null) {
        const beatsLeft = countdownUntil - msg.beat
        if (beatsLeft > 0) {
          setCountdownBeatsLeft(Math.ceil(beatsLeft))
          setSongBeatState(null)
          return
        }
        countdownUntilRef.current = null
        songStartBeatRef.current = countdownUntil
        setCountdownBeatsLeft(null)
      }
      const startBeat = songStartBeatRef.current
      if (part !== null && startBeat !== null) {
        const songBeat = msg.beat - startBeat
        setSongBeatState(songBeat)
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
        const hook = window as unknown as {
          __orchNotes?: number
          __orchLastInstrument?: string
        }
        hook.__orchNotes = (hook.__orchNotes ?? 0) + 1
        hook.__orchLastInstrument = msg.instrument
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

    onSongStart: (msg) => {
      // 房间同步开始(Phase 1 合奏): 服务器广播统一的开始边界拍。
      // 已武装且尚未开始的玩家,把自己的倒计时锚到该边界,全房间同一拍起奏。
      const part = selectedPartRef.current
      if (part === null || songStartBeatRef.current !== null) return
      countdownUntilRef.current = msg.beat
      const now = latestBeatRef.current
      const total =
        now === null ? Math.max(1, msg.beat) : Math.max(1, Math.ceil(msg.beat - now))
      setCountdownBeatsLeft(total)
      setPrepBeats(total)
      setSongBeatState(null)
    },
  }
}
