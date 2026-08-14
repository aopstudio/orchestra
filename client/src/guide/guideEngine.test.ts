import { describe, expect, it } from 'vitest'
import { advanceGuide } from './guideEngine'
import type { SongNote } from '../songs/songs'

const NOTE_AT_5: SongNote = { note: 60, beat: 5 }

describe('advanceGuide: current notes', () => {
  it('marks a note at beat 0 as current when songBeat is 0', () => {
    const notes: SongNote[] = [{ note: 60, beat: 0 }]
    const w = advanceGuide(notes, 0)
    expect(w.current).toEqual([{ note: 60, beat: 0 }])
    expect(w.upcoming).toEqual([])
  })

  it('keeps a long note current across its duration, not after', () => {
    const notes: SongNote[] = [{ note: 60, beat: 0, duration: 4 }]
    expect(advanceGuide(notes, 0.5).current).toHaveLength(1)
    expect(advanceGuide(notes, 3.5).current).toHaveLength(1)
    expect(advanceGuide(notes, 4.5).current).toHaveLength(0)
  })

  it('does not treat a note as current at its exact end boundary', () => {
    const notes: SongNote[] = [{ note: 60, beat: 0, duration: 2 }]
    const w = advanceGuide(notes, 2)
    expect(w.current).toEqual([])
  })
})

describe('advanceGuide: upcoming window', () => {
  it('lists notes inside the lookahead window as upcoming, not current', () => {
    const notes: SongNote[] = [{ note: 60, beat: 0 }, NOTE_AT_5]
    const w = advanceGuide(notes, 1.5, { lookaheadBeats: 4 })
    expect(w.upcoming).toEqual([NOTE_AT_5])
    expect(w.current).toEqual([])
  })

  it('still lists the note as upcoming near the edge of the window', () => {
    const w = advanceGuide([NOTE_AT_5], 4.8, { lookaheadBeats: 4 })
    expect(w.upcoming).toEqual([NOTE_AT_5])
    expect(w.current).toEqual([])
  })

  it('includes a note exactly at the lookahead boundary', () => {
    const notes: SongNote[] = [
      { note: 60, beat: 0 },
      { note: 65, beat: 5 },
    ]
    const w = advanceGuide(notes, 1, { lookaheadBeats: 4 })
    expect(w.upcoming.map((n) => n.beat)).toEqual([5])
  })

  it('switches from upcoming to current when songBeat reaches the note beat', () => {
    const w = advanceGuide([NOTE_AT_5], 5.0, { lookaheadBeats: 4 })
    expect(w.current).toEqual([NOTE_AT_5])
    expect(w.upcoming).toEqual([])
  })

  it('excludes a still-sounding current note from upcoming', () => {
    const long = { note: 60, beat: 0, duration: 4 } satisfies SongNote
    const w = advanceGuide([long], 3, { lookaheadBeats: 4 })
    expect(w.current).toEqual([long])
    expect(w.upcoming).toEqual([])
  })
})

describe('advanceGuide: progress and finished', () => {
  // totalLength = max(0 + 1, 2 + 1) = 3
  const notes: SongNote[] = [
    { note: 60, beat: 0 },
    { note: 62, beat: 2 },
  ]

  it('reports progress 0 before the song starts', () => {
    const w = advanceGuide(notes, -1, { lookaheadBeats: 4 })
    expect(w.progress).toBe(0)
    expect(w.finished).toBe(false)
    expect(w.current).toEqual([])
    expect(w.upcoming.map((n) => n.beat)).toEqual([0, 2])
  })

  it('reports finished and progress 1 after the last note has passed', () => {
    const w = advanceGuide(notes, 3, { lookaheadBeats: 4 })
    expect(w.finished).toBe(true)
    expect(w.progress).toBe(1)
    expect(w.current).toEqual([])
    expect(w.upcoming).toEqual([])
  })

  it('clamps progress to 1 and stays finished beyond the end', () => {
    const w = advanceGuide(notes, 10, { lookaheadBeats: 4 })
    expect(w.progress).toBe(1)
    expect(w.finished).toBe(true)
    expect(w.current).toEqual([])
    expect(w.upcoming).toEqual([])
  })

  it('wraps around in loop mode, never finished', () => {
    const w = advanceGuide(notes, 3, { lookaheadBeats: 4, loop: true })
    expect(w.finished).toBe(false)
    expect(w.progress).toBe(0)
    expect(w.current).toEqual([{ note: 60, beat: 0 }])
    expect(w.upcoming.map((n) => n.beat)).toEqual([2])
  })

  it('cycles progress in loop mode', () => {
    const w = advanceGuide(notes, 4, { lookaheadBeats: 4, loop: true })
    expect(w.finished).toBe(false)
    expect(w.progress).toBeCloseTo(1 / 3)
    expect(w.current).toEqual([])
    expect(w.upcoming.map((n) => n.beat)).toEqual([2])
  })
})

describe('advanceGuide: empty notes', () => {
  it('returns empty windows and finished true', () => {
    const w = advanceGuide([], 0)
    expect(w.current).toEqual([])
    expect(w.upcoming).toEqual([])
    expect(w.finished).toBe(true)
    expect(w.progress).toBe(0)
  })
})

describe('advanceGuide: note ordering', () => {
  it('sorts unsorted notes by beat on import', () => {
    const notes: SongNote[] = [
      { note: 67, beat: 4 },
      { note: 60, beat: 0 },
      { note: 62, beat: 2 },
    ]
    const w = advanceGuide(notes, 0, { lookaheadBeats: 8 })
    expect(w.current).toEqual([{ note: 60, beat: 0 }])
    expect(w.upcoming.map((n) => n.note)).toEqual([62, 67])
  })
})
