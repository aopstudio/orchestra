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

  it('produces one part per voice and keeps the original pitch (faithful)', () => {
    const song = musicXmlToSong(TWO_PART_XML)
    expect(song).not.toBeNull()
    expect(song!.parts).toHaveLength(2)
    expect(song!.bpi).toBe(4)
    // 原谱音高如实保留(C3 起)
    expect(song!.parts[0]!.notes.map((n) => n.note)).toEqual([60, 64, 67])
    expect(song!.parts[1]!.notes.map((n) => n.note)).toEqual([48])
  })

  it('returns null for non-XML text', () => {
    expect(parseMusicXml('hello world')).toBeNull()
  })
})
