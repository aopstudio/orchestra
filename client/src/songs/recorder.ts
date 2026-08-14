/**
 * 录制逻辑(Song Studio,纯函数,无 DOM 依赖)。
 *
 * - recordNoteOn:  记录音的开头(起始拍,量化到 0.5 拍)
 * - recordNoteOff: 松开时回填时值(长音/延音;夹在 0.5–4 拍)
 * - finalizeRecording: 停止录制时排序 + 去重(同音同拍只留一次)
 */

import type { SongNote } from '@orchestra/shared'

/** 量化到 0.5 拍(与曲库格式一致,支持八分音符)。 */
export function quantizeBeat(beat: number): number {
  return Math.round(beat * 2) / 2
}

/** 最小/最大时值(拍): 至少一个八分音符,至多一个全音符。 */
export const MIN_DURATION_BEATS = 0.5
export const MAX_DURATION_BEATS = 4

/** 记录一个音的开头。 */
export function recordNoteOn(notes: SongNote[], note: number, beat: number): void {
  notes.push({ note, beat: quantizeBeat(beat) })
}

/** 松开时回填该音的时值;找不到(未按下即松开)或已有时值则忽略。 */
export function recordNoteOff(notes: SongNote[], note: number, beat: number): void {
  const off = quantizeBeat(beat)
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const n = notes[i]
    if (n !== undefined && n.note === note && n.duration === undefined) {
      const dur = Math.min(MAX_DURATION_BEATS, Math.max(MIN_DURATION_BEATS, quantizeBeat(off - n.beat)))
      n.duration = dur
      return
    }
  }
}

/** 停止录制: 按拍序稳定排序 + 去重(同音同拍只留第一次出现)。 */
export function finalizeRecording(notes: SongNote[]): SongNote[] {
  return notes
    .sort((a, b) => a.beat - b.beat || a.note - b.note)
    .filter((n, i, arr) => i === 0 || n.beat !== arr[i - 1]!.beat || n.note !== arr[i - 1]!.note)
}
