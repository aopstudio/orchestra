import { describe, expect, it } from 'vitest'
import { abcToSong, parseAbc } from './abcParser'

const GREENSLEEVES_ABC = `X:1
T:Greensleeves
M:6/8
L:1/8
K:Emin
E G2 A B3/2 c/2 | B A F#2 | D3/2 E/2 F# G2 | E3/2 E/2 ^D E2 |
E G2 A B3/2 c/2 | B A F#2 | A3/2 F#/2 D E | F# G F# E | ^D c#/2 d/2 e2 |
`

describe('parseAbc', () => {
  it('parses Greensleeves with correct pitches, durations and 6/8 meter', () => {
    const r = parseAbc(GREENSLEEVES_ABC)
    expect(r).not.toBeNull()
    expect(r!.bpi).toBe(6)
    expect(r!.title).toBe('Greensleeves')
    // E G2 A B3/2 c/2 → 64(1拍) 67(2拍) 69(1拍) 71(1.5) 72(0.5)
    expect(r!.voices[0]!.slice(0, 5)).toEqual([
      { note: 64, beat: 0, duration: 1 },
      { note: 67, beat: 1, duration: 2 },
      { note: 69, beat: 3, duration: 1 },
      { note: 71, beat: 4, duration: 1.5 },
      { note: 72, beat: 5.5, duration: 0.5 },
    ])
    // 调号 Emin → F# 默认升(66)
    expect(r!.voices[0]![7]).toEqual({ note: 66, beat: 8, duration: 1 })
    // 显式 ^D → D#(63)
    expect(r!.voices[0]).toContainEqual({ note: 63, beat: 16, duration: 1 })
  })

  it('parses multi-voice V:1/V:2 into separate voices', () => {
    const abc = `X:1
T:Duet
M:4/4
L:1/4
K:C
V:1
C D E F | G A B c |
V:2
C, G, C, G, | F, G, C, C, |`
    const r = parseAbc(abc)
    expect(r).not.toBeNull()
    expect(r!.voices).toHaveLength(2)
    expect(r!.voices[0]![0]).toEqual({ note: 60, beat: 0, duration: 1 })
    expect(r!.voices[1]![0]).toEqual({ note: 48, beat: 0, duration: 1 })
    // 多声部 → 两个 part
    const song = abcToSong(abc)
    expect(song).not.toBeNull()
    expect(song!.parts).toHaveLength(2)
    expect(song!.parts[0]!.name).toBe('旋律')
    expect(song!.parts[1]!.name).toBe('声部 2')
  })

  it('chord [...] takes the lowest note', () => {
    const abc = `X:1
T:ChordTest
M:4/4
L:1/4
K:C
V:1
C E G | C E G | c e g |
V:2
[CEG] [CEG] [CEG] |`
    const r = parseAbc(abc)
    expect(r).not.toBeNull()
    // [CEG] 取最低音 C(60)
    expect(r!.voices[1]![0]).toEqual({ note: 60, beat: 0, duration: 1 })
    expect(r!.voices[1]!.every((n) => n.note === 60)).toBe(true)
  })

  it('returns null for text without notes', () => {
    expect(parseAbc('X:1\nT:No notes\nM:4/4\nK:C\n| z z z z |')).toBeNull()
  })
})

describe('abcToSong', () => {
  it('builds a single-melody piano Song within the playable range', () => {
    const song = abcToSong(GREENSLEEVES_ABC)
    expect(song).not.toBeNull()
    expect(song!.title).toBe('Greensleeves')
    expect(song!.bpi).toBe(6)
    expect(song!.parts).toHaveLength(1)
    expect(song!.parts[0]!.instrument).toBe('piano')
    // 全部音在键盘可演奏范围
    for (const n of song!.parts[0]!.notes) {
      expect(n.note).toBeGreaterThanOrEqual(48)
      expect(n.note).toBeLessThanOrEqual(84)
    }
    // 同拍单音(曲库约束)
    const beats = new Set(song!.parts[0]!.notes.map((n) => n.beat))
    expect(beats.size).toBe(song!.parts[0]!.notes.length)
  })

  it('transposes a low melody up into the playable range', () => {
    // 低音区旋律(C3 下方)应被移调上来
    const lowAbc = 'X:1\nT:Low\nM:4/4\nL:1/4\nK:C\nC, E, G, c |'
    const song = abcToSong(lowAbc)
    expect(song).not.toBeNull()
    const lo = Math.min(...song!.parts[0]!.notes.map((n) => n.note))
    expect(lo).toBeGreaterThanOrEqual(48)
  })
})
