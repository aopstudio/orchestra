import { describe, expect, it } from 'vitest'
import { Judge } from './judge'
import type { SongNote } from '../songs/songs'

const note = (note: number, beat: number, duration?: number): SongNote =>
  duration === undefined ? { note, beat } : { note, beat, duration }

describe('Judge', () => {
  describe('hits (对)', () => {
    it('perfect hit: press note 60 exactly on the note beat', () => {
      const judge = new Judge([note(60, 0)])
      const result = judge.press(60, 0.0)
      expect(result.kind).toBe('hit')
      expect(result.matchedNote).toBe(0)
      expect(judge.stats().hits).toBe(1)
      expect(judge.stats().score).toBe(100)
    })

    it('hit within tolerance: note at beat 2, press at 1.6 (early edge)', () => {
      const judge = new Judge([note(60, 2)])
      expect(judge.press(60, 1.6).kind).toBe('hit')
    })

    it('hit within tolerance: note at beat 2, press at 2.4 (late edge)', () => {
      const judge = new Judge([note(60, 2)])
      expect(judge.press(60, 2.4).kind).toBe('hit')
    })

    it('press before the tolerance window is a mistake, not a hit', () => {
      const judge = new Judge([note(60, 2)])
      const result = judge.press(60, 1.4)
      expect(result.kind).toBe('mistake')
      expect(judge.stats().mistakes).toBe(1)
      expect(judge.stats().score).toBe(-20)
    })

    it('duration extends the hit window past the default 1 beat', () => {
      const judge = new Judge([note(60, 0, 4)])
      expect(judge.press(60, 3.0).kind).toBe('hit')
    })

    it('with multiple matching notes, the closest one is hit', () => {
      const judge = new Judge([note(60, 0), note(60, 1)])
      const result = judge.press(60, 1.05)
      expect(result.kind).toBe('hit')
      expect(result.matchedNote).toBe(1)
    })
  })

  describe('mistakes (错)', () => {
    it('pressing a note not in the song is a mistake and decreases score', () => {
      const judge = new Judge([note(60, 0)])
      const result = judge.press(65, 0.0)
      expect(result.kind).toBe('mistake')
      expect(judge.stats().mistakes).toBe(1)
      expect(judge.stats().score).toBe(-20)
    })

    it('a note cannot be double-hit: second press on the same note is a mistake', () => {
      const judge = new Judge([note(60, 0)])
      expect(judge.press(60, 0.2).kind).toBe('hit')
      const second = judge.press(60, 0.3)
      expect(second.kind).toBe('mistake')
      expect(judge.stats().hits).toBe(1)
      expect(judge.stats().mistakes).toBe(1)
      expect(judge.stats().score).toBe(80)
    })

    it('presses at a songBeat before the advanced cursor are ignored', () => {
      const judge = new Judge([note(60, 2), note(65, 6)])
      judge.advance(3.0) // note 60 is still hittable until 3.5
      const result = judge.press(60, 2.8)
      expect(result.kind).toBe('ignored')
      expect(judge.stats().hits).toBe(0)
    })
  })

  describe('misses (漏)', () => {
    it('advance past a note window without pressing counts a miss', () => {
      const judge = new Judge([note(60, 0)]) // window ends at 0 + 1 + 0.5 = 1.5
      const missed = judge.advance(2.0)
      expect(missed).toBe(1)
      expect(judge.stats().misses).toBe(1)
      expect(judge.stats().score).toBe(0)
    })

    it('no miss if the note was hit before the window ends', () => {
      const judge = new Judge([note(60, 0)])
      expect(judge.press(60, 0.2).kind).toBe('hit')
      expect(judge.advance(2.0)).toBe(0)
      expect(judge.stats().misses).toBe(0)
    })

    it('advance returns the number of notes missed in that step', () => {
      const judge = new Judge([note(60, 0), note(62, 1), note(64, 10)])
      expect(judge.advance(4.0)).toBe(2)
      expect(judge.stats().misses).toBe(2)
    })

    it('advance going backwards is a no-op and does not double count', () => {
      const judge = new Judge([note(60, 0)])
      expect(judge.advance(2.0)).toBe(1)
      expect(judge.advance(1.0)).toBe(0)
      expect(judge.stats().misses).toBe(1)
    })
  })

  describe('disabled mode', () => {
    it('press returns ignored, advance returns 0, stats stay zero', () => {
      const judge = new Judge([note(60, 0)], { enabled: false })
      expect(judge.press(60, 0.0).kind).toBe('ignored')
      expect(judge.advance(2.0)).toBe(0)
      expect(judge.stats()).toEqual({ hits: 0, mistakes: 0, misses: 0, score: 0 })
    })
  })

  describe('stats and reset', () => {
    it('stats() returns a snapshot that cannot be mutated through the returned object', () => {
      const judge = new Judge([note(60, 0)])
      judge.press(60, 0.0)
      const snapshot = judge.stats()
      snapshot.hits = 99
      expect(judge.stats().hits).toBe(1)
    })

    it('reset clears all counters and allows judging again', () => {
      const judge = new Judge([note(60, 0)])
      judge.press(65, 0.0)
      judge.advance(2.0)
      expect(judge.stats().mistakes).toBe(1)
      expect(judge.stats().misses).toBe(1)

      judge.reset()
      expect(judge.stats()).toEqual({ hits: 0, mistakes: 0, misses: 0, score: 0 })

      expect(judge.press(60, 0.0).kind).toBe('hit')
      expect(judge.stats().hits).toBe(1)
    })
  })
})
