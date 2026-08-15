/**
 * GuideTicker — scrolling 简谱 strip under the keyboard (Phase 1).
 *
 * Lays the armed part's notes out on a beat ruler inside a dark strip the
 * width of the keyboard. A fixed amber playhead marks the current song
 * position; the strip scrolls underneath it as the song advances, so notes
 * that repeat the same pitch (e.g. twinkle's "1 1 5 5") stay distinct by
 * POSITION rather than by colour.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { SongNote } from '../songs/songs'
import { midiToTickerLabel } from '../guide/solfege'
import { drumLabel } from '../input/drumNames'

/** Timeline pixels per beat — dense melodies still get readable cells. */
const BEAT_PX = 22
/** Fraction of the viewport where the playhead is fixed, from the left. */
const PLAYHEAD_PCT = 0.15
/** Minimum cell width (px); labels clip rather than cells overlap. */
const MIN_CELL_PX = 18

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function noteName(note: number): string {
  const name = NOTE_NAMES[note % 12] ?? '?'
  return `${name}${Math.floor(note / 12) - 1}`
}

function endBeatOf(n: SongNote): number {
  return n.beat + (n.duration ?? 1)
}

function totalBeatsOf(notes: SongNote[]): number {
  let len = 0
  for (const n of notes) {
    const end = endBeatOf(n)
    if (end > len) len = end
  }
  return len
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export interface GuideTickerProps {
  /** The armed part's notes (beat order). */
  notes: SongNote[]
  /**
   * Live song-beat sampler (audio-timeline, beat-synced) — same timeline the
   * metronome is anchored to, so the playhead and the click stay in lockstep.
   * Negative values = prep beats before the song starts (countdown); 0 = the
   * song's first beat; null = no song armed.
   */
  getSongBeat: () => number | null
  /** Number of prep (countdown) beats shown as an empty zone left of the notes. */
  prepBeats: number
  /** False while disconnected — the strip renders dimmed. */
  enabled: boolean
  /** 鼓声部: 音符没有音高,标签显示击打乐器名(底鼓/军鼓/踩镲…)而非简谱数字。 */
  isDrums?: boolean
}

export default function GuideTicker({
  notes,
  getSongBeat,
  prepBeats,
  enabled,
  isDrums = false,
}: GuideTickerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const nowRef = useRef<HTMLSpanElement | null>(null)
  // The whole strip (track transform, note past/current/future, the "now"
  // label) is driven by the rAF loop DIRECTLY on the DOM, so React only
  // re-renders the structure when notes/prepBeats actually change — a render
  // can never clobber the per-frame transform.
  const prepBeatsRef = useRef(prepBeats)
  const totalBeats = useMemo(() => totalBeatsOf(notes), [notes])
  const totalBeatsRef = useRef(totalBeats)

  // Keep the rAF-visible values fresh. Updated after every commit (never
  // during render — react-hooks/refs) so the per-frame loop always reads the
  // latest prep/note extent without forcing a re-render.
  useLayoutEffect(() => {
    prepBeatsRef.current = prepBeats
    totalBeatsRef.current = totalBeats
  })

  // Sample the live beat every frame. The track transform AND note states are
  // written DIRECTLY to the DOM; React renders the track structure only once,
  // so a re-render never clobbers the per-frame transform. displayBeat is
  // state ONLY for the "now" label readout.
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const tick = (): void => {
      const beat = getSongBeat()
      const safe = beat === null ? 0 : beat
      const track = trackRef.current
      const viewport = viewportRef.current
      if (track !== null && viewport !== null) {
        try {
          const total = totalBeatsRef.current
          const prep = prepBeatsRef.current
          const vw = viewport.clientWidth
          const trackW = Math.max(vw, (prep + total) * BEAT_PX)
          // Playhead sits at PLAYHEAD_PCT*vw; the current beat (prep+safe)*BEAT_PX
          // must land there, so the track shifts LEFT as beats advance.
          const raw = PLAYHEAD_PCT * vw - (prep + safe) * BEAT_PX
          // Clamp: track's start never goes right of the playhead, its end
          // never goes left of it.
          const hi = PLAYHEAD_PCT * vw
          const lo = hi - trackW
          const px = clamp(raw, lo, hi)
          // Drive the transform through a CSS variable on the viewport: React
          // never touches --track-x (it is not in any JSX style), so a re-render
          // of the parent can't clobber the per-frame position. px is already
          // signed (negative = left), so write it verbatim.
          viewport.style.setProperty('--track-x', `${px}px`)
          viewport.style.setProperty('--track-w', `${trackW}px`)
          const notes = track.querySelectorAll<HTMLElement>('[data-testid="guide-note"]')
          let currentLabel = ''
          for (const el of notes) {
            const b = Number(el.dataset.beat)
            const end = b + Number(el.dataset.dur ?? 1)
            const cur = safe >= b && safe < end
            el.classList.toggle('guide-note-past', safe >= end)
            el.classList.toggle('guide-note-current', cur)
            el.classList.toggle('guide-note-future', safe < b)
            if (cur && currentLabel === '') {
              currentLabel = `${el.dataset.label ?? ''} <em>${el.dataset.name ?? ''}</em>`
            }
          }
          const nowEl = nowRef.current
          if (nowEl !== null) {
            nowEl.innerHTML = currentLabel === '' ? '<em>—</em>' : currentLabel
          }
        } catch (err) {
          // A per-frame error must never kill the sweep; surface it for devs.
          console.warn('[GuideTicker] frame error:', err)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled, getSongBeat])

  // Ruler ticks: prep zone is dashed/empty, song beats are the note ruler.
  const ticks = useMemo(() => {
    const out: Array<{ beat: number; major: boolean; prep: boolean }> = []
    for (let b = -prepBeats; b <= totalBeats; b += 1) {
      out.push({ beat: b, major: b % 4 === 0, prep: b < 0 })
    }
    return out
  }, [totalBeats, prepBeats])

  // 鼓声部标签 = 击打乐器名(底鼓/军鼓/踩镲…);旋律声部 = 简谱数字。
  const labelOf = (note: number): string =>
    isDrums ? (drumLabel(note) ?? midiToTickerLabel(note)) : midiToTickerLabel(note)

  return (
    <section className={`guide-ticker-panel panel${enabled ? '' : ' guide-ticker-off'}`}>
      <div className="guide-ticker-head">
        <span className="guide-ticker-title">简谱 · Guide Position</span>
        <span className="guide-ticker-now">
          <span ref={nowRef}>
            <em>—</em>
          </span>
        </span>
      </div>
      <div
        className="guide-ticker"
        data-testid="guide-ticker"
        ref={viewportRef}
        aria-label="简谱 song position guide"
      >
        {notes.length > 0 ? (
          <div className="guide-ticker-track" ref={trackRef}>
            {ticks.map(({ beat, major, prep }) => (
              <span
                key={beat}
                className={`guide-tick${major ? ' guide-tick-major' : ''}${
                  prep ? ' guide-tick-prep' : ''
                }`}
                style={{ left: (prepBeats + beat) * BEAT_PX }}
              />
            ))}
            {notes.map((n, i) => {
              const end = endBeatOf(n)
              const label = labelOf(n.note)
              const fullName = isDrums ? (drumLabel(n.note) ?? noteName(n.note)) : noteName(n.note)
              return (
                <div
                  key={`${n.beat}-${n.note}-${i}`}
                  className={`guide-note${isDrums ? ' guide-note-drum' : ''}`}
                  data-testid="guide-note"
                  data-note={n.note}
                  data-beat={n.beat}
                  data-dur={end - n.beat}
                  data-label={label}
                  data-name={fullName}
                  title={`${fullName} · beat ${n.beat}`}
                  style={{
                    left: (prepBeats + n.beat) * BEAT_PX,
                    width: Math.max((end - n.beat) * BEAT_PX, MIN_CELL_PX),
                  }}
                >
                  <span className="guide-note-label">{label}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <span className="guide-ticker-empty">pick a part to see the 简谱 guide</span>
        )}
        <div className="guide-ticker-playhead" data-testid="guide-ticker-playhead" />
      </div>
    </section>
  )
}
