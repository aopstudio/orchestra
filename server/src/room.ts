import type { InstrumentId, ServerMsg } from '@orchestra/shared'
import { nextBarBoundary } from '@orchestra/shared'
import { createBeatClock } from './beatClock'

export interface RoomMember {
  id: string
  name: string
  send(msg: ServerMsg): void
}

export interface Room {
  size(): number
  join(member: RoomMember): void
  leave(id: string): void
  note(fromId: string, note: number, velocity: number, instrument: InstrumentId): void
  noteOff(fromId: string, note: number): void
  setTempo(bpm: number): void
  setBpi(bpi: number): void
  /** 广播同步开始: 全房间在同一个下一个小节边界开始各自的武装声部。 */
  startSong(minAheadBeats?: number): void
  /**
   * 自由合奏同步起奏: `bars` 预备小节后统一起奏。
   * pickup=false 起于小节边界(强拍);pickup=true 起于边界前一拍(弱起)。
   */
  startJam(bars: number, pickup: boolean): void
  /** 认领声部;返回结果。被占/歌曲不一致时由调用方回 partError。 */
  selectPart(memberId: string, songId: string, partId: string): 'ok' | 'taken' | 'wrongSong'
  /** 设置/取消准备状态并广播编排状态。 */
  setReady(memberId: string, ready: boolean): void
  sync(memberId: string, t1: number): void
  broadcastClock(): void
}

/** 房间合奏编排: 歌曲 + 声部认领与准备状态。 */
export interface EnsembleState {
  songId: string
  claims: Array<{ partId: string; playerId: string; playerName: string; ready: boolean }>
}

export function createRoom(
  bpm: number,
  bpi: number,
  now: () => number,
  roomCode: string,
  onEmpty?: () => void,
): Room {
  const beatClock = createBeatClock(bpm, bpi, now)
  const members = new Map<string, RoomMember>()
  /** 房间合奏编排(声部认领与准备);null = 尚未开始编排。 */
  let ensemble: EnsembleState | null = null

  /** 广播当前编排状态(全房间)。 */
  function broadcastEnsemble(): void {
    if (ensemble === null) return
    const msg: ServerMsg = {
      type: 'ensembleState',
      songId: ensemble.songId,
      bpi: beatClock.bpi,
      parts: ensemble.claims.map((cl) => ({
        partId: cl.partId,
        playerId: cl.playerId,
        playerName: cl.playerName,
        ready: cl.ready,
      })),
    }
    for (const m of members.values()) {
      m.send(msg)
    }
  }

  return {
    size: () => members.size,

    join(member) {
      members.set(member.id, member)
      member.send({
        type: 'welcome',
        id: member.id,
        name: member.name,
        roomCode,
        bpm: beatClock.bpm,
        bpi: beatClock.bpi,
      })
      // 双向广播: 新成员得知所有已有成员(回填名单),已有成员得知新成员。
      // 缺少回填会让后来者永远看不到先来的玩家。
      for (const m of members.values()) {
        if (m.id === member.id) continue
        member.send({ type: 'peerJoined', id: m.id, name: m.name })
        m.send({ type: 'peerJoined', id: member.id, name: member.name })
      }
    },

    leave(id) {
      const leaving = members.get(id)
      if (!leaving) return
      members.delete(id)
      for (const m of members.values()) {
        m.send({ type: 'peerLeft', id })
      }
      // 释放该成员的声部认领并广播
      if (ensemble !== null) {
        const before = ensemble.claims.length
        ensemble.claims = ensemble.claims.filter((cl) => cl.playerId !== id)
        if (ensemble.claims.length !== before) {
          if (ensemble.claims.length === 0) {
            ensemble = null
          } else {
            broadcastEnsemble()
          }
        }
      }
      // 房间空掉后由管理器回收(如删除房间码映射)
      if (members.size === 0) {
        onEmpty?.()
      }
    },

    selectPart(memberId, songId, partId) {
      const member = members.get(memberId)
      if (member === undefined) return 'wrongSong'
      // 编排歌曲: 首次认领确定房间歌曲,后续必须一致
      if (ensemble === null) {
        ensemble = { songId, claims: [] }
      } else if (ensemble.songId !== songId) {
        return 'wrongSong'
      }
      // 声部已被他人认领 → 拒绝
      if (ensemble.claims.some((cl) => cl.partId === partId && cl.playerId !== memberId)) {
        return 'taken'
      }
      // 释放该成员之前认领的声部(换声部)
      ensemble.claims = ensemble.claims.filter((cl) => cl.playerId !== memberId)
      ensemble.claims.push({
        partId,
        playerId: memberId,
        playerName: member.name,
        ready: false,
      })
      broadcastEnsemble()
      return 'ok'
    },

    setReady(memberId, ready) {
      if (ensemble === null) return
      const claim = ensemble.claims.find((cl) => cl.playerId === memberId)
      if (claim === undefined) return
      claim.ready = ready
      broadcastEnsemble()
    },

    note(fromId, note, velocity, instrument) {
      const serverTime = now()
      for (const m of members.values()) {
        if (m.id !== fromId) {
          m.send({ type: 'note', from: fromId, note, velocity, instrument, serverTime })
        }
      }
    },

    noteOff(fromId, note) {
      const serverTime = now()
      for (const m of members.values()) {
        if (m.id !== fromId) {
          m.send({ type: 'noteOff', from: fromId, note, serverTime })
        }
      }
    },

    setTempo(bpm) {
      beatClock.setTempo(bpm)
      const serverTime = now()
      const msg: ServerMsg = { type: 'tempo', bpm: beatClock.bpm, serverTime }
      for (const m of members.values()) {
        m.send(msg)
      }
    },

    setBpi(newBpi) {
      beatClock.setBpi(newBpi)
      const serverTime = now()
      const msg: ServerMsg = { type: 'bpi', bpi: beatClock.bpi, serverTime }
      for (const m of members.values()) {
        m.send(msg)
      }
      // The meter change re-anchors the bar (next beat = beat 1 of the new
      // meter). Push a clock immediately so clients see the new grid right
      // away instead of waiting up to 500ms for the periodic broadcast.
      this.broadcastClock()
    },

    startSong(minAheadBeats = 4) {
      const serverTime = now()
      const beat = beatClock.beatAt(serverTime)
      const boundary = nextBarBoundary(beat, beatClock.bpi, minAheadBeats)
      const msg: ServerMsg = { type: 'songStart', beat: boundary, bpi: beatClock.bpi }
      for (const m of members.values()) {
        m.send(msg)
      }
    },

    startJam(bars, pickup) {
      const serverTime = now()
      const beat = beatClock.beatAt(serverTime)
      const leadBeats = Math.max(1, Math.round(bars) * beatClock.bpi)
      const boundary = nextBarBoundary(beat, beatClock.bpi, leadBeats)
      // 小节开始: 起于边界(强拍);弱起: 起于边界前一拍(上一小节末拍)
      const startBeat = pickup ? boundary - 1 : boundary
      const msg: ServerMsg = { type: 'jamStart', startBeat, bpi: beatClock.bpi, pickup }
      for (const m of members.values()) {
        m.send(msg)
      }
    },

    sync(memberId, t1) {
      const member = members.get(memberId)
      if (!member) return
      member.send({ type: 'syncAck', t1, t2: now(), t3: now() })
    },

    broadcastClock() {
      const serverTime = now()
      const beat = beatClock.beatAt(serverTime)
      for (const m of members.values()) {
        m.send({ type: 'clock', beat, tempo: beatClock.bpm, bpi: beatClock.bpi, serverTime })
      }
    },
  }
}
