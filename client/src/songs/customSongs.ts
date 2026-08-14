/**
 * 自定义曲库(Phase 2 曲目编辑器): localStorage 持久化 + JSON 导入导出。
 *
 * 分享方式(v1): 导出为 JSON 文本,朋友导入粘贴 —— 无需服务器存储。
 * 曲目编辑器产出的曲目与内置曲目同构(Song),可直接进入引导/判定/谱面管线。
 */

import { isValidSong } from '@orchestra/shared'
import type { Song } from './songs'

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

export { isValidSong }

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
