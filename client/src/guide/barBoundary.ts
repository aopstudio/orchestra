/**
 * Bar-boundary math for the song countdown (Phase 1).
 *
 * The song must start ON the metronome's accent — i.e. at a server beat that
 * is a multiple of bpi (beats per bar) — so that the song's first beat is a
 * strong beat. The countdown therefore ends at the next bar boundary rather
 * than after a fixed number of beats.
 */

/**
 * Next bar-boundary beat (multiple of bpi) at least `minAhead` beats after
 * `beat`. A song started here lands its first beat on the metronome accent.
 */
export function nextBarBoundary(beat: number, bpi: number, minAhead = 1): number {
  const target = beat + Math.max(1, minAhead)
  return Math.ceil(target / bpi) * bpi
}
