#!/usr/bin/env node
/**
 * 乐谱 → Orchestra SongNote 转换器
 *
 * 支持两种纯文本乐谱格式,直接生成曲库数据(client/src/songs/songs.ts 的 SongNote[]):
 *   - MusicXML(abcnotation.com 的公有领域曲目下载源,八度/时值明确)
 *   - ABC notation(用户点名的文本乐谱格式;常见于 abcnotation/Wikipedia)
 *
 * 用法:
 *   node scripts/abc-to-song.mjs --xml file.xml [--bpi 4]
 *   node scripts/abc-to-song.mjs --abc file.abc
 *
 * 输出: { bpi, notes: [{note, beat, duration}] } —— beat 以 1 拍为单位,
 * 小节线按拍号推进;装饰音/重复标记已展开或忽略。
 */

import { readFileSync } from 'node:fs'

// ---------- 音名工具 ----------
const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** 音名(step, alter, octave) → MIDI。octave 用 MusicXML 约定(C4=60)。 */
function nameToMidi(step, alter, octave) {
  return 12 * (octave + 1) + SEMITONE[step] + (alter ?? 0)
}

// ---------- MusicXML 解析 ----------
/**
 * 解析 MusicXML 单个声部 → { notes, bpi, measureBeats }。
 * 只取第一个 part;和弦(同时多音)取第一个音。
 */
export function parseMusicXml(xmlText, opts = {}) {
  const xml = xmlText.replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/g, '')
  // 简化解析: 用正则逐 <note> 提取 pitch + duration(不引第三方库)
  const divisionsMatch = xml.match(/<divisions>(\d+)<\/divisions>/)
  const divisions = divisionsMatch ? Number(divisionsMatch[1]) : 1
  const timeMatch = xml.match(/<time>\s*<beats>(\d+)<\/beats>\s*<beat-type>(\d+)<\/beat-type>/)
  const bpi = timeMatch ? Number(timeMatch[1]) : (opts.bpi ?? 4)
  const beatType = timeMatch ? Number(timeMatch[2]) : 4
  // 一拍 = beat-type 对应时值。duration 单位 = divisions。
  const beatInDivisions = divisions * (4 / beatType)

  const notes = []
  let beat = 0
  // 按 note 顺序推进(含休止符占时值)
  const noteRe = /<note>([\s\S]*?)<\/note>/g
  let m
  while ((m = noteRe.exec(xml)) !== null) {
    const block = m[1]
    const pitch = block.match(/<pitch>\s*<step>([A-G])<\/step>(?:\s*<alter>(-?\d+)<\/alter>)?\s*<octave>(\d+)<\/octave>/)
    const durMatch = block.match(/<duration>(\d+)<\/duration>/)
    const durDiv = durMatch ? Number(durMatch[1]) : 0
    const durBeats = durDiv / beatInDivisions
    if (pitch) {
      const midi = nameToMidi(pitch[1], pitch[2] ? Number(pitch[2]) : 0, Number(pitch[3]))
      notes.push({ note: midi, beat, duration: Math.max(durBeats, 0.001) })
    }
    beat += durBeats
  }
  return { bpi, notes }
}

// ---------- ABC 解析 ----------
/** 调号 → { sharps: number, flats: number }(K: 后的小调转关系大调)。 */
const KEY_SIG = {
  C: { sharps: 0 }, G: { sharps: 1 }, D: { sharps: 2 }, A: { sharps: 3 }, E: { sharps: 4 },
  B: { sharps: 5 }, 'F#': { sharps: 6 }, 'C#': { sharps: 7 },
  F: { flats: 1 }, Bb: { flats: 2 }, Eb: { flats: 3 }, Ab: { flats: 4 },
  Db: { flats: 5 }, Gb: { flats: 6 }, Cb: { flats: 7 },
}
// 小调 → 关系大调(升号递增 3 个五度)
const MINOR_REL = { Am: 'C', Em: 'G', Bm: 'D', 'F#m': 'A', 'C#m': 'E', 'G#m': 'B', 'D#m': 'F#',
  Dm: 'F', Gm: 'Bb', Cm: 'Eb', Fm: 'Ab', Bbm: 'Db', Ebm: 'Gb', Abm: 'Cb' }
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

function keyAccidentals(keyStr) {
  let k = (keyStr ?? 'C').trim().replace(/\s+.*$/, '')
  // 处理小调后缀: Emin/Em/E minor → E
  k = k.replace(/min$/i, 'm').replace(/ minor$/i, 'm')
  let acc = {}
  if (MINOR_REL[k]) k = MINOR_REL[k]
  const sig = KEY_SIG[k] ?? { sharps: 0 }
  if (sig.sharps) for (let i = 0; i < sig.sharps; i++) acc[SHARP_ORDER[i]] = 1
  if (sig.flats) for (let i = 0; i < sig.flats; i++) acc[FLAT_ORDER[i]] = -1
  return acc
}

/**
 * 解析 ABC 文本 → { bpi, notes }。
 * 处理: 拍号 M、基本时值 L、调号 K、小节线、重复 |: :| [1 [2、
 * 升降记号 ^ _ =、装饰(~()/倚音)、和弦[...]取第一音。
 */
export function parseAbc(abcText, opts = {}) {
  const lines = abcText.split(/\r?\n/)
  const headers = {}
  let music = []
  for (const line of lines) {
    const h = line.match(/^([A-Za-z]):\s*(.*)$/)
    if (h && /^[A-Za-z]$/.test(h[1]) && !['K', 'M', 'L'].includes(h[1])) continue
    if (h && /^[KML]$/.test(h[1])) headers[h[1]] = h[2].trim()
    else if (h) continue
    else if (line.trim() !== '' && !line.startsWith('%')) music.push(line.trim())
  }
  const m = (headers.M ?? '4/4').match(/(\d+)\/(\d+)/)
  const bpi = Number(m?.[1] ?? 4)
  const lMatch = (headers.L ?? '1/8').match(/(\d+)\/(\d+)/)
  // 基本时值 L 对应的拍数: 一拍 = M 的分母对应音符。例: M:6/8,L:1/8 → 1 拍;
  // M:4/4,L:1/8 → 0.5 拍。公式 = L分子×M分母/L分母。
  const lBeats = lMatch ? (Number(lMatch[1]) * (m ? Number(m[2]) : 4)) / Number(lMatch[2]) : 0.5
  const acc = keyAccidentals(headers.K)

  const text = music.join(' ')
  const notes = []
  let beat = 0
  let i = 0
  // 展开重复: 简单处理 |: ... :| 展开一次(不处理嵌套)
  const tokenRe = /(?:\[[^\]\s]+\]|\|[1-2]|:\||\||[^|\s]+)/g
  const tokens = text.match(tokenRe) ?? []
  let repeatStack = null // {startBeat, notes:[]}
  let firstEnding = null
  const flushRepeat = () => { if (repeatStack) { for (const n of repeatStack) notes.push({ ...n, beat: n.beat + repeatStack.offset }) ; repeatStack = null } }

  for (const tok of tokens) {
    if (tok === '|' || tok.startsWith('|')) continue
    if (tok === ':|' || tok === ':|' || tok === '|:') {
      if (tok === ':|' && repeatStack) { const off = beat - repeatStack.startBeat; flushRepeat(); repeatStack = null }
      else if (tok === '|:') { repeatStack = { startBeat: beat, offset: 0, inner: [] }; }
      continue
    }
    if (tok.startsWith('[1')) { if (repeatStack) repeatStack.offset = beat - repeatStack.startBeat; continue }
    if (tok.startsWith('[2')) { if (repeatStack) { repeatStack = { ...repeatStack }; } continue }
    // 和弦 [CEG] 取第一音
    const chord = tok.match(/^\[([_^=]?[A-Ga-g][',]*)/)
    let core = chord ? chord[1] : tok
    // 去掉装饰: 倚音 {x} 忽略,连音 ~ 忽略符号
    core = core.replace(/[~()]/g, '')
    const noteMatch = core.match(/^([_^=]?)([A-Ga-g])([',]*)(\d*)(\/\d*)?/)
    if (!noteMatch) continue
    const [, accSym, letter, octMarks, num, den] = noteMatch
    // 时值
    const mult = (num ? Number(num) : 1) / (den ? Number(den.replace('/', '')) : 1)
    const durBeats = mult * lBeats
    // 音高
    const upper = letter === letter.toUpperCase()
    const semitone = SEMITONE[letter.toUpperCase()]
    let octaveBase = upper ? 60 : 72 // 大写 C-B = C4..B4; 小写 c-b = C5..B5
    let octShift = 0
    for (const c of octMarks) octShift += c === "'" ? 12 : -12
    let alter = 0
    if (accSym === '^') alter = 1
    else if (accSym === '_') alter = -1
    else alter = acc[letter.toUpperCase()] ?? 0
    const midi = octaveBase + semitone + octShift + alter
    const entry = { note: midi, beat, duration: Math.max(durBeats, 0.001) }
    if (repeatStack) repeatStack.inner.push(entry)
    notes.push(entry)
    beat += durBeats
  }
  return { bpi, notes }
}

// ---------- CLI ----------
const argv = process.argv.slice(2)
function usage() {
  console.log('用法: node scripts/abc-to-song.mjs --xml file.xml [--bpi N] | --abc file.abc')
}
const xmlIdx = argv.indexOf('--xml')
const abcIdx = argv.indexOf('--abc')
const bpiIdx = argv.indexOf('--bpi')
const bpi = bpiIdx !== -1 ? Number(argv[bpiIdx + 1]) : undefined
if (xmlIdx !== -1) {
  const res = parseMusicXml(readFileSync(argv[xmlIdx + 1], 'utf8'), { bpi })
  console.log(JSON.stringify(res, null, 1))
} else if (abcIdx !== -1) {
  const res = parseAbc(readFileSync(argv[abcIdx + 1], 'utf8'), { bpi })
  console.log(JSON.stringify(res, null, 1))
} else {
  usage()
}
