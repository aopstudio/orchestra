import { describe, expect, it } from 'vitest'

import { KEYMAP, KeyState, keyForNote, noteForKey, NOTE_TO_KEY } from './keyboard'

describe('KEYMAP', () => {
  it('maps a chromatic scale starting at C4 (MIDI 60): lower row = white keys, upper row = black keys', () => {
    expect(KEYMAP).toEqual({
      a: 60,
      w: 61,
      s: 62,
      e: 63,
      d: 64,
      f: 65,
      t: 66,
      g: 67,
      y: 68,
      h: 69,
      u: 70,
      j: 71,
      k: 72,
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
    expect(noteForKey('z')).toBeNull()
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
    expect(keyForNote(59)).toBeNull()
    expect(keyForNote(73)).toBeNull()
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
    expect(() => ks.release('z')).not.toThrow()
    expect(ks.release('z')).toBeNull()
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
    expect(ks.press('z')).toBeNull()
    expect(ks.isDown('z')).toBe(false)
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
