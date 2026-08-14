import { describe, expect, it } from 'vitest'
import type { ServerMsg } from '@orchestra/shared'
import { createRoom, type RoomMember } from './room'

/** 构造一个记录了所有已发送消息的测试成员(使用真实类型,无类型断言) */
function makeMember(id: string, name: string): { member: RoomMember; sent: ServerMsg[] } {
  const sent: ServerMsg[] = []
  return {
    sent,
    member: {
      id,
      name,
      send: (msg) => {
        sent.push(msg)
      },
    },
  }
}

describe('createRoom', () => {
  it('join assigns the member id, sends welcome, and notifies existing members with peerJoined', () => {
    const room = createRoom(120, 4, () => 0)
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')

    room.join(a.member)
    room.join(b.member)

    expect(a.sent[0]).toEqual({ type: 'welcome', id: 'a', name: 'Alice', bpm: 120, bpi: 4 })
    expect(b.sent[0]).toEqual({ type: 'welcome', id: 'b', name: 'Bob', bpm: 120, bpi: 4 })
    expect(a.sent[1]).toEqual({ type: 'peerJoined', id: 'b', name: 'Bob' })
  })

  it('size() reflects the number of joined members', () => {
    const room = createRoom(120, 4, () => 0)
    expect(room.size()).toBe(0)
    room.join(makeMember('a', 'Alice').member)
    room.join(makeMember('b', 'Bob').member)
    expect(room.size()).toBe(2)
  })

  it('note relays to all other members with serverTime from the injected clock, never back to the sender', () => {
    let t = 1000
    const room = createRoom(120, 4, () => t)
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    const c = makeMember('c', 'Carol')
    room.join(a.member)
    room.join(b.member)
    room.join(c.member)
    a.sent.length = 0
    b.sent.length = 0
    c.sent.length = 0

    t = 2500
    room.note('b', 60, 80)

    const expected = { type: 'note', from: 'b', note: 60, velocity: 80, serverTime: 2500 } as const
    expect(a.sent).toEqual([expected])
    expect(c.sent).toEqual([expected])
    expect(b.sent).toEqual([])
  })

  it('noteOff relays to all other members with serverTime, never back to the sender', () => {
    let t = 1000
    const room = createRoom(120, 4, () => t)
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    const c = makeMember('c', 'Carol')
    room.join(a.member)
    room.join(b.member)
    room.join(c.member)
    a.sent.length = 0
    b.sent.length = 0
    c.sent.length = 0

    t = 2500
    room.noteOff('b', 60)

    const expected = { type: 'noteOff', from: 'b', note: 60, serverTime: 2500 } as const
    expect(a.sent).toEqual([expected])
    expect(c.sent).toEqual([expected])
    expect(b.sent).toEqual([])
  })

  it('setTempo broadcasts the new bpm with serverTime to ALL members', () => {
    let t = 1000
    const room = createRoom(120, 4, () => t)
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    room.join(a.member)
    room.join(b.member)
    a.sent.length = 0
    b.sent.length = 0

    t = 1500
    room.setTempo(90)

    const expected = { type: 'tempo', bpm: 90, serverTime: 1500 } as const
    expect(a.sent).toEqual([expected])
    expect(b.sent).toEqual([expected])
  })

  it('setTempo also affects the clock beat broadcast (faster tempo advances beats faster)', () => {
    let t = 0
    const room = createRoom(120, 4, () => t)
    const a = makeMember('a', 'Alice')
    room.join(a.member)
    a.sent.length = 0

    room.setTempo(240) // double speed
    t = 1000
    room.broadcastClock()

    // a.sent[0] is the tempo broadcast; a.sent[1] is the clock.
    // 240bpm, 4 beats/interval → interval 1000ms; at t=1000 → beat 4
    const clock = a.sent[1]
    expect(clock).toMatchObject({ type: 'clock', tempo: 240, beat: 4 })
  })

  it('setBpi broadcasts the new bpi with serverTime to ALL members', () => {
    let t = 1000
    const room = createRoom(120, 4, () => t)
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    room.join(a.member)
    room.join(b.member)
    a.sent.length = 0
    b.sent.length = 0

    t = 1500
    room.setBpi(3)

    // a.sent[0] is the bpi broadcast; a.sent[1] is the immediate clock push.
    const expected = { type: 'bpi', bpi: 3, serverTime: 1500 } as const
    expect(a.sent[0]).toEqual(expected)
    expect(b.sent[0]).toEqual(expected)
  })

  it('setBpi immediately broadcasts a clock with the re-anchored beat (beat 1 of new meter)', () => {
    let t = 0
    const room = createRoom(120, 4, () => t)
    const a = makeMember('a', 'Alice')
    room.join(a.member)
    a.sent.length = 0

    t = 5000 // beat 10 at 120bpm/4bpi
    room.setBpi(3)
    // a.sent[0] = bpi broadcast, a.sent[1] = immediate clock with re-anchored beat 12
    const clock = a.sent[1]
    expect(clock).toMatchObject({ type: 'clock', bpi: 3 })
    // 12 % 3 === 0 → client shows 1/3 and accents the next beat
    expect((clock as { beat: number }).beat).toBe(12)
  })

  it('broadcastClock includes the current bpi', () => {
    let t = 0
    const room = createRoom(120, 4, () => t)
    const a = makeMember('a', 'Alice')
    room.join(a.member)
    a.sent.length = 0

    t = 1000
    room.broadcastClock()
    expect(a.sent[0]).toMatchObject({ type: 'clock', bpi: 4 })

    room.setBpi(6)
    // a.sent[1] is the bpi broadcast; a.sent[2] is the clock.
    room.broadcastClock()
    expect(a.sent[2]).toMatchObject({ type: 'clock', bpi: 6 })
  })

  it('sync replies only to the requester, echoing t1 and stamping t2/t3 from the injected clock', () => {
    let t = 500
    const room = createRoom(120, 4, () => t)
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    room.join(a.member)
    room.join(b.member)
    a.sent.length = 0
    b.sent.length = 0

    t = 700
    room.sync('a', 123)
    t = 750
    room.sync('a', 456)

    expect(a.sent[0]).toEqual({ type: 'syncAck', t1: 123, t2: 700, t3: 700 })
    expect(a.sent[1]).toEqual({ type: 'syncAck', t1: 456, t2: 750, t3: 750 })
    expect(b.sent).toEqual([])
  })

  it('broadcastClock sends clock to all members with beat derived from beatClock and current serverTime', () => {
    let t = 0
    const room = createRoom(120, 4, () => t)
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    room.join(a.member)
    room.join(b.member)
    a.sent.length = 0
    b.sent.length = 0

    t = 2000
    room.broadcastClock()

    const expected = { type: 'clock', beat: 4, tempo: 120, bpi: 4, serverTime: 2000 } as const
    expect(a.sent).toEqual([expected])
    expect(b.sent).toEqual([expected])
  })

  it('leave removes the member and notifies the remaining members with peerLeft', () => {
    const room = createRoom(120, 4, () => 0)
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    const c = makeMember('c', 'Carol')
    room.join(a.member)
    room.join(b.member)
    room.join(c.member)
    b.sent.length = 0
    c.sent.length = 0

    room.leave('a')

    expect(room.size()).toBe(2)
    expect(b.sent).toEqual([{ type: 'peerLeft', id: 'a' }])
    expect(c.sent).toEqual([{ type: 'peerLeft', id: 'a' }])
  })
})
