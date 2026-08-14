/**
 * 房间管理器(Phase 1 多房间)
 *
 * - 创建房间: 生成唯一的 6 位房间码(字母表剔除 0/O/1/I/L 等易混淆字符)
 * - 加入房间: 按码查找,不存在则返回 null(由调用方回 roomError)
 * - 回收: 房间成员清空时自动删除(createRoom 的 onEmpty 回调)
 * - 所有房间共享同一个服务器单调时钟(now),但各自持有独立的节拍时钟
 */

import { randomInt } from 'node:crypto'
import { createRoom, type Room, type RoomMember } from './room'

/** 无易混淆字符的房间码字母表: 0/O、1/I/L 已剔除 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export interface RoomEntry {
  /** 规范化后的房间码(大写、无空白) */
  code: string
  room: Room
}

export interface RoomManager {
  /** 创建新房间并把 member 作为第一个成员加入 */
  createRoom(member: RoomMember): RoomEntry
  /** 按房间码加入;房间不存在返回 null */
  joinRoom(code: string, member: RoomMember): RoomEntry | null
  /** 当前存活的房间数 */
  roomsCount(): number
  /** 遍历所有房间(如定时广播节拍时钟) */
  forEachRoom(fn: (entry: RoomEntry) => void): void
}

export function createRoomManager(now: () => number): RoomManager {
  const rooms = new Map<string, Room>()

  function generateCode(): string {
    let code: string
    do {
      code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] ?? 'A',
      ).join('')
    } while (rooms.has(code))
    return code
  }

  return {
    createRoom(member) {
      const code = generateCode()
      const room = createRoom(120, 4, now, code, () => {
        rooms.delete(code)
      })
      rooms.set(code, room)
      room.join(member)
      return { code, room }
    },

    joinRoom(rawCode, member) {
      const code = rawCode.trim().toUpperCase()
      const room = rooms.get(code)
      if (room === undefined) return null
      room.join(member)
      return { code, room }
    },

    roomsCount: () => rooms.size,

    forEachRoom(fn) {
      for (const [code, room] of rooms) {
        fn({ code, room })
      }
    },
  }
}
