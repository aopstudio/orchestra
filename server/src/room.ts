import type { ServerMsg } from '@orchestra/shared'
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
  note(fromId: string, note: number, velocity: number): void
  noteOff(fromId: string, note: number): void
  setTempo(bpm: number): void
  setBpi(bpi: number): void
  sync(memberId: string, t1: number): void
  broadcastClock(): void
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
      for (const m of members.values()) {
        if (m.id !== member.id) {
          m.send({ type: 'peerJoined', id: member.id, name: member.name })
        }
      }
    },

    leave(id) {
      const leaving = members.get(id)
      if (!leaving) return
      members.delete(id)
      for (const m of members.values()) {
        m.send({ type: 'peerLeft', id })
      }
      // 房间空掉后由管理器回收(如删除房间码映射)
      if (members.size === 0) {
        onEmpty?.()
      }
    },

    note(fromId, note, velocity) {
      const serverTime = now()
      for (const m of members.values()) {
        if (m.id !== fromId) {
          m.send({ type: 'note', from: fromId, note, velocity, serverTime })
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
