import { describe, expect, it } from 'vitest'
import { getSong } from '../songs/songs'
import { pitchOf, songToMusicXml } from './musicXml'

describe('pitchOf', () => {
  it('MIDI 60 = C4', () => {
    expect(pitchOf(60)).toEqual({ step: 'C', alter: 0, octave: 4 })
  })
  it('MIDI 61 = C#4', () => {
    expect(pitchOf(61)).toEqual({ step: 'C', alter: 1, octave: 4 })
  })
  it('MIDI 69 = A4', () => {
    expect(pitchOf(69)).toEqual({ step: 'A', alter: 0, octave: 4 })
  })
})

describe('songToMusicXml', () => {
  const twinkle = getSong('twinkle')
  if (twinkle === undefined) throw new Error('twinkle missing')

  it('产出以 score-partwise 开头的 XML 文档', () => {
    const xml = songToMusicXml(twinkle)
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('<score-partwise')
    expect(xml).toContain('</score-partwise>')
  })

  it('总谱包含所有声部与标题', () => {
    const xml = songToMusicXml(twinkle)
    expect(xml).toContain('<work-title>小星星</work-title>')
    expect(xml).toContain('<part-name>旋律</part-name>')
    expect(xml).toContain('<part-name>低音</part-name>')
  })

  it('分谱只包含指定声部', () => {
    const xml = songToMusicXml(twinkle, ['melody'])
    expect(xml).toContain('<part-name>旋律</part-name>')
    expect(xml).not.toContain('<part-name>低音</part-name>')
  })

  it('旋律第一音 C4(60) 出现在第一个音符', () => {
    const xml = songToMusicXml(twinkle, ['melody'])
    expect(xml).toContain('<pitch><step>C</step><octave>4</octave></pitch>')
  })

  it('每小节 bpi 拍,谱面长度 ≥ 歌长', () => {
    const xml = songToMusicXml(twinkle, ['melody'])
    // 小星星旋律 48 拍(6 小节 × 4 拍 × 2 段)→ 12 个 measure
    expect((xml.match(/<measure number=/g) ?? []).length).toBeGreaterThanOrEqual(12)
  })

  it('音符间隙与小节末尾用休止符补齐', () => {
    // 拍 0 与拍 2 各一个四分音符 → 拍 1 处有休止,小节末尾(拍 3)也有休止
    const gapSong = {
      id: 'gap',
      title: 'Gap',
      bpm: 120,
      bpi: 4,
      parts: [
        {
          id: 'p',
          name: 'P',
          instrument: 'piano' as const,
          notes: [
            { note: 60, beat: 0, duration: 1 },
            { note: 62, beat: 2, duration: 1 },
          ],
        },
      ],
    }
    const xml = songToMusicXml(gapSong, ['p'])
    expect(xml).toContain('<rest/>')
    // 小节 1 共 4 拍: 音符 2 拍 + 休止 2 拍
    const measure1 = xml.slice(xml.indexOf('<measure number="1">'), xml.indexOf('<measure number="2">'))
    expect((measure1.match(/<note>/g) ?? []).length).toBe(4)
  })

  it('鼓声部用 unpitched 而非 pitch', () => {
    const rock = getSong('rock-groove')
    if (rock === undefined) throw new Error('rock-groove missing')
    const drumsXml = songToMusicXml(rock, ['drums'])
    expect(drumsXml).toContain('<unpitched>')
    expect(drumsXml).not.toContain('<pitch>')
  })
})
