import type { SongNote } from '../songs/songs'

/**
 * 引导引擎:把「当前歌曲拍位」翻译成玩家此刻该按哪些键。
 *
 * 纯逻辑、无副作用:输入一列音符 + 一个（可为小数的）拍位,
 * 输出当前该按的、即将要按的、以及整曲进度,供 UI 做强弱高亮。
 */

export interface GuideWindow {
  /** Notes the player should press at the current beat (due now). */
  current: SongNote[]
  /** Notes coming in the next `lookaheadBeats` beats (for pre-highlight). Excludes current. */
  upcoming: SongNote[]
  /** Fractional progress through the part (0..1). */
  progress: number
  /** True when the last note has passed. */
  finished: boolean
}

export interface GuideOptions {
  /** How many beats ahead to pre-highlight. Defaults to 4. */
  lookaheadBeats?: number
  /** Loop the part forever (songBeat wraps modulo total length). Defaults to false. */
  loop?: boolean
}

const DEFAULT_LOOKAHEAD_BEATS = 4

/** End beat of the longest note; the part's total length in beats. */
function totalLengthOf(notes: SongNote[]): number {
  let len = 0
  for (const n of notes) {
    const end = n.beat + (n.duration ?? 1)
    if (end > len) len = end
  }
  return len
}

export function advanceGuide(
  notes: SongNote[],
  songBeat: number,
  opts?: GuideOptions,
): GuideWindow {
  const lookaheadBeats = opts?.lookaheadBeats ?? DEFAULT_LOOKAHEAD_BEATS
  const loop = opts?.loop ?? false
  // 不原地修改入参;入参可能未排序,这里按拍位升序稳定排序。
  const sorted = [...notes].sort((a, b) => a.beat - b.beat)
  const totalLength = totalLengthOf(sorted)

  // 空谱面:没有可按的音,直接判定结束。
  if (sorted.length === 0) {
    return { current: [], upcoming: [], progress: 0, finished: true }
  }

  // 循环模式下把拍位折回 [0, totalLength),保证负值也落到有效区间。
  let beat = songBeat
  if (loop && totalLength > 0) {
    beat = ((beat % totalLength) + totalLength) % totalLength
  }

  const current: SongNote[] = []
  const upcoming: SongNote[] = []
  for (const n of sorted) {
    const duration = n.duration ?? 1
    if (n.beat <= beat && beat < n.beat + duration) {
      current.push(n)
    } else if (beat < n.beat && n.beat <= beat + lookaheadBeats) {
      upcoming.push(n)
    }
  }

  const finished = !loop && songBeat >= totalLength
  // 循环时进度按折回后的拍位计算;非循环时夹在 [0,1]。
  let progress: number
  if (loop) {
    progress = totalLength > 0 ? beat / totalLength : 0
  } else {
    progress = Math.min(1, Math.max(0, songBeat / totalLength))
  }

  return { current, upcoming, progress, finished }
}
