/**
 * MusicXML 生成器(Phase 2 记谱)
 *
 * 把自研 SongNote 谱面格式转换成标准 MusicXML 3.1(score-partwise),供
 * opensheetmusicdisplay 渲染总谱/分谱。
 *
 * 约定:
 * - divisions = 4/拍(支持 0.5 拍的八分音符)
 * - 每小节 bpi 拍,音符间隙与小节末尾用休止符补齐
 * - 音高: 常规声部用 <pitch>;鼓声部用 <unpitched>(GM 鼓件映射到五线谱位置)
 * - 调号: 内置曲目均为 C 大调(fifths=0)
 */

import type { Song, SongPart } from '../songs/songs'

/** 音符时值(拍)→ MusicXML <type>。 */
function durationType(beats: number): string {
  if (beats >= 4) return 'whole'
  if (beats >= 2) return 'half'
  if (beats >= 1) return 'quarter'
  if (beats >= 0.5) return 'eighth'
  return '16th'
}

/** 时值(拍)→ divisions 数(divisions=4/拍)。 */
function toDivisions(beats: number): number {
  return Math.max(1, Math.round(beats * 4))
}

/** MIDI 音高 → MusicXML pitch(step/alter/octave)。 */
export function pitchOf(note: number): { step: string; alter: number; octave: number } {
  const PC = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B']
  const pc = ((note % 12) + 12) % 12
  const step = PC[pc] ?? 'C'
  const alter = [1, 3, 6, 8, 10].includes(pc) ? 1 : 0
  const octave = Math.floor(note / 12) - 1
  return { step, alter, octave }
}

/** GM 鼓件 → unpitched 显示位置(近似记在五线谱固定行上)。 */
const GM_DISPLAY: Record<number, { step: string; octave: number }> = {
  35: { step: 'B', octave: 2 }, // 大鼓低频
  36: { step: 'C', octave: 3 },
  37: { step: 'C', octave: 4 },
  38: { step: 'E', octave: 3 }, // snare
  39: { step: 'D', octave: 4 },
  40: { step: 'E', octave: 3 },
  41: { step: 'F', octave: 3 },
  42: { step: 'G', octave: 3 }, // hat
  43: { step: 'F', octave: 3 },
  44: { step: 'G', octave: 3 },
  45: { step: 'A', octave: 3 },
  46: { step: 'G', octave: 4 },
  47: { step: 'A', octave: 3 },
  48: { step: 'B', octave: 3 },
  49: { step: 'D', octave: 5 }, // crash
  50: { step: 'B', octave: 3 },
  51: { step: 'C', octave: 5 },
}

/** 乐器的谱号。 */
function clefOf(instrument: SongPart['instrument']): string {
  switch (instrument) {
    case 'drums':
      return '<clef><sign>percussion</sign><line>2</line></clef>'
    case 'bass':
      return '<clef><sign>F</sign><line>4</line></clef>'
    default:
      return '<clef><sign>G</sign><line>2</line></clef>'
  }
}

/** 单个音符的 MusicXML 内容(不含 duration/type,由调用方补)。 */
function noteBody(
  part: SongPart,
  note: { note: number; beat: number; duration?: number; velocity?: number },
): string {
  const dur = note.duration ?? 1
  const common =
    `<duration>${toDivisions(dur)}</duration>` +
    `<voice>1</voice>` +
    `<type>${durationType(dur)}</type>` +
    (note.velocity !== undefined && note.velocity < 127 ? `<dynamics><mp/></dynamics>` : '')
  if (part.instrument === 'drums') {
    const disp = GM_DISPLAY[note.note] ?? { step: 'C', octave: 4 }
    return `<note><unpitched><display-step>${disp.step}</display-step><display-octave>${disp.octave}</display-octave></unpitched>${common}</note>`
  }
  const p = pitchOf(note.note)
  const alter = p.alter === 0 ? '' : `<alter>${p.alter}</alter>`
  return `<note><pitch><step>${p.step}</step>${alter}<octave>${p.octave}</octave></pitch>${common}</note>`
}

/** 休止符的 MusicXML 内容。 */
function restBody(beats: number): string {
  return (
    `<note><rest/><duration>${toDivisions(beats)}</duration><voice>1</voice>` +
    `<type>${durationType(beats)}</type></note>`
  )
}

/** 把一个声部渲染成 <part> 元素(按 bpi 小节分节,休止符补齐)。 */
function partToXml(part: SongPart, bpi: number): string {
  const notes = [...part.notes].sort((a, b) => a.beat - b.beat)
  const totalBeats = Math.max(
    0,
    ...notes.map((n) => n.beat + (n.duration ?? 1)),
  )
  const measureCount = Math.max(1, Math.ceil(totalBeats / bpi))

  let out = ''
  for (let m = 0; m < measureCount; m += 1) {
    const mStart = m * bpi
    const mEnd = mStart + bpi
    const inMeasure = notes.filter((n) => n.beat >= mStart && n.beat < mEnd)
    const measure = ['<measure number="' + (m + 1) + '">']
    measure.push('<attributes><divisions>4</divisions><key><fifths>0</fifths></key>')
    measure.push(`<time><beats>${bpi}</beats><beat-type>4</beat-type></time>`)
    measure.push(clefOf(part.instrument))
    measure.push('</attributes>')

    let cursor = mStart
    for (const n of inMeasure) {
      const gap = n.beat - cursor
      if (gap > 0) measure.push(restBody(gap))
      measure.push(noteBody(part, n))
      cursor = n.beat + (n.duration ?? 1)
    }
    const tail = mEnd - cursor
    if (tail > 0) measure.push(restBody(tail))

    measure.push('</measure>')
    out += measure.join('')
  }
  return out
}

/**
 * 生成整曲总谱(所有声部)或指定声部的分谱。
 * @param song 曲目
 * @param partIds 只渲染这些声部(分谱);缺省渲染全部(总谱)
 */
export function songToMusicXml(song: Song, partIds?: string[]): string {
  const parts = partIds !== undefined ? song.parts.filter((p) => partIds.includes(p.id)) : song.parts

  const partList = parts
    .map((p, i) => `<score-part id="P${i + 1}"><part-name>${p.name}</part-name></score-part>`)
    .join('')

  const partEls = parts
    .map((p, i) => `<part id="P${i + 1}">${partToXml(p, song.bpi)}</part>`)
    .join('')

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<score-partwise version="4.0">\n' +
    `<work><work-title>${song.title}</work-title></work>\n` +
    '<part-list>' +
    partList +
    '</part-list>\n' +
    partEls +
    '\n</score-partwise>\n'
  )
}
