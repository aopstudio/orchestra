import { describe, expect, it } from 'vitest'
import { exportSongJson, importSongJson, isValidSong } from './customSongs'
import type { Song } from './songs'

const SAMPLE: Song = {
  id: 'mine',
  title: '我的曲子',
  bpm: 120,
  bpi: 4,
  parts: [
    { id: 'p1', name: '旋律', instrument: 'piano', notes: [{ note: 60, beat: 0 }] },
  ],
}

describe('customSongs', () => {
  it('isValidSong 接受合法曲目', () => {
    expect(isValidSong(SAMPLE)).toBe(true)
  })

  it('isValidSong 拒绝缺字段/坏结构', () => {
    expect(isValidSong(null)).toBe(false)
    expect(isValidSong({})).toBe(false)
    expect(isValidSong({ ...SAMPLE, bpm: 'fast' })).toBe(false)
    expect(isValidSong({ ...SAMPLE, parts: [] })).toBe(false)
    expect(
      isValidSong({ ...SAMPLE, parts: [{ id: 'p', name: 'x', instrument: 'sax', notes: [] }] }),
    ).toBe(false)
    expect(isValidSong({ ...SAMPLE, parts: [{ id: 'p', name: 'x', instrument: 'piano', notes: [{ note: 'C4', beat: 0 }] }] })).toBe(false)
  })

  it('导入导出往返一致', () => {
    const text = exportSongJson(SAMPLE)
    const back = importSongJson(text)
    expect(back).toEqual(SAMPLE)
  })

  it('导入垃圾文本返回 null', () => {
    expect(importSongJson('not json')).toBeNull()
    expect(importSongJson('{"id":1}')).toBeNull()
  })
})
