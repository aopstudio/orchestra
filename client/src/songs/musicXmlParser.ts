/**
 * MusicXML → Song 解析器(前端版)。
 *
 * 解析 abcnotation.com 等来源的 MusicXML 乐谱:
 * - 支持多 part(每个 <part> 生成一个声部)
 * - 提取 step/alter/octave → MIDI,duration/divisions/拍号 → 拍数
 * - 和弦(同一时刻多音)取第一个音
 * 输出与 ABC 解析器同构的 { title, bpi, voices },供界面统一预览/保存。
 */

import type { Song, SongNote } from './songs'
import { buildSongFromVoices } from './abcParser'
import type { AbcParseResult } from './abcParser'

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function nameToMidi(step: string, alter: number, octave: number): number {
  return 12 * (octave + 1) + (SEMITONE[step] ?? 0) + alter
}

/**
 * 解析 MusicXML 文本 → { title, bpi, voices }(每个 <part> 一个声部)。
 * 解析失败(无音符)返回 null。
 */
export function parseMusicXml(xmlText: string): AbcParseResult | null {
  // 拍号(第一个 <time>)
  const timeMatch = xmlText.match(/<time>\s*<beats>(\d+)<\/beats>\s*<beat-type>(\d+)<\/beat-type>/)
  const bpi = timeMatch ? Number(timeMatch[1]) : 4
  const beatType = timeMatch ? Number(timeMatch[2]) : 4
  const divisionsMatch = xmlText.match(/<divisions>(\d+)<\/divisions>/)
  const divisions = divisionsMatch ? Number(divisionsMatch[1]) : 1
  const beatInDivisions = divisions * (4 / beatType)

  // 标题
  const titleMatch = xmlText.match(/<movement-title>([^<]*)<\/movement-title>|<work-title>([^<]*)<\/work-title>/)
  const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? '导入曲目') || '导入曲目'

  // 按 <part id="..."> 分组提取
  const partRe = /<part\b[^>]*>([\s\S]*?)<\/part>/g
  const voices: SongNote[][] = []
  let pm: RegExpExecArray | null
  while ((pm = partRe.exec(xmlText)) !== null) {
    const partBody = pm[1] ?? ''
    const notes: SongNote[] = []
    let beat = 0
    let currentBeat = 0 // 当前"进行中"音符的拍位(和弦音与之同拍)
    for (const nm of partBody.matchAll(/<note>([\s\S]*?)<\/note>/g)) {
      const block = nm[1] ?? ''
      const pitch = block.match(/<pitch>\s*<step>([A-G])<\/step>(?:\s*<alter>(-?\d+)<\/alter>)?\s*<octave>(\d+)<\/octave>/)
      const durMatch = block.match(/<duration>(\d+)<\/duration>/)
      const durDiv = durMatch ? Number(durMatch[1]) : 0
      const durBeats = durDiv / beatInDivisions
      // 和弦音(<chord/> 标记)与前一音同时发音: 不推进拍位,与同拍已有音取音高最低者合并
      const isChord = block.includes('<chord/>') || block.includes('<chord />')
      if (pitch) {
        const midi = nameToMidi(pitch[1] ?? 'C', pitch[2] ? Number(pitch[2]) : 0, pitch[3] ? Number(pitch[3]) : 4)
        if (isChord) {
          const last = notes[notes.length - 1]
          if (last !== undefined && last.beat === currentBeat) {
            if (midi < last.note) last.note = midi // 取最低音,不新增重叠音符
          } else {
            notes.push({ note: midi, beat: currentBeat, duration: Math.max(durBeats, 0.001) })
          }
        } else {
          currentBeat = beat
          notes.push({ note: midi, beat, duration: Math.max(durBeats, 0.001) })
        }
      }
      if (!isChord) beat += durBeats
    }
    if (notes.length > 0) voices.push(notes)
  }
  if (voices.length === 0) return null
  return { title, bpi, voices }
}

/** MusicXML → 可保存的 Song(每个 part 一个钢琴声部,自动移调)。 */
export function musicXmlToSong(xmlText: string): Song | null {
  const parsed = parseMusicXml(xmlText)
  if (parsed === null) return null
  return buildSongFromVoices(parsed.title, parsed.bpi, parsed.voices, 'mxml')
}
