/**
 * 曲库数据完整性测试: 保证谱面数据对引导/判定/键位映射友好。
 */

import { describe, expect, it } from 'vitest'
import { SONGS, type Song, type SongPart } from './songs'

const VALID_INSTRUMENTS = new Set(['piano', 'bass', 'drums', 'trumpet', 'violin'])

/** 鼓件 GM 范围(35–51) */
const GM_DRUM_LOW = 35
const GM_DRUM_HIGH = 51
/** JamPad/键盘可演奏范围(C3–C5,含鼓声部在键盘鼓垫上的可玩性) */
const PLAYABLE_LOW = 48
const PLAYABLE_HIGH = 84

describe('内置曲库', () => {
  it('每首歌都有 2+ 声部、正 BPM、正拍号', () => {
    for (const song of SONGS) {
      expect(song.parts.length).toBeGreaterThanOrEqual(2)
      expect(song.bpm).toBeGreaterThan(0)
      expect(song.bpi).toBeGreaterThan(0)
    }
  })

  it('每个声部都有合法乐器标识,且 id 在歌曲内唯一', () => {
    for (const song of SONGS) {
      const ids = new Set<string>()
      for (const part of song.parts) {
        expect(VALID_INSTRUMENTS.has(part.instrument)).toBe(true)
        expect(ids.has(part.id)).toBe(false)
        ids.add(part.id)
      }
    }
  })

  it('每个声部至少有一个音符,且音符按拍位升序排列', () => {
    for (const song of SONGS) {
      for (const part of song.parts) {
        expect(part.notes.length).toBeGreaterThan(0)
        for (let i = 1; i < part.notes.length; i += 1) {
          expect(part.notes[i]?.beat ?? 0).toBeGreaterThanOrEqual(part.notes[i - 1]?.beat ?? 0)
        }
      }
    }
  })

  it('鼓声部只用 GM 鼓件音符(35–51)', () => {
    for (const song of SONGS) {
      for (const part of song.parts) {
        if (part.instrument !== 'drums') continue
        for (const n of part.notes) {
          expect(n.note).toBeGreaterThanOrEqual(GM_DRUM_LOW)
          expect(n.note).toBeLessThanOrEqual(GM_DRUM_HIGH)
        }
      }
    }
  })

  it('非鼓声部的所有音符都在键盘可演奏范围(C3–C5 对应 48–72,留余量到 84)', () => {
    for (const song of SONGS) {
      for (const part of song.parts) {
        if (part.instrument === 'drums') continue
        for (const n of part.notes) {
          expect(n.note).toBeGreaterThanOrEqual(PLAYABLE_LOW)
          expect(n.note).toBeLessThanOrEqual(PLAYABLE_HIGH)
        }
      }
    }
  })

  it('至少包含一首三声部曲目(鼓+贝斯+键盘),覆盖 Phase 1 MVP 编制', () => {
    const threePart = SONGS.find((s: Song) => s.parts.length >= 3)
    expect(threePart).toBeDefined()
    const instruments = new Set((threePart?.parts ?? []).map((p: SongPart) => p.instrument))
    expect(instruments.has('drums')).toBe(true)
    expect(instruments.has('bass')).toBe(true)
    expect(instruments.has('piano')).toBe(true)
  })

  it('曲库包含多首真正的多乐器合奏(≥3 个声部且 ≥3 种不同乐器)', () => {
    const multi = SONGS.filter(
      (s: Song) =>
        s.parts.length >= 3 &&
        new Set(s.parts.map((p: SongPart) => p.instrument)).size >= 3,
    )
    // 铃儿响叮当 / 友谊地久天长 / 摇滚循环 / 十二小节布鲁斯
    expect(multi.length).toBeGreaterThanOrEqual(4)
    for (const song of multi) {
      const instruments = new Set(song.parts.map((p: SongPart) => p.instrument))
      expect(instruments.size).toBeGreaterThanOrEqual(3)
    }
  })
})
