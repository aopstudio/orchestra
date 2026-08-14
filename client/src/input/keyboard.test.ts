import { describe, expect, it } from 'vitest'

import {
  DRUM_KEYMAP,
  KEYMAP,
  KeyState,
  drumNoteForKey,
  keyForNote,
  noteForKey,
  NOTE_TO_KEY,
} from './keyboard'

describe('KEYMAP', () => {
  it('maps two octaves C3–C5: lower row z–m, upper row a–k, black keys in between', () => {
    expect(KEYMAP).toEqual({
      // 低八度白键 C3–B3
      z: 48,
      x: 50,
      c: 52,
      v: 53,
      b: 55,
      n: 57,
      m: 59,
      // 低八度黑键
      q: 49,
      2: 51,
      3: 54,
      5: 56,
      6: 58,
      // 高八度白键 C4–C5
      a: 60,
      s: 62,
      d: 64,
      f: 65,
      g: 67,
      h: 69,
      j: 71,
      k: 72,
      // 高八度黑键
      w: 61,
      e: 63,
      t: 66,
      y: 68,
      u: 70,
    })
  })
})

describe('noteForKey', () => {
  it('returns the MIDI note for a mapped key', () => {
    expect(noteForKey('a')).toBe(60)
    expect(noteForKey('k')).toBe(72)
  })

  it('is case-insensitive', () => {
    expect(noteForKey('A')).toBe(60)
    expect(noteForKey('W')).toBe(61)
  })

  it('returns null for keys not in the map', () => {
    expect(noteForKey('o')).toBeNull()
    expect(noteForKey('p')).toBeNull()
    expect(noteForKey(' ')).toBeNull()
    expect(noteForKey('')).toBeNull()
  })
})

describe('NOTE_TO_KEY', () => {
  it('is the exact inverse of KEYMAP (note → lowercase key)', () => {
    const expected: Record<number, string> = {}
    for (const [key, note] of Object.entries(KEYMAP)) {
      expected[note] = key
    }
    expect(NOTE_TO_KEY).toEqual(expected)
    expect(NOTE_TO_KEY[60]).toBe('a')
    expect(NOTE_TO_KEY[65]).toBe('f')
    expect(NOTE_TO_KEY[72]).toBe('k')
  })
})

describe('keyForNote', () => {
  it('maps every KEYMAP entry back to its own key', () => {
    for (const [key, note] of Object.entries(KEYMAP)) {
      expect(keyForNote(note)).toBe(key)
    }
  })

  it('returns the right key for a note in range (61 → w)', () => {
    expect(keyForNote(61)).toBe('w')
  })

  it('returns f for MIDI 65', () => {
    expect(keyForNote(65)).toBe('f')
  })

  it('returns null for unmapped notes (999, out of range)', () => {
    expect(keyForNote(999)).toBeNull()
    expect(keyForNote(73)).toBeNull()
    expect(keyForNote(1000)).toBeNull()
  })
})

describe('KeyState', () => {
  it('press returns the MIDI note on first press', () => {
    const ks = new KeyState()
    expect(ks.press('a')).toBe(60)
  })

  it('press returns null when the key is already down (ignores duplicate keydown)', () => {
    const ks = new KeyState()
    expect(ks.press('a')).toBe(60)
    expect(ks.press('a')).toBeNull()
  })

  it('press returns null for auto-repeat events', () => {
    const ks = new KeyState()
    expect(ks.press('a', true)).toBeNull()
  })

  it('press returns null for a repeat event even if the key is held', () => {
    const ks = new KeyState()
    ks.press('a')
    expect(ks.press('a', true)).toBeNull()
  })

  it('release of a held key returns the released MIDI note', () => {
    const ks = new KeyState()
    ks.press('a')
    expect(ks.release('a')).toBe(60)
  })

  it('release then press again returns the note', () => {
    const ks = new KeyState()
    ks.press('a')
    expect(ks.release('a')).toBe(60)
    expect(ks.press('a')).toBe(60)
  })

  it('release of a non-held key returns null', () => {
    const ks = new KeyState()
    ks.press('a')
    ks.release('a')
    expect(ks.release('a')).toBeNull()
  })

  it('release of an unmapped key returns null and does not throw', () => {
    const ks = new KeyState()
    expect(() => ks.release('o')).not.toThrow()
    expect(ks.release('o')).toBeNull()
  })

  it('isDown reflects current state through press and release', () => {
    const ks = new KeyState()
    expect(ks.isDown('a')).toBe(false)
    ks.press('a')
    expect(ks.isDown('a')).toBe(true)
    ks.release('a')
    expect(ks.isDown('a')).toBe(false)
  })

  it('tracks independent keys without interference', () => {
    const ks = new KeyState()
    expect(ks.press('a')).toBe(60)
    expect(ks.press('w')).toBe(61)
    expect(ks.press('a')).toBeNull()
    expect(ks.isDown('w')).toBe(true)
    ks.release('a')
    expect(ks.isDown('a')).toBe(false)
    expect(ks.isDown('w')).toBe(true)
    expect(ks.press('a')).toBe(60)
  })

  it('press on an unmapped key returns null and does not mark it down', () => {
    const ks = new KeyState()
    expect(ks.press('o')).toBeNull()
    expect(ks.isDown('o')).toBe(false)
  })

  it('release on a non-down key is a no-op', () => {
    const ks = new KeyState()
    expect(() => ks.release('z')).not.toThrow()
    expect(() => ks.release('a')).not.toThrow()
  })

  it('is case-insensitive like noteForKey', () => {
    const ks = new KeyState()
    expect(ks.press('A')).toBe(60)
    expect(ks.isDown('a')).toBe(true)
    expect(ks.release('A')).toBe(60)
    expect(ks.isDown('A')).toBe(false)
  })
})

describe('DRUM_KEYMAP / drumNoteForKey', () => {
  it('maps the same key row to GM drum notes (35–51)', () => {
    // 每个映射值都必须是 GM 鼓件范围
    for (const note of Object.values(DRUM_KEYMAP)) {
      expect(note).toBeGreaterThanOrEqual(35)
      expect(note).toBeLessThanOrEqual(51)
    }
    expect(drumNoteForKey('a')).toBe(36) // kick
    expect(drumNoteForKey('s')).toBe(38) // snare
    expect(drumNoteForKey('d')).toBe(42) // closed hat
    expect(drumNoteForKey('k')).toBe(49) // crash
  })

  it('is case-insensitive and returns null for unmapped keys', () => {
    expect(drumNoteForKey('A')).toBe(36)
    expect(drumNoteForKey('z')).toBeNull()
  })

  it('every drum key is also a pitch key (same physical row, muscle-memory friendly)', () => {
    const pitchKeys = new Set(Object.keys(KEYMAP))
    for (const key of Object.keys(DRUM_KEYMAP)) {
      expect(pitchKeys.has(key)).toBe(true)
    }
  })
})

describe('KeyState drum mode', () => {
  it('press/release works with the drum map', () => {
    const ks = new KeyState()
    expect(ks.press('a', false, DRUM_KEYMAP)).toBe(36)
    expect(ks.press('a', false, DRUM_KEYMAP)).toBeNull() // held
    expect(ks.release('a', DRUM_KEYMAP)).toBe(36)
    expect(ks.press('a', false, DRUM_KEYMAP)).toBe(36) // retrigger after release
  })

  it('suppresses auto-repeat in drum mode', () => {
    const ks = new KeyState()
    expect(ks.press('a', false, DRUM_KEYMAP)).toBe(36)
    expect(ks.press('a', true, DRUM_KEYMAP)).toBeNull() // repeat ignored
  })
})
