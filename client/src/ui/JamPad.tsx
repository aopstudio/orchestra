/**
 * JamPad — computer-keyboard + mouse/touch piano for the two-browser jam.
 *
 * Three octaves (C3–C6, MIDI 48–84): 22 white keys + 15 black keys. Only the
 * middle octave (C4–C5, MIDI 60–72) maps to the computer keyboard — lower row
 * A S D F G H J K for the whites, upper row W E T Y U for the blacks (matches
 * input/keyboard.ts). The extended octaves are mouse/touch only.
 *
 * Keys can be played with the computer keyboard (routed globally in App,
 * never captured here) or with a mouse/finger: pointer-down = note on,
 * release / pointer-cancel / lost-capture = note off. Notes held by OTHER
 * players in the room light up with a distinct violet "remote" glow. The
 * Sound Test button verifies local audio before joining.
 */

import type { PointerEvent as ReactPointerEvent } from 'react'
import { keyForNote } from '../input/keyboard'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Lowest MIDI note on the pad (C3). */
export const PAD_LOW_NOTE = 48
/** Highest MIDI note on the pad (C6). */
export const PAD_HIGH_NOTE = 84

/** White-note chromatic offsets within an octave (C D E F G A B). */
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]

/** Number of white keys on the pad (3 full octaves + the top C). */
const WHITE_KEY_COUNT = 22
/** Each white key occupies this % of the keyboard width. */
const WHITE_KEY_PCT = 100 / WHITE_KEY_COUNT
/**
 * Black key width as % of the keyboard — MUST stay in sync with
 * `.key-black { width: ... }` in index.css (the `left` below uses half of it).
 */
const BLACK_KEY_WIDTH_PCT = 2.6

function noteName(note: number): string {
  const name = NOTE_NAMES[note % 12] ?? '?'
  return `${name}${Math.floor(note / 12) - 1}`
}

interface PianoKey {
  note: number
  name: string
  /** Octave caption (e.g. 'C3') drawn on the octave-start white keys. */
  octaveLabel?: string
  /** Computer-keyboard letter — middle-octave keys only (from KEYMAP). */
  keyboardKey?: string
}

interface BlackKey extends PianoKey {
  /** CSS `left` percentage — centred on the gap between two white keys. */
  left: string
}

const isWhite = (note: number): boolean => WHITE_OFFSETS.includes(note % 12)

/** All white keys C3–C6 in ascending MIDI order. */
const WHITE_KEYS: PianoKey[] = []
/** All black keys C#3–A#5 in ascending MIDI order. */
const BLACK_KEYS: BlackKey[] = []

/**
 * Map every white note to its index within WHITE_KEYS. A black key's centre
 * sits on the gap between white `i` and white `i + 1`, so its `left` is
 * `(i + 1) * whitePct - halfWidth` — the same formula the old 8-key pad used.
 */
const whiteIndexOf: Record<number, number> = {}
for (let note = PAD_LOW_NOTE; note <= PAD_HIGH_NOTE; note += 1) {
  if (!isWhite(note)) continue
  whiteIndexOf[note] = WHITE_KEYS.length
  WHITE_KEYS.push({
    note,
    name: noteName(note),
    octaveLabel: note % 12 === 0 ? noteName(note) : undefined,
    keyboardKey: keyForNote(note) ?? undefined,
  })
}

for (let note = PAD_LOW_NOTE; note <= PAD_HIGH_NOTE; note += 1) {
  if (isWhite(note)) continue
  const leftWhiteIndex = whiteIndexOf[note - 1] ?? 0
  BLACK_KEYS.push({
    note,
    name: noteName(note),
    keyboardKey: keyForNote(note) ?? undefined,
    left: `${(leftWhiteIndex + 1) * WHITE_KEY_PCT - BLACK_KEY_WIDTH_PCT / 2}%`,
  })
}

/** Empty guide window — a stable default so the pad needs no other guards. */
const EMPTY_GUIDE: ReadonlySet<number> = new Set()

export interface JamPadProps {
  /** MIDI notes currently held locally (keyboard or mouse) — pressed glow. */
  downNotes: ReadonlySet<number>
  /** MIDI notes currently held by OTHER players (drives the violet highlight). */
  remoteNotes: ReadonlySet<number>
  /**
   * MIDI notes the guide says to press NOW (strong amber pulse). Additive —
   * a key pressed on the right guide note keeps its cyan fill plus an amber ring.
   */
  guideCurrent?: ReadonlySet<number>
  /** MIDI notes arriving within the guide's lookahead window (faint amber outline). */
  guideUpcoming?: ReadonlySet<number>
  /** Keyboard + pointer input is only routed to the jam while connected. */
  enabled: boolean
  /** Plays a local C-major arpeggio to verify audio before joining. */
  soundTest: () => void
  soundTestBusy: boolean
  /** Note-on for a virtual key (mouse/touch). Same pipeline as the keyboard. */
  onNoteDown: (note: number) => void
  /** Note-off for a virtual key (mouse/touch release or leave). */
  onNoteUp: (note: number) => void
}

/**
 * Middle-octave keys keep the `key A — C4 (MIDI 60)` label (an e2e contract);
 * extended keys carry only the note name, e.g. `C3 (MIDI 48)`.
 */
function ariaLabel(k: PianoKey): string {
  return k.keyboardKey !== undefined
    ? `key ${k.keyboardKey.toUpperCase()} — ${k.name} (MIDI ${k.note})`
    : `${k.name} (MIDI ${k.note})`
}

/**
 * Key state classes: base `key-white`/`key-black` plus `pressed` for notes held
 * locally, `remote` for notes held by another player, and the additive guide
 * layer (`guide-now` / `guide-next`) driven by the song guide. All state classes
 * may coexist on one key (CSS resolves the visual priority; local style wins),
 * so a key that is both held and on the guide shows both signals.
 */
function keyClass(
  note: number,
  isBlack: boolean,
  downNotes: ReadonlySet<number>,
  remoteNotes: ReadonlySet<number>,
  guideCurrent: ReadonlySet<number>,
  guideUpcoming: ReadonlySet<number>,
): string {
  const classes = ['key', isBlack ? 'key-black' : 'key-white']
  if (downNotes.has(note)) classes.push('pressed')
  if (remoteNotes.has(note)) classes.push('remote')
  // Guide layer is additive and independent of the player states. guide-now
  // wins over guide-next when both windows claim a key.
  if (guideCurrent.has(note)) classes.push('guide-now')
  else if (guideUpcoming.has(note)) classes.push('guide-next')
  return classes.join(' ')
}

export default function JamPad({
  downNotes,
  remoteNotes,
  guideCurrent = EMPTY_GUIDE,
  guideUpcoming = EMPTY_GUIDE,
  enabled,
  soundTest,
  soundTestBusy,
  onNoteDown,
  onNoteUp,
}: JamPadProps) {
  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>, note: number): void => {
    if (!enabled) return
    e.preventDefault()
    // Capture the pointer so dragging off the key still delivers the release
    // (onLostPointerCapture is the safety net for cancelled gestures).
    // 捕获失败(如非活动指针)绝不能阻断发声 —— 音符照常触发。
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore: capture is an enhancement, not a requirement */
    }
    onNoteDown(note)
  }

  const handlePointerEnd = (e: ReactPointerEvent<HTMLButtonElement>, note: number): void => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    onNoteUp(note)
  }

  return (
    <section className="panel kbd-panel">
      <h2 className="panel-title">
        <span>Keyboard</span>
        <span className="kbd-hint">{enabled ? 'keys live' : 'connect to play'}</span>
      </h2>

      <div className={`keys${enabled ? '' : ' keys-off'}`} aria-label="piano keyboard">
        <div className="keys-whites">
          {WHITE_KEYS.map((k) => (
            <button
              key={k.note}
              type="button"
              tabIndex={-1}
              aria-label={ariaLabel(k)}
              className={keyClass(
                k.note,
                false,
                downNotes,
                remoteNotes,
                guideCurrent,
                guideUpcoming,
              )}
              onPointerDown={(e) => handlePointerDown(e, k.note)}
              onPointerUp={(e) => handlePointerEnd(e, k.note)}
              onPointerCancel={(e) => handlePointerEnd(e, k.note)}
              onLostPointerCapture={(e) => handlePointerEnd(e, k.note)}
            >
              {k.octaveLabel !== undefined && <span className="key-octave">{k.octaveLabel}</span>}
              {k.keyboardKey !== undefined && (
                <span className="key-letter">{k.keyboardKey.toUpperCase()}</span>
              )}
              <span className="key-note">{k.name}</span>
            </button>
          ))}
        </div>
        <div className="keys-blacks">
          {BLACK_KEYS.map((k) => (
            <button
              key={k.note}
              type="button"
              tabIndex={-1}
              aria-label={ariaLabel(k)}
              className={keyClass(
                k.note,
                true,
                downNotes,
                remoteNotes,
                guideCurrent,
                guideUpcoming,
              )}
              style={{ left: k.left }}
              onPointerDown={(e) => handlePointerDown(e, k.note)}
              onPointerUp={(e) => handlePointerEnd(e, k.note)}
              onPointerCancel={(e) => handlePointerEnd(e, k.note)}
              onLostPointerCapture={(e) => handlePointerEnd(e, k.note)}
            >
              {k.keyboardKey !== undefined && (
                <span className="key-letter">{k.keyboardKey.toUpperCase()}</span>
              )}
              <span className="key-note">{k.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="kbd-foot">
        <span className="kbd-hint">
          C3–C6 · rows <b>A S D F G H J K</b> · <b>W E T Y U</b>
        </span>
        <button
          type="button"
          className="btn btn-soundtest"
          onClick={() => soundTest()}
          disabled={soundTestBusy}
        >
          {soundTestBusy ? 'warming up…' : 'Sound Test'}
        </button>
      </div>
    </section>
  )
}
