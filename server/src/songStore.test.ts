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
  it('存入返回 6 位分享码,可凭码取回原曲', () => {
    const store = createSongStore()
    const code = store.add(SAMPLE)
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    expect(store.get(code)).toEqual(SAMPLE)
  })

  it('分享码大小写不敏感', () => {
    const store = createSongStore()
    const code = store.add(SAMPLE)
    expect(store.get(code.toLowerCase())).toEqual(SAMPLE)
  })

  it('不存在的分享码返回 null;每首曲目分享码唯一', () => {
    const store = createSongStore()
    const a = store.add(SAMPLE)
    const b = store.add({ ...SAMPLE, id: 'y' })
    expect(a).not.toBe(b)
    expect(store.get('ZZZZZZ')).toBeNull()
    expect(store.size()).toBe(2)
  })
})
