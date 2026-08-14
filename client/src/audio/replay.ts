/**
 * 录音回放(Phase 3): 把录制的音符序列按曲速调度到音频时钟上播放。
 *
 * 与合奏播放共用 instruments.play(按乐器路由到音色总线),因此回放听起来
 * 与真实演奏一致。纯调度计算部分(buildReplaySchedule/replayDuration)独立,
 * 便于单元测试;playReplay 只是把事件依次提交给音频。
 */

import type { InstrumentId, SongNote } from '@orchestra/shared'
import type { Instruments } from './instruments'

export interface ReplayEvent {
  /** 绝对音频时钟时间(秒)。 */
  audioTime: number
  note: number
  velocity: number
  /** 该音的时值(秒)——回放按谱面时值发声。 */
  durationSec: number
}

/** 把音符序列换算成绝对音频时间上的事件序列(按时间排序)。 */
export function buildReplaySchedule(
  notes: SongNote[],
  bpm: number,
  startTime: number,
): ReplayEvent[] {
  const secPerBeat = 60 / bpm
  return notes
    .filter((n) => Number.isFinite(n.beat) && Number.isFinite(n.note))
    .map((n) => ({
      audioTime: startTime + n.beat * secPerBeat,
      note: n.note,
      velocity: n.velocity ?? 100,
      durationSec: (n.duration ?? 1) * secPerBeat,
    }))
    .sort((a, b) => a.audioTime - b.audioTime)
}

/** 回放总时长(秒): 最后一个音符结束时 + 0.5s 收尾。 */
export function replayDuration(notes: SongNote[], bpm: number): number {
  let lastBeat = 0
  for (const n of notes) {
    lastBeat = Math.max(lastBeat, n.beat + (n.duration ?? 1))
  }
  return (lastBeat * 60) / bpm + 0.5
}

/**
 * 立即播放一次回放。返回回放总时长(秒);播放本身异步,无需取消(一次性调度)。
 */
export function playReplay(
  ctx: AudioContext,
  instruments: Instruments,
  notes: SongNote[],
  bpm: number,
  instrument: InstrumentId,
): number {
  if (ctx.state === 'closed') return 0
  const start = ctx.currentTime + 0.15
  const events = buildReplaySchedule(notes, bpm, start)
  for (const e of events) {
    instruments.play(instrument, e.note, e.velocity, e.audioTime - ctx.currentTime, e.durationSec)
  }
  return replayDuration(notes, bpm)
}
