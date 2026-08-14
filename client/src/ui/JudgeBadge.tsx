/**
 * JudgeBadge — transient hit/mistake feedback floating over the keyboard.
 *
 * Renders nothing when there is no judgment event. When App feeds it a badge,
 * the `id` key retriggers the pop-in animation so every hit/miss reads as a
 * fresh cue. The badge is pointer-transparent (it must never eat key presses).
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function noteName(note: number): string {
  const name = NOTE_NAMES[note % 12] ?? '?'
  return `${name}${Math.floor(note / 12) - 1}`
}

export interface JudgeBadgeData {
  kind: 'hit' | 'mistake'
  note: number
  /** Monotonic bump key — changing it retriggers the pop animation. */
  id: number
}

export interface JudgeBadgeProps {
  badge: JudgeBadgeData | null
}

export default function JudgeBadge({ badge }: JudgeBadgeProps) {
  if (badge === null) return null
  const hit = badge.kind === 'hit'
  return (
    <div
      key={badge.id}
      className={`judge-badge ${hit ? 'judge-badge-hit' : 'judge-badge-mistake'}`}
      role="status"
      aria-live="polite"
    >
      <span className="judge-badge-mark">{hit ? '◉' : '✕'}</span>
      <span className="judge-badge-text">
        {hit ? 'HIT' : 'MISS'} · {noteName(badge.note)}
      </span>
    </div>
  )
}
