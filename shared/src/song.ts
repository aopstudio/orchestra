/**
 * 曲目数据契约(shared): 客户端曲库/曲目编辑器与服务器分享端点共用。
 */

import type { InstrumentId } from './protocol'

export interface SongNote {
  /** MIDI 音符号(0–127);鼓声部用 GM 鼓件 35–51 */
  note: number
  /** 相对歌曲起点的拍位(小数拍,基于歌曲自身 bpm/bpi 网格) */
  beat: number
  /** 时值(拍),默认 1 拍 */
  duration?: number
  /** 力度(0–127),默认 100 */
  velocity?: number
}

export interface SongPart {
  /** 声部 id(房间内选声部用) */
  id: string
  /** 声部显示名 */
  name: string
  /** 该声部播放/回放所用的乐器(决定音色与键位映射) */
  instrument: InstrumentId
  /** 该声部的音符序列(按 beat 升序) */
  notes: SongNote[]
}

export interface Song {
  id: string
  title: string
  /** 歌曲自身速度(BPM) */
  bpm: number
  /** 拍号:每小节拍数 */
  bpi: number
  parts: SongPart[]
}

/** 最小合法性校验(客户端导入与服务器接收共用)。 */
export function isValidSong(value: unknown): value is Song {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || typeof v.title !== 'string') return false
  if (typeof v.bpm !== 'number' || v.bpm <= 0) return false
  if (typeof v.bpi !== 'number' || v.bpi <= 0) return false
  if (!Array.isArray(v.parts) || v.parts.length === 0) return false
  for (const part of v.parts) {
    const p = part as Partial<SongPart>
    if (typeof p.id !== 'string' || typeof p.name !== 'string') return false
    const allowed = ['piano', 'bass', 'drums', 'trumpet', 'violin'] as const
    if (!allowed.includes(p.instrument as (typeof allowed)[number])) {
      return false
    }
    if (!Array.isArray(p.notes)) return false
    for (const n of p.notes) {
      if (typeof n?.note !== 'number' || typeof n?.beat !== 'number') return false
    }
  }
  return true
}
