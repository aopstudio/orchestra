import { describe, expect, it } from 'vitest'
import { musicXmlToSong, parseMusicXml } from './musicXmlParser'

const TWO_PART_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.0">
  <work><work-title>Duet Test</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Melody</part-name></score-part>
    <score-part id="P2"><part-name>Accomp</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`

describe('parseMusicXml', () => {
  it('parses two parts into two voices with correct pitches and durations', () => {
    const r = parseMusicXml(TWO_PART_XML)
    expect(r).not.toBeNull()
    expect(r!.title).toBe('Duet Test')
    expect(r!.bpi).toBe(4)
    expect(r!.voices).toHaveLength(2)
    expect(r!.voices[0]).toEqual([
      { note: 60, beat: 0, duration: 1 },
      { note: 64, beat: 1, duration: 1 },
      { note: 67, beat: 2, duration: 2 },
    ])
    expect(r!.voices[1]).toEqual([{ note: 48, beat: 0, duration: 4 }])
  })

  it('transposes into the playable range and produces one part per voice', () => {
    const song = musicXmlToSong(TWO_PART_XML)
    expect(song).not.toBeNull()
    expect(song!.parts).toHaveLength(2)
    expect(song!.bpi).toBe(4)
    for (const part of song!.parts) {
      for (const n of part.notes) {
        expect(n.note).toBeGreaterThanOrEqual(48)
        expect(n.note).toBeLessThanOrEqual(84)
      }
    }
  })

  it('returns null for non-XML text', () => {
    expect(parseMusicXml('hello world')).toBeNull()
  })
})
