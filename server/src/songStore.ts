/**
 * 曲目分享存储(Phase 3 曲库平台化,轻量版 + 资源回收)
 *
 * 客户端把自定义曲目 POST 到服务器,换取 6 位分享码;朋友凭码 GET 取回。
 * 当前为内存存储(进程重启即清空),带**资源回收**防止无限增长:
 * - TTL: 分享超过 `ttlMs`(默认 24h)后视为过期,访问时懒清理
 * - 容量上限: 超过 `maxSongs`(默认 2000)时淘汰最旧的分享
 */

import { randomInt } from 'node:crypto'
import type { Song } from '@orchestra/shared'

/** 分享码字母表(与房间码一致,剔除易混淆字符)。 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

/** 分享默认 TTL: 24 小时(可用 SONG_SHARE_TTL_MS 覆盖)。 */
export const DEFAULT_SHARE_TTL_MS = 24 * 60 * 60 * 1000
/** 分享默认容量上限(可用 SONG_SHARE_MAX 覆盖)。 */
export const DEFAULT_MAX_SHARES = 2000

export interface SongStoreOptions {
  ttlMs?: number
  maxSongs?: number
  /** 时钟(测试注入)。 */
  now?: () => number
}

interface Entry {
  song: Song
  likes: number
  createdAt: number
}

export interface SongStore {
  /** 存入曲目,返回分享码。 */
  add(song: Song): string
  /** 按分享码取回曲目;不存在或已过期返回 null。 */
  get(code: string): Song | null
  /** 按分享码给曲目点赞,返回最新点赞数;不存在/过期返回 null。 */
  like(code: string): number | null
  /** 按分享码查询点赞数;不存在/过期返回 null。 */
  likesOf(code: string): number | null
  /** 当前存曲数。 */
  size(): number
}

export function createSongStore(opts?: SongStoreOptions): SongStore {
  const ttlMs = opts?.ttlMs ?? DEFAULT_SHARE_TTL_MS
  const maxSongs = opts?.maxSongs ?? DEFAULT_MAX_SHARES
  const clock = opts?.now ?? Date.now

  const songs = new Map<string, Entry>()

  function normalize(code: string): string {
    return code.trim().toUpperCase()
  }

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

  /** 懒清理过期分享。 */
  function pruneExpired(): void {
    const nowT = clock()
    for (const [code, e] of songs) {
      if (nowT - e.createdAt > ttlMs) {
        songs.delete(code)
      }
    }
  }

  /** 取条目并校验过期;过期则删除并返回 null。 */
  function entryOf(rawCode: string): Entry | null {
    const code = normalize(rawCode)
    const e = songs.get(code)
    if (e === undefined) return null
    if (clock() - e.createdAt > ttlMs) {
      songs.delete(code)
      return null
    }
    return e
  }

  return {
    add(song) {
      pruneExpired()
      // 容量上限: 淘汰最旧
      if (songs.size >= maxSongs) {
        let oldestCode: string | null = null
        let oldestAt = Number.POSITIVE_INFINITY
        for (const [code, e] of songs) {
          if (e.createdAt < oldestAt) {
            oldestAt = e.createdAt
            oldestCode = code
          }
        }
        if (oldestCode !== null) songs.delete(oldestCode)
      }
      const code = generateCode()
      songs.set(code, { song, likes: 0, createdAt: clock() })
      return code
    },
    get(code) {
      return entryOf(code)?.song ?? null
    },
    like(code) {
      const entry = entryOf(code)
      if (entry === null) return null
      entry.likes += 1
      return entry.likes
    },
    likesOf(code) {
      return entryOf(code)?.likes ?? null
    },
    size: () => songs.size,
  }
}
