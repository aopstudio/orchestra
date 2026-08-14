import { describe, expect, it } from 'vitest'
import { createRoomManager } from './roomManager'
import type { RoomMember } from './room'
import type { ServerMsg } from '@orchestra/shared'

function makeMember(id: string, name: string, log: ServerMsg[] = []): RoomMember {
  return { id, name, send: (msg) => log.push(msg) }
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

  it('按房间码加入已有房间,通知原成员', () => {
    const mgr = createRoomManager(() => 1000)
    const logA: ServerMsg[] = []
    const a = makeMember('a', 'Alice', logA)
    const { code } = mgr.createRoom(a)

    const logB: ServerMsg[] = []
    const b = makeMember('b', 'Bob', logB)
    const joined = mgr.joinRoom(code, b)
    expect(joined).not.toBeNull()
    expect(joined?.code).toBe(code)
    expect(logB[0]).toMatchObject({ type: 'welcome', roomCode: code })
    expect(logA.some((m) => m.type === 'peerJoined' && m.name === 'Bob')).toBe(true)
  })

  it('房间码大小写不敏感、忽略空白', () => {
    const mgr = createRoomManager(() => 1000)
    const { code } = mgr.createRoom(makeMember('a', 'Alice'))
    const b = makeMember('b', 'Bob')
    expect(mgr.joinRoom(` ${code.toLowerCase()} `, b)).not.toBeNull()
  })

  it('加入不存在的房间返回 null', () => {
    const mgr = createRoomManager(() => 1000)
    expect(mgr.joinRoom('ZZZZZZ', makeMember('a', 'Alice'))).toBeNull()
  })

  it('成员清空后房间被回收,房间码可复用', () => {
    const mgr = createRoomManager(() => 1000)
    const logA: ServerMsg[] = []
    const logB: ServerMsg[] = []
    const a = makeMember('a', 'Alice', logA)
    const { code, room } = mgr.createRoom(a)
    const b = makeMember('b', 'Bob', logB)
    mgr.joinRoom(code, b)

    expect(mgr.roomsCount()).toBe(1)
    room.leave(a.id)
    expect(mgr.roomsCount()).toBe(1)
    room.leave(b.id)
    // 空房被回收,无法再加入
    expect(mgr.roomsCount()).toBe(0)
    expect(mgr.joinRoom(code, makeMember('c', 'Carol'))).toBeNull()
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
