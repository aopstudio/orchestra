/**
 * 自定义曲库(Phase 2 曲目编辑器): localStorage 持久化 + JSON 导入导出。
 *
 * 分享方式(v1): 导出为 JSON 文本,朋友导入粘贴 —— 无需服务器存储。
 * 曲目编辑器产出的曲目与内置曲目同构(Song),可直接进入引导/判定/谱面管线。
 */

import type { Song, SongPart } from './songs'

const STORAGE_KEY = 'orch.customSongs'

export function loadCustomSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidSong)
  } catch {
    return []
  }
}

export function saveCustomSongs(songs: Song[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs))
}

/** 最小合法性校验: 结构必须与 Song 兼容,防止导入垃圾数据。 */
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
    if (p.instrument !== 'piano' && p.instrument !== 'bass' && p.instrument !== 'drums') {
      return false
    }
    if (!Array.isArray(p.notes)) return false
    for (const n of p.notes) {
      if (typeof n?.note !== 'number' || typeof n?.beat !== 'number') return false
    }
  }
  return true
}

/** 导出为可分享的 JSON 文本。 */
export function exportSongJson(song: Song): string {
  return JSON.stringify(song, null, 2)
}

/** 从 JSON 文本导入;解析失败或校验不过返回 null。 */
export function importSongJson(text: string): Song | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return isValidSong(parsed) ? parsed : null
  } catch {
    return null
  }
}
