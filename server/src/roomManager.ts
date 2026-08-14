/**
 * 房间管理器(Phase 1 多房间 + 资源回收)
 *
 * - 创建房间: 生成唯一的 6 位房间码(字母表剔除 0/O/1/I/L 等易混淆字符)
 * - 加入房间: 按码查找,不存在则返回 null(由调用方回 roomError)
 * - **空房回收宽限期**: 最后一个成员离开后,房间保留 `reclaimMs`(默认 30 分钟)
 *   供重连/朋友加入;期间有人加入则取消回收,超时未加入则删除房间并释放房间码。
 *   —— 这使"断线重连回原房间"和"朋友稍后加入"都健壮,同时避免死房间长期占用。
 * - 所有房间共享同一个服务器单调时钟(now),但各自持有独立的节拍时钟
 */

import { randomInt } from 'node:crypto'
import { createRoom, type Room, type RoomMember } from './room'

/** 无易混淆字符的房间码字母表: 0/O、1/I/L 已剔除 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

/** 空房间回收宽限期: 默认 30 分钟(可用 ROOM_RECLAIM_MS 环境变量覆盖)。 */
export const DEFAULT_RECLAIM_MS = 30 * 60 * 1000

export interface RoomEntry {
  /** 规范化后的房间码(大写、无空白) */
  code: string
  room: Room
}

interface RoomSlot {
  room: Room
  /** 空房回收定时器;null = 无待回收。 */
  reclaimTimer: ReturnType<typeof setTimeout> | null
}

export interface RoomManager {
  /** 创建新房间并把 member 作为第一个成员加入 */
  createRoom(member: RoomMember): RoomEntry
  /** 按房间码加入;房间不存在返回 null。加入会取消该房间的空房回收。 */
  joinRoom(code: string, member: RoomMember): RoomEntry | null
  /** 当前存活的房间数(含空置宽限期内的房间) */
  roomsCount(): number
  /** 遍历所有房间(如定时广播节拍时钟) */
  forEachRoom(fn: (entry: RoomEntry) => void): void
}

export function createRoomManager(
  now: () => number,
  reclaimMs: number = DEFAULT_RECLAIM_MS,
): RoomManager {
  const slots = new Map<string, RoomSlot>()

  function generateCode(): string {
    let code: string
    do {
      code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] ?? 'A',
      ).join('')
    } while (slots.has(code))
    return code
  }

  /** 空房后启动回收倒计时(幂等)。 */
  function scheduleReclaim(code: string): void {
    const slot = slots.get(code)
    if (slot === undefined || slot.reclaimTimer !== null) return
    slot.reclaimTimer = setTimeout(() => {
      slots.delete(code)
      console.log(`[room] ${code} reclaimed after ${Math.round(reclaimMs / 1000)}s idle`)
    }, reclaimMs)
    // 回收定时器不阻止进程退出(纯资源清理,不承载业务)
    slot.reclaimTimer.unref?.()
  }

  /** 有人加入/房间复活时取消回收倒计时。 */
  function cancelReclaim(code: string): void {
    const slot = slots.get(code)
    if (slot === undefined) return
    if (slot.reclaimTimer !== null) {
      clearTimeout(slot.reclaimTimer)
      slot.reclaimTimer = null
    }
  }

  return {
    createRoom(member) {
      const code = generateCode()
      const slot: RoomSlot = {
        room: createRoom(120, 4, now, code, () => scheduleReclaim(code)),
        reclaimTimer: null,
      }
      slots.set(code, slot)
      slot.room.join(member)
      return { code, room: slot.room }
    },

    joinRoom(rawCode, member) {
      const code = rawCode.trim().toUpperCase()
      const slot = slots.get(code)
      if (slot === undefined) return null
      // 有人加入 → 取消空房回收(房间复活)
      cancelReclaim(code)
      slot.room.join(member)
      return { code, room: slot.room }
    },

    roomsCount: () => slots.size,

    forEachRoom(fn) {
      for (const [code, slot] of slots) {
        fn({ code, room: slot.room })
      }
    },
  }
}
