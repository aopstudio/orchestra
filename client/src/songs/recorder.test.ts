import { describe, expect, it } from 'vitest'
import type { SongNote } from '@orchestra/shared'
import {
  finalizeRecording,
  quantizeBeat,
  recordNoteOff,
  recordNoteOn,
} from './recorder'

describe('quantizeBeat', () => {
  it('量化到 0.5 拍', () => {
    expect(quantizeBeat(0.3)).toBe(0.5)
    expect(quantizeBeat(0.49)).toBe(0.5)
    expect(quantizeBeat(0.7)).toBe(0.5)
    expect(quantizeBeat(1.0)).toBe(1)
    expect(quantizeBeat(1.8)).toBe(2)
  })
})

describe('recordNoteOn / recordNoteOff', () => {
  it('记录起始拍,松开回填时值', () => {
    const notes: SongNote[] = []
    recordNoteOn(notes, 60, 0.0)
    recordNoteOff(notes, 60, 1.3) // 按住约 1.3 拍 → 量化 1.5
    expect(notes).toEqual([{ note: 60, beat: 0, duration: 1.5 }])
  })

  it('短按至少 0.5 拍,长按至多 4 拍', () => {
    const a: SongNote[] = []
    recordNoteOn(a, 60, 0)
    recordNoteOff(a, 60, 0.1) // 0.1 → 量化 0,夹到 0.5
    expect(a[0]?.duration).toBe(0.5)

    const b: SongNote[] = []
    recordNoteOn(b, 60, 0)
    recordNoteOff(b, 60, 10) // 夹到 4
    expect(b[0]?.duration).toBe(4)
  })

  it('同音多次弹奏(先松开再按下)各自获得时值', () => {
    const notes: SongNote[] = []
    recordNoteOn(notes, 60, 0)
    recordNoteOff(notes, 60, 1) // 第一次: 按住 1 拍
    recordNoteOn(notes, 60, 2)
    recordNoteOff(notes, 60, 3) // 第二次: 按住 1 拍
    expect(notes[0]).toEqual({ note: 60, beat: 0, duration: 1 })
    expect(notes[1]).toEqual({ note: 60, beat: 2, duration: 1 })
  })
})

describe('finalizeRecording', () => {
  it('按拍序排序并去重(同音同拍只留一次)', () => {
    const notes: SongNote[] = [
      { note: 64, beat: 2 },
      { note: 60, beat: 0, duration: 1 },
      { note: 60, beat: 0 },
    ]
    const out = finalizeRecording(notes)
    expect(out).toEqual([
      { note: 60, beat: 0, duration: 1 },
      { note: 64, beat: 2 },
    ])
  })
})
