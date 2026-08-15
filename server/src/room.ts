import type { InstrumentId, ServerMsg } from '@orchestra/shared'
import { nextBarBoundary } from '@orchestra/shared'
import { createBeatClock } from './beatClock'

export interface RoomMember {
  id: string
  name: string
  /** 在线成员级准备状态(所有在线玩家都 ready 后房主才能开始)。 */
  ready: boolean
  send(msg: ServerMsg): void
}

export interface Room {
  size(): number
  /** 当前房主(房间创建者)的成员 id。房主离开时转移给最早的成员。 */
  get ownerId(): string
  join(member: RoomMember): void
  leave(id: string): void
  note(fromId: string, note: number, velocity: number, instrument: InstrumentId): void
  noteOff(fromId: string, note: number): void
  setTempo(bpm: number): void
  setBpi(bpi: number): void
  /**
   * 广播同步开始: 全房间在同一个下一个小节边界开始各自的武装声部。
   * 仅房主可调用,且所有在线成员都已准备。
   */
  startSong(memberId: string, minAheadBeats?: number): 'ok' | 'notOwner' | 'notReady'
  /**
   * 自由合奏同步起奏: `bars` 预备小节后统一起奏。
   * pickup=false 起于小节边界(强拍);pickup=true 起于边界前一拍(弱起)。
   */
  startJam(bars: number, pickup: boolean): void
  /**
   * 房主(或唯一在线成员)选定/取消房间曲目。
   * songId=null 取消选曲(清空认领);换歌自动清空旧认领。
   */
  selectSong(memberId: string, songId: string | null): 'ok' | 'notOwner'
  /**
   * 认领/取消认领声部(歌曲必须等于房主选定的歌曲)。
   * partId=null 取消自己的认领。被占/未选曲时由调用方回 partError。
   */
  selectPart(
    memberId: string,
    songId: string,
    partId: string | null,
  ): 'ok' | 'taken' | 'wrongSong' | 'noSong'
  /** 设置/取消在线成员级准备状态并广播编排状态。 */
  setReady(memberId: string, ready: boolean): void
  /** 修改自己的玩家名称并广播(playerRenamed + 认领表同步)。 */
  setName(memberId: string, name: string): void
  sync(memberId: string, t1: number): void
  broadcastClock(): void
}

/** 房间合奏编排: 歌曲 + 声部认领。歌曲由房主选定,null=尚未选曲。 */
export interface EnsembleState {
  songId: string | null
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
  /** 房间合奏编排(声部认领与准备);null 表示无编排,也用于"尚未选曲"。 */
  let ensemble: EnsembleState | null = null
  /** 房主(创建者);离开时转移给剩余成员中最早加入的。 */
  let ownerId = ''

  /** 广播当前编排状态(全房间)。含房主与所有在线成员准备状态。 */
  function broadcastEnsemble(): void {
    const msg: ServerMsg = {
      type: 'ensembleState',
      songId: ensemble?.songId ?? null,
      bpi: beatClock.bpi,
      ownerId,
      parts: (ensemble?.claims ?? []).map((cl) => ({
        partId: cl.partId,
        playerId: cl.playerId,
        playerName: cl.playerName,
        ready: cl.ready,
      })),
      members: [...members.values()].map((m) => ({
        playerId: m.id,
        playerName: m.name,
        ready: m.ready,
      })),
    }
    for (const m of members.values()) {
      m.send(msg)
    }
  }

  /** 广播房主选定/取消的曲目(全房间同步高亮)。 */
  function broadcastSongSelected(songId: string | null): void {
    const msg: ServerMsg = { type: 'songSelected', songId }
    for (const m of members.values()) {
      m.send(msg)
    }
  }

  return {
    size: () => members.size,

    get ownerId() {
      return ownerId
    },

    join(member) {
      members.set(member.id, member)
      // 第一个加入的成员(创建者)成为房主
      if (ownerId === '') {
        ownerId = member.id
      }
      member.send({
        type: 'welcome',
        id: member.id,
        name: member.name,
        roomCode,
        bpm: beatClock.bpm,
        bpi: beatClock.bpi,
        ownerId,
      })
      // 双向广播: 新成员得知所有已有成员(回填名单),已有成员得知新成员。
      // 缺少回填会让后来者永远看不到先来的玩家。
      for (const m of members.values()) {
        if (m.id === member.id) continue
        member.send({ type: 'peerJoined', id: m.id, name: m.name })
        m.send({ type: 'peerJoined', id: member.id, name: member.name })
      }
      // 新成员立即同步当前编排状态(房主/歌曲/认领/成员准备)
      broadcastEnsemble()
    },

    leave(id) {
      const leaving = members.get(id)
      if (!leaving) return
      members.delete(id)
      for (const m of members.values()) {
        m.send({ type: 'peerLeft', id })
      }
      // 释放该成员的声部认领
      if (ensemble !== null) {
        const before = ensemble.claims.length
        ensemble.claims = ensemble.claims.filter((cl) => cl.playerId !== id)
        if (ensemble.claims.length !== before && ensemble.claims.length > 0) {
          broadcastEnsemble()
        }
      }
      // 房主离开 → 转移给剩余成员中最早加入的(始终有人有权选曲/开始)
      if (ownerId === id && members.size > 0) {
        ownerId = members.keys().next().value as string
      }
      if (members.size > 0) {
        broadcastEnsemble()
      }
      // 房间空掉后由管理器回收(如删除房间码映射)
      if (members.size === 0) {
        onEmpty?.()
      }
    },

    selectSong(memberId, songId) {
      // 选曲权: 房主,或当前房间唯一在线成员(房主不在时)
      if (memberId !== ownerId && members.size > 1) return 'notOwner'
      if (songId === null) {
        // 取消选曲: 清空编排
        ensemble = null
        broadcastSongSelected(null)
        broadcastEnsemble()
        return 'ok'
      }
      ensemble = { songId, claims: [] }
      broadcastSongSelected(songId)
      broadcastEnsemble()
      return 'ok'
    },

    selectPart(memberId, songId, partId) {
      const member = members.get(memberId)
      if (member === undefined) return 'wrongSong'
      // 歌曲必须等于房主选定的歌曲(选曲权在房主)
      if (ensemble === null || ensemble.songId !== songId) return 'noSong'
      if (partId === null) {
        // 取消认领
        const before = ensemble.claims.length
        ensemble.claims = ensemble.claims.filter((cl) => cl.playerId !== memberId)
        if (ensemble.claims.length !== before) broadcastEnsemble()
        return 'ok'
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
        ready: member.ready,
      })
      broadcastEnsemble()
      return 'ok'
    },

    setReady(memberId, ready) {
      const member = members.get(memberId)
      if (member === undefined) return
      // 在线成员级准备(不要求已认领声部): 所有在线玩家都 ready 后房主才能开始
      member.ready = ready
      if (ensemble !== null) {
        for (const cl of ensemble.claims) {
          if (cl.playerId === memberId) cl.ready = ready
        }
      }
      broadcastEnsemble()
    },

    setName(memberId, name) {
      const member = members.get(memberId)
      if (member === undefined) return
      const trimmed = name.trim().slice(0, 20)
      if (trimmed === '' || trimmed === member.name) return
      member.name = trimmed
      // 认领表里的玩家名同步更新(声部认领展示处也显示新名字)
      if (ensemble !== null) {
        for (const cl of ensemble.claims) {
          if (cl.playerId === memberId) cl.playerName = trimmed
        }
      }
      const msg: ServerMsg = { type: 'playerRenamed', id: memberId, name: trimmed }
      for (const m of members.values()) {
        m.send(msg)
      }
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

    startSong(memberId, minAheadBeats = 4) {
      // 仅房主可开始,且所有在线成员都已准备、至少有一个声部被认领
      if (memberId !== ownerId) return 'notOwner'
      const allReady = [...members.values()].every((m) => m.ready)
      const hasClaim = ensemble !== null && ensemble.claims.length > 0
      if (!allReady || !hasClaim) return 'notReady'
      const serverTime = now()
      const beat = beatClock.beatAt(serverTime)
      const boundary = nextBarBoundary(beat, beatClock.bpi, minAheadBeats)
      const msg: ServerMsg = { type: 'songStart', beat: boundary, bpi: beatClock.bpi }
      for (const m of members.values()) {
        m.send(msg)
      }
      return 'ok'
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
