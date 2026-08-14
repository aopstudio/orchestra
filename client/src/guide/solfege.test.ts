import { describe, expect, it } from 'vitest'
import { midiToNumber, midiToTickerLabel, octaveShift } from './solfege'

describe('midiToNumber', () => {
  it('maps C major white keys to 1..7', () => {
    expect(midiToNumber(60)).toBe(1) // C4
    expect(midiToNumber(62)).toBe(2) // D4
    expect(midiToNumber(64)).toBe(3) // E4
    expect(midiToNumber(65)).toBe(4) // F4
    expect(midiToNumber(67)).toBe(5) // G4
    expect(midiToNumber(69)).toBe(6) // A4
    expect(midiToNumber(71)).toBe(7) // B4
  })

  it('maps black keys to the nearest lower degree', () => {
    expect(midiToNumber(61)).toBe(1) // C#4 → do
    expect(midiToNumber(66)).toBe(4) // F#4 → fa
    expect(midiToNumber(70)).toBe(6) // A#4 → la
  })
})

describe('octaveShift', () => {
  it('is 0 at C4 and shifts per octave', () => {
    expect(octaveShift(60)).toBe(0)
    expect(octaveShift(72)).toBe(1) // C5
    expect(octaveShift(48)).toBe(-1) // C3
    expect(octaveShift(84)).toBe(2) // C6
  })
})

describe('midiToTickerLabel', () => {
  it('renders plain numbers in C4 octave', () => {
    expect(midiToTickerLabel(60)).toBe('1')
    expect(midiToTickerLabel(67)).toBe('5')
  })

  it('adds octave dots above/below', () => {
    expect(midiToTickerLabel(72)).toBe("1'") // C5
    expect(midiToTickerLabel(84)).toBe("1''") // C6
    expect(midiToTickerLabel(48)).toBe('1,') // C3
    expect(midiToTickerLabel(55)).toBe('5,') // G3
  })

  it('handles the twinkle melody notes', () => {
    // Twinkle melody: C C G G A A G  → 1 1 5 5 6 6 5
    expect(midiToTickerLabel(60)).toBe('1')
    expect(midiToTickerLabel(67)).toBe('5')
    expect(midiToTickerLabel(69)).toBe('6')
    // F F E E D D C → 4 4 3 3 2 2 1
    expect(midiToTickerLabel(65)).toBe('4')
    expect(midiToTickerLabel(64)).toBe('3')
    expect(midiToTickerLabel(62)).toBe('2')
  })
})
