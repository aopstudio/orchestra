/**
 * Judge — 演奏判定引擎(纯逻辑,无 DOM / 定时器依赖)。
 *
 * 对"玩家按下的琴键 vs 该时刻应弹的音符"进行判定:
 * - 对(hit):   按下的音符合法命中一个"当前"音符,得分 **+100**。
 * - 错(mistake):按下的音符不匹配任何可命中的音符,扣分 **-20**。
 * - 漏(miss):  `advance()` 越过某音符的可命中窗口且从未被命中,记一次漏音,
 *               漏音不计分(0 分)。
 *
 * 命中窗口: `note.beat - tolerance <= songBeat <= note.beat + (duration ?? 1) + tolerance`,
 * 默认容差 `toleranceBeats = 0.5`,默认时值 `duration = 1` 拍。
 *
 * 判定规则(实现选择,均已由测试锁定):
 * - 一个音符只能被命中一次;同一音符第二次按下视为**错**(mistake)。
 * - 多个音符同时可命中时,命中 `beat` 距 `songBeat` 最近者;距离相同取索引更早者。
 * - `advance()` 维护单调游标;`songBeat < lastAdvance` 的按键视为**忽略**(ignored),
 *   不再追溯判定(游标已经越过该位置)。
 * - `advance()` 只在 `songBeat > lastAdvance` 时推进,并按 `windowEnd < songBeat`(严格小于)
 *   将从未命中的音符记为漏音;窗口终点处的按压仍可命中(窗口两端为闭区间)。
 * - `enabled: false` 时引擎完全惰性:`press()` 返回 ignored、`advance()` 返回 0、
 *   `stats()` 恒为全零,不产生任何副作用(对 UI 的开关安全)。
 */
import type { SongNote } from '../songs/songs'

export interface JudgeOptions {
  /** 命中容差(拍),默认 0.5。 */
  toleranceBeats?: number
  /** 判定反馈是否生效,默认 true。 */
  enabled?: boolean
}

export interface PressResult {
  kind: 'hit' | 'mistake' | 'ignored'
  /** 命中时,被命中音符在构造函数传入数组中的下标。 */
  matchedNote?: number
}

export interface JudgeStats {
  hits: number
  mistakes: number
  misses: number
  score: number
}

/** 命中得分。 */
const HIT_SCORE = 100
/** 错音扣分。 */
const MISTAKE_PENALTY = 20
/** 音符默认时值(拍)。 */
const DEFAULT_DURATION = 1

type NoteState = 'pending' | 'hit' | 'missed'

export class Judge {
  private readonly notes: SongNote[]
  private readonly tolerance: number
  private readonly enabled: boolean
  private state: NoteState[]
  private lastAdvance: number
  private statsInternal: JudgeStats

  constructor(notes: SongNote[], opts: JudgeOptions = {}) {
    this.notes = notes
    this.tolerance = opts.toleranceBeats ?? 0.5
    this.enabled = opts.enabled ?? true
    this.state = notes.map(() => 'pending')
    this.lastAdvance = Number.NEGATIVE_INFINITY
    this.statsInternal = { hits: 0, mistakes: 0, misses: 0, score: 0 }
  }

  /** 音符可命中窗口的结束拍(闭区间右端)。 */
  private windowEnd(n: SongNote): number {
    return n.beat + (n.duration ?? DEFAULT_DURATION) + this.tolerance
  }

  /** 该音符在给定拍位是否处于可命中窗口内。 */
  private isHittable(n: SongNote, songBeat: number): boolean {
    return n.beat - this.tolerance <= songBeat && songBeat <= this.windowEnd(n)
  }

  /**
   * 登记一次按键。返回判定结果;`enabled: false` 时返回 `{ kind: 'ignored' }`。
   */
  press(note: number, songBeat: number): PressResult {
    if (!this.enabled) return { kind: 'ignored' }
    if (songBeat < this.lastAdvance) return { kind: 'ignored' }

    let bestIndex = -1
    let bestDistance = Infinity
    for (const [i, n] of this.notes.entries()) {
      if (this.state[i] !== 'pending') continue
      if (n.note !== note) continue
      if (!this.isHittable(n, songBeat)) continue
      const distance = Math.abs(songBeat - n.beat)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }

    if (bestIndex === -1) {
      this.statsInternal.mistakes++
      this.statsInternal.score -= MISTAKE_PENALTY
      return { kind: 'mistake' }
    }

    this.state[bestIndex] = 'hit'
    this.statsInternal.hits++
    this.statsInternal.score += HIT_SCORE
    return { kind: 'hit', matchedNote: bestIndex }
  }

  /**
   * 将游标推进到 `songBeat`,把窗口已结束且从未被命中的音符记为漏音。
   * 返回本次新增的漏音数;`enabled: false` 时返回 0。
   */
  advance(songBeat: number): number {
    if (!this.enabled) return 0
    if (songBeat <= this.lastAdvance) return 0

    this.lastAdvance = songBeat
    let missed = 0
    for (const [i, n] of this.notes.entries()) {
      if (this.state[i] !== 'pending') continue
      if (this.windowEnd(n) < songBeat) {
        this.state[i] = 'missed'
        this.statsInternal.misses++
        missed++
        // 漏音不计分。
      }
    }
    return missed
  }

  /** 当前累计统计的快照副本。 */
  stats(): JudgeStats {
    return { ...this.statsInternal }
  }

  /** 清空全部状态:计数归零、游标复位、所有音符恢复为未判定。 */
  reset(): void {
    this.state = this.notes.map(() => 'pending')
    this.lastAdvance = Number.NEGATIVE_INFINITY
    this.statsInternal = { hits: 0, mistakes: 0, misses: 0, score: 0 }
  }
}
