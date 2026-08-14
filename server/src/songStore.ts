/**
 * 曲目分享存储(Phase 3 曲库平台化,轻量版)
 *
 * 客户端把自定义曲目 POST 到服务器,换取 6 位分享码;朋友凭码 GET 取回。
 * 当前为内存存储(进程重启即清空),公开部署可替换为文件/数据库持久化
 * (见 songStore 的注释接口)。
 */

import { randomInt } from 'node:crypto'
import type { Song } from '@orchestra/shared'

/** 分享码字母表(与房间码一致,剔除易混淆字符)。 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export interface SongStore {
  /** 存入曲目,返回分享码。 */
  add(song: Song): string
  /** 按分享码取回曲目;不存在返回 null。 */
  get(code: string): Song | null
  /** 当前存曲数。 */
  size(): number
}

export function createSongStore(): SongStore {
  const songs = new Map<string, Song>()

  function generateCode(): string {
    let code: string
    do {
      code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] ?? 'A',
      ).join('')
    } while (songs.has(code))
    return code
  }

  return {
    add(song) {
      const code = generateCode()
      songs.set(code, song)
      return code
    },
    get(code) {
      return songs.get(code.trim().toUpperCase()) ?? null
    },
    size: () => songs.size,
  }
}
