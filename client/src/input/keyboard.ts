/**
 * Computer-keyboard → MIDI note mapping (pure module, no DOM).
 *
 * Layout: two octaves C3–C5 (MIDI 48–72):
 * - 低八度: 白键 z x c v b n m,黑键 q 2 3 5 6
 * - 高八度: 白键 a s d f g h j k,黑键 w e t y u
 *
 * 鼓模式(选中的声部为 drums 时): 同一排键映射为 GM 鼓件(35–51),
 * 每个键是一个"鼓垫",按下即敲击,支持连续重触发。
 */

/** Lowercase key name → MIDI note number (C3–C5, 48–72). */
export const KEYMAP: Record<string, number> = {
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
}

/** 鼓模式键位: 键 → GM 鼓件音符(35–51)。与 KEYMAP 同键位,便于肌肉记忆。 */
export const DRUM_KEYMAP: Record<string, number> = {
  a: 36, // kick
  s: 38, // snare
  d: 42, // closed hi-hat
  f: 46, // open hi-hat
  g: 41, // low floor tom
  h: 45, // mid tom
  j: 48, // high tom
  k: 49, // crash
  w: 39, // hand clap
  e: 37, // rimshot
  t: 43, // high floor tom
  y: 44, // pedal hi-hat
  u: 47, // low-mid tom
}

export type KeyMap = Record<string, number>

/**
 * Returns the MIDI note for a key in the given map (case-insensitive),
 * or `null` if the key is not in the map. Callers should pass
 * `KeyboardEvent.key` values.
 */
export function noteFor(key: string, map: KeyMap): number | null {
  const note = map[key.toLowerCase()]
  return note ?? null
}

/** 音高模式: 键 → 音高音符。 */
export function noteForKey(key: string): number | null {
  return noteFor(key, KEYMAP)
}

/** 鼓模式: 键 → GM 鼓件音符。 */
export function drumNoteForKey(key: string): number | null {
  return noteFor(key, DRUM_KEYMAP)
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
   * `map` selects the note lookup (pitch keys or drum keys).
   */
  press(key: string, repeat = false, map: KeyMap = KEYMAP): number | null {
    const k = key.toLowerCase()
    if (repeat || this.down.has(k)) return null
    const note = noteFor(k, map)
    if (note === null) return null
    this.down.add(k)
    return note
  }

  /**
   * Releases `key` and returns the MIDI note that was released, or `null`
   * when the key was not held or is not mapped.
   */
  release(key: string, map: KeyMap = KEYMAP): number | null {
    const k = key.toLowerCase()
    if (!this.down.has(k)) return null
    this.down.delete(k)
    return noteFor(k, map)
  }

  /** Whether `key` is currently held down. */
  isDown(key: string): boolean {
    return this.down.has(key.toLowerCase())
  }
}
