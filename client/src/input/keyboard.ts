/**
 * Computer-keyboard → MIDI note mapping (pure module, no DOM).
 *
 * Layout: the lower row of keys (a s d f g h j k) are the white keys,
 * the upper row (w e t y u) are the black keys — a chromatic scale
 * starting at C4 (MIDI 60), like a computer-keyboard piano.
 */

/** Lowercase key name → MIDI note number (chromatic scale from C4 = 60). */
export const KEYMAP: Record<string, number> = {
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
}

/**
 * Returns the MIDI note for a key (case-insensitive), or `null` if the
 * key is not in the map. Callers should pass `KeyboardEvent.key` values.
 */
export function noteForKey(key: string): number | null {
  const note = KEYMAP[key.toLowerCase()]
  return note ?? null
}

/**
 * Exact inverse of {@link KEYMAP}: MIDI note number → lowercase key name.
 * Built from KEYMAP programmatically so it can never drift from it.
 */
export const NOTE_TO_KEY: Record<number, string> = {}
for (const [key, note] of Object.entries(KEYMAP)) {
  NOTE_TO_KEY[note] = key
}

/**
 * Returns the lowercase key name for a MIDI note, or `null` when the note
 * is not mapped to any key.
 */
export function keyForNote(note: number): string | null {
  return NOTE_TO_KEY[note] ?? null
}

/**
 * Tracks which keys are currently held down, suppressing duplicate
 * keydown events and OS-level auto-repeat. Call with the browser's
 * `event.repeat` flag to ignore repeats even before down-tracking sees
 * them.
 */
export class KeyState {
  private readonly down = new Set<string>()

  /**
   * Marks `key` as down and returns its MIDI note, or `null` when the
   * event should be ignored (auto-repeat, already held, or unmapped key).
   */
  press(key: string, repeat = false): number | null {
    const k = key.toLowerCase()
    if (repeat || this.down.has(k)) return null
    const note = noteForKey(k)
    if (note === null) return null
    this.down.add(k)
    return note
  }

  /**
   * Releases `key` and returns the MIDI note that was released, or `null`
   * when the key was not held or is not mapped.
   */
  release(key: string): number | null {
    const k = key.toLowerCase()
    if (!this.down.has(k)) return null
    this.down.delete(k)
    return noteForKey(k)
  }

  /** Whether `key` is currently held down. */
  isDown(key: string): boolean {
    return this.down.has(key.toLowerCase())
  }
}
