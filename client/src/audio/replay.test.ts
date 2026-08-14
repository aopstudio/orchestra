import { describe, expect, it } from 'vitest'
import { buildReplaySchedule, replayDuration } from './replay'
import type { SongNote } from '@orchestra/shared'

const NOTES: SongNote[] = [
  { note: 60, beat: 0 },
  { note: 62, beat: 1 },
  { note: 64, beat: 2, velocity: 80 },
]

describe('buildReplaySchedule', () => {
  it('120 BPM 下每拍 0.5s,从 startTime 起排布', () => {
    const events = buildReplaySchedule(NOTES, 120, 10)
    expect(events).toEqual([
      { audioTime: 10, note: 60, velocity: 100 },
      { audioTime: 10.5, note: 62, velocity: 100 },
      { audioTime: 11, note: 64, velocity: 80 },
    ])
  })

  it('60 BPM 下每拍 1s', () => {
    const events = buildReplaySchedule(NOTES, 60, 0)
    expect(events.map((e) => e.audioTime)).toEqual([0, 1, 2])
  })

  it('乱序输入按时间排序输出', () => {
    const events = buildReplaySchedule(
      [
        { note: 64, beat: 2 },
        { note: 60, beat: 0 },
      ],
      120,
      0,
    )
    expect(events.map((e) => e.note)).toEqual([60, 64])
  })
})

describe('replayDuration', () => {
  it('以最后一个音符的结束时刻 + 收尾计算', () => {
    const notes: SongNote[] = [
      { note: 60, beat: 0 },
      { note: 62, beat: 4, duration: 2 },
    ]
    expect(replayDuration(notes, 120)).toBeCloseTo(3.5) // (4+2)*0.5 + 0.5
  })
})
