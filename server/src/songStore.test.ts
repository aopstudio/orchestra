import { describe, expect, it } from 'vitest'
import { createSongStore } from './songStore'
import type { Song } from '@orchestra/shared'

const SAMPLE: Song = {
  id: 'x',
  title: '分享曲',
  bpm: 100,
  bpi: 4,
  parts: [{ id: 'p', name: 'P', instrument: 'piano', notes: [{ note: 60, beat: 0 }] }],
}

describe('songStore', () => {
  it('存入返回 6 位分享码,可凭码取回原曲;大小写不敏感', () => {
    const store = createSongStore()
    const code = store.add(SAMPLE)
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    expect(store.get(code)).toEqual(SAMPLE)
    expect(store.get(code.toLowerCase())).toEqual(SAMPLE)
    expect(store.get('ZZZZZZ')).toBeNull()
  })

  it('点赞与查询;不存在的码返回 null', () => {
    const store = createSongStore()
    const code = store.add(SAMPLE)
    expect(store.like(code)).toBe(1)
    expect(store.like(code)).toBe(2)
    expect(store.likesOf(code)).toBe(2)
    expect(store.like('NOPE99')).toBeNull()
  })

  it('超过 TTL 的分享在访问时被清理', () => {
    let t = 0
    const store = createSongStore({ ttlMs: 1000, now: () => t })
    const code = store.add(SAMPLE)
    expect(store.get(code)).not.toBeNull()
    t = 1500 // 过期
    expect(store.get(code)).toBeNull()
    expect(store.size()).toBe(0) // 懒清理已删除
  })

  it('容量上限: 超出时淘汰最旧', () => {
    let t = 0
    const store = createSongStore({ maxSongs: 3, now: () => ++t })
    const c1 = store.add({ ...SAMPLE, id: '1' })
    const c2 = store.add({ ...SAMPLE, id: '2' })
    const c3 = store.add({ ...SAMPLE, id: '3' })
    expect(store.size()).toBe(3)
    const c4 = store.add({ ...SAMPLE, id: '4' })
    expect(store.size()).toBe(3)
    expect(store.get(c1)).toBeNull() // 最旧被淘汰
    expect(store.get(c4)).not.toBeNull()
    expect(store.get(c2)).not.toBeNull()
    expect(store.get(c3)).not.toBeNull()
  })
})
