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
    const room = createRoom(120, 4, () => 0, 'TESTRO')
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')

    room.join(a.member)
    room.join(b.member)

    expect(a.sent[0]).toEqual({ type: 'welcome', id: 'a', name: 'Alice', roomCode: 'TESTRO', bpm: 120, bpi: 4 })
    expect(b.sent[0]).toEqual({ type: 'welcome', id: 'b', name: 'Bob', roomCode: 'TESTRO', bpm: 120, bpi: 4 })
    expect(a.sent[1]).toEqual({ type: 'peerJoined', id: 'b', name: 'Bob' })
    // 回填: 后加入者必须得知先加入的成员
    expect(b.sent[1]).toEqual({ type: 'peerJoined', id: 'a', name: 'Alice' })
  })

  it('size() reflects the number of joined members', () => {
    const room = createRoom(120, 4, () => 0, 'TESTRO')
    expect(room.size()).toBe(0)
    room.join(makeMember('a', 'Alice').member)
    room.join(makeMember('b', 'Bob').member)
    expect(room.size()).toBe(2)
  })

  it('note relays to all other members with serverTime from the injected clock, never back to the sender', () => {
    let t = 1000
    const room = createRoom(120, 4, () => t, 'TESTRO')
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
    room.note('b', 60, 80, 'piano')

    const expected = { type: 'note', from: 'b', note: 60, velocity: 80, instrument: 'piano', serverTime: 2500 } as const
    expect(a.sent).toEqual([expected])
    expect(c.sent).toEqual([expected])
    expect(b.sent).toEqual([])
  })

  it('noteOff relays to all other members with serverTime, never back to the sender', () => {
    let t = 1000
    const room = createRoom(120, 4, () => t, 'TESTRO')
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
    const room = createRoom(120, 4, () => t, 'TESTRO')
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
    const room = createRoom(120, 4, () => t, 'TESTRO')
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
    const room = createRoom(120, 4, () => t, 'TESTRO')
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
    const room = createRoom(120, 4, () => t, 'TESTRO')
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
    const room = createRoom(120, 4, () => t, 'TESTRO')
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
    const room = createRoom(120, 4, () => t, 'TESTRO')
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
    const room = createRoom(120, 4, () => t, 'TESTRO')
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
    const room = createRoom(120, 4, () => 0, 'TESTRO')
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

describe('startSong (房间同步开始)', () => {
  it('广播 songStart 到下一个小节边界,所有成员都收到', () => {
    let t = 1000 // 120bpm/4bpi → beat 2.0
    const room = createRoom(120, 4, () => t, 'TESTRO')
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    room.join(a.member)
    room.join(b.member)
    a.sent.length = 0
    b.sent.length = 0

    t = 1300 // beat 2.6 → 边界 = ceil((2.6+4)/4)*4 = 8
    room.startSong()

    const expected = { type: 'songStart', beat: 8, bpi: 4 } as const
    expect(a.sent[0]).toEqual(expected)
    expect(b.sent[0]).toEqual(expected)
  })

  it('同步边界拍是 bpi 的整数倍(歌曲第一拍落在重音)', () => {
    let t = 0
    const room = createRoom(120, 4, () => t, 'TESTRO')
    const a = makeMember('a', 'Alice')
    room.join(a.member)
    a.sent.length = 0

    t = 2500 // beat 5.0
    room.startSong()
    const msg = a.sent[0] as { type: 'songStart'; beat: number }
    expect(msg.beat % 4).toBe(0)
  })
})

describe('startJam (自由合奏同步起奏)', () => {
  it('小节开始: startBeat 是边界前某小节的整数倍拍,且 ≥ bars 小节后', () => {
    let t = 1000 // 120bpm/4bpi → beat 2.0
    const room = createRoom(120, 4, () => t, 'TESTRO')
    const a = makeMember('a', 'Alice')
    room.join(a.member)
    a.sent.length = 0

    t = 1300 // beat 2.6 → 边界 = ceil((2.6 + 2*4)/4)*4 = 12
    room.startJam(2, false)
    const msg = a.sent[0] as { type: 'jamStart'; startBeat: number; bpi: number; pickup: boolean }
    expect(msg.type).toBe('jamStart')
    expect(msg.bpi).toBe(4)
    expect(msg.pickup).toBe(false)
    expect(msg.startBeat % 4).toBe(0) // 小节边界(强拍)
    expect(msg.startBeat).toBeGreaterThanOrEqual(2.6 + 8) // ≥ 2 小节后
  })

  it('弱起: startBeat 是边界前一拍(弱拍)', () => {
    let t = 0
    const room = createRoom(120, 4, () => t, 'TESTRO')
    const a = makeMember('a', 'Alice')
    room.join(a.member)
    a.sent.length = 0

    t = 2500 // beat 5.0 → 边界 = ceil((5+4)/4)*4 = 12
    room.startJam(1, true)
    const msg = a.sent[0] as { type: 'jamStart'; startBeat: number; pickup: boolean }
    expect(msg.pickup).toBe(true)
    expect(msg.startBeat).toBe(11) // 12 - 1,上一小节末拍
    expect(msg.startBeat % 4).toBe(3) // 弱拍
  })

  it('广播给所有成员', () => {
    const room = createRoom(120, 4, () => 1000, 'TESTRO')
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    room.join(a.member)
    room.join(b.member)
    a.sent.length = 0
    b.sent.length = 0
    room.startJam(1, false)
    expect(a.sent[0]).toMatchObject({ type: 'jamStart' })
    expect(b.sent[0]).toMatchObject({ type: 'jamStart' })
  })
})

describe('房间合奏编排 (selectPart / setReady / 互斥)', () => {
  it('认领声部成功并广播编排状态;同一声部被他人认领时拒绝', () => {
    const room = createRoom(120, 4, () => 1000, 'TESTRO')
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    room.join(a.member)
    room.join(b.member)
    a.sent.length = 0
    b.sent.length = 0

    expect(room.selectPart('a', 'rock', 'drums')).toBe('ok')
    // 双方都收到 ensembleState: drums 归 Alice
    const stateA = a.sent.find((m) => m.type === 'ensembleState') as
      | { type: 'ensembleState'; songId: string; parts: Array<{ partId: string; playerName: string }> }
      | undefined
    expect(stateA?.songId).toBe('rock')
    expect(stateA?.parts).toContainEqual(
      expect.objectContaining({ partId: 'drums', playerName: 'Alice' }),
    )

    // B 想选 drums → 被拒
    expect(room.selectPart('b', 'rock', 'drums')).toBe('taken')
    // B 选 bass → 成功
    expect(room.selectPart('b', 'rock', 'bass')).toBe('ok')
    // 歌曲不一致 → wrongSong
    expect(room.selectPart('b', 'other', 'bass')).toBe('wrongSong')
  })

  it('换声部: 释放旧认领', () => {
    const room = createRoom(120, 4, () => 1000, 'TESTRO')
    const a = makeMember('a', 'Alice')
    room.join(a.member)
    a.sent.length = 0
    expect(room.selectPart('a', 'rock', 'drums')).toBe('ok')
    expect(room.selectPart('a', 'rock', 'keys')).toBe('ok')
    const state = a.sent.at(-1) as
      | { type: 'ensembleState'; parts: Array<{ partId: string }> }
      | undefined
    expect(state?.parts.map((p) => p.partId)).toEqual(['keys'])
  })

  it('setReady 更新准备状态并广播;未认领声部的成员忽略', () => {
    const room = createRoom(120, 4, () => 1000, 'TESTRO')
    const a = makeMember('a', 'Alice')
    room.join(a.member)
    a.sent.length = 0
    room.selectPart('a', 'rock', 'drums')
    a.sent.length = 0
    room.setReady('a', true)
    const state = a.sent.at(-1) as
      | { type: 'ensembleState'; parts: Array<{ ready: boolean }> }
      | undefined
    expect(state?.parts[0]?.ready).toBe(true)
    // 未认领者准备无效
    room.setReady('ghost', true) // 不抛错
  })

  it('离开房间释放声部认领', () => {
    const room = createRoom(120, 4, () => 1000, 'TESTRO')
    const a = makeMember('a', 'Alice')
    const b = makeMember('b', 'Bob')
    room.join(a.member)
    room.join(b.member)
    room.selectPart('a', 'rock', 'drums')
    b.sent.length = 0
    room.leave('a')
    const state = b.sent.find((m) => m.type === 'ensembleState') as
      | { type: 'ensembleState'; parts: Array<{ partId: string }> }
      | undefined
    // A 离开后 drums 释放;若还有其他人认领则广播更新
    expect(room.selectPart('b', 'rock', 'drums')).toBe('ok')
    expect(state).toBeUndefined() // A 离开后没有其他认领 → 编排清空,不再广播
  })
})
