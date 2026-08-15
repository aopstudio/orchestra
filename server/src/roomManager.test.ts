import { describe, expect, it } from 'vitest'
import { createRoomManager } from './roomManager'
import type { RoomMember } from './room'
import type { ServerMsg } from '@orchestra/shared'

function makeMember(id: string, name: string, log: ServerMsg[] = []): RoomMember {
  return { id, name, ready: false, send: (msg) => log.push(msg) }
}

/** 真实短定时器: 用尽量小的回收时长 + 等待。 */
const SHORT_RECLAIM_MS = 60

async function wait(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

describe('roomManager', () => {
  it('创建房间返回唯一房间码,welcome 携带房间码', () => {
    const mgr = createRoomManager(() => 1000)
    const log: ServerMsg[] = []
    const a = makeMember('a', 'Alice', log)
    const first = mgr.createRoom(a)
    expect(first.code).toMatch(/^[A-Z2-9]{6}$/)
    expect(log[0]).toMatchObject({ type: 'welcome', roomCode: first.code })

    const log2: ServerMsg[] = []
    const b = makeMember('b', 'Bob', log2)
    const second = mgr.createRoom(b)
    expect(second.code).not.toBe(first.code)
  })

  it('按房间码加入已有房间,通知原成员;加入取消空房回收', async () => {
    const mgr = createRoomManager(() => 1000, SHORT_RECLAIM_MS)
    const logA: ServerMsg[] = []
    const a = makeMember('a', 'Alice', logA)
    const { code, room } = mgr.createRoom(a)
    // 最后一人离开 → 进入回收宽限期
    room.leave(a.id)
    expect(mgr.roomsCount()).toBe(1) // 宽限期内仍存活

    // 宽限期内加入 → 房间复活,回收取消
    const logB: ServerMsg[] = []
    const b = makeMember('b', 'Bob', logB)
    const joined = mgr.joinRoom(code, b)
    expect(joined).not.toBeNull()
    expect(logB[0]).toMatchObject({ type: 'welcome', roomCode: code })
    await wait(SHORT_RECLAIM_MS * 3)
    expect(mgr.roomsCount()).toBe(1) // 加入后不再被回收
  })

  it('空房超过宽限期被回收,房间码释放', async () => {
    const mgr = createRoomManager(() => 1000, SHORT_RECLAIM_MS)
    const { code, room } = mgr.createRoom(makeMember('a', 'Alice'))
    room.leave('a')
    expect(mgr.roomsCount()).toBe(1)
    await wait(SHORT_RECLAIM_MS * 3)
    expect(mgr.roomsCount()).toBe(0)
    expect(mgr.joinRoom(code, makeMember('c', 'Carol'))).toBeNull()
  })

  it('房间码大小写不敏感、忽略空白;不存在返回 null', () => {
    const mgr = createRoomManager(() => 1000)
    const { code } = mgr.createRoom(makeMember('a', 'Alice'))
    expect(mgr.joinRoom(` ${code.toLowerCase()} `, makeMember('b', 'Bob'))).not.toBeNull()
    expect(mgr.joinRoom('ZZZZZZ', makeMember('a', 'Alice'))).toBeNull()
  })

  it('成员未全离开时不回收;空房回收期间再次空置幂等', async () => {
    const mgr = createRoomManager(() => 1000, SHORT_RECLAIM_MS)
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    const { code, room } = mgr.createRoom(a)
    mgr.joinRoom(code, b)
    room.leave(a.id)
    // 还有 B,不回收
    await wait(SHORT_RECLAIM_MS * 3)
    expect(mgr.roomsCount()).toBe(1)
    room.leave(b.id)
    await wait(SHORT_RECLAIM_MS * 3)
    expect(mgr.roomsCount()).toBe(0)
  })

  it('forEachRoom 遍历所有房间', () => {
    const mgr = createRoomManager(() => 1000)
    mgr.createRoom(makeMember('a', 'A'))
    mgr.createRoom(makeMember('b', 'B'))
    const codes: string[] = []
    mgr.forEachRoom((entry) => codes.push(entry.code))
    expect(codes).toHaveLength(2)
  })
})
