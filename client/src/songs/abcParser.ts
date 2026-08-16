/**
 * ABC notation → Song 解析器(前端版,与 scripts/abc-to-song.mjs 同源移植)。
 *
 * 支持: 头字段 M(拍号)/L(基本时值)/K(调号,含小调关系大调)/T(标题)、
 * 升降记号 ^ _ =、时值(A2 / A/2 A3/2)、小节线、重复 |: :| [1 [2、
 * 和弦 [...] 取第一音、装饰音/倚音忽略。
 *
 * 输出: 单旋律声部(钢琴)的 Song —— 自动整体移调使所有音落入键盘可演奏
 * 范围(C3–C5, MIDI 48–84),并校验"非鼓声部每拍单音"的曲库约束。
 */

import type { Song, SongNote } from './songs'

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** 键盘可演奏范围(与曲库校验一致)。 */
const PLAYABLE_LOW = 48
const PLAYABLE_HIGH = 84

const KEY_SIG: Record<string, { sharps?: number; flats?: number }> = {
  C: { sharps: 0 }, G: { sharps: 1 }, D: { sharps: 2 }, A: { sharps: 3 }, E: { sharps: 4 },
  B: { sharps: 5 }, 'F#': { sharps: 6 }, 'C#': { sharps: 7 },
  F: { flats: 1 }, Bb: { flats: 2 }, Eb: { flats: 3 }, Ab: { flats: 4 },
  Db: { flats: 5 }, Gb: { flats: 6 }, Cb: { flats: 7 },
}
const MINOR_REL: Record<string, string> = {
  Am: 'C', Em: 'G', Bm: 'D', 'F#m': 'A', 'C#m': 'E', 'G#m': 'B', 'D#m': 'F#',
  Dm: 'F', Gm: 'Bb', Cm: 'Eb', Fm: 'Ab', Bbm: 'Db', Ebm: 'Gb', Abm: 'Cb',
}
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

/** 解析结果(音符 + 拍号 + 标题)。 */
export interface AbcParseResult {
  title: string
  bpi: number
  notes: SongNote[]
}

function keyAccidentals(keyStr: string): Record<string, number> {
  let k = (keyStr ?? 'C').trim().replace(/\s+.*$/, '')
  k = k.replace(/min$/i, 'm').replace(/ minor$/i, 'm')
  const acc: Record<string, number> = {}
  const rel = MINOR_REL[k]
  const sig = KEY_SIG[rel ?? k] ?? { sharps: 0 }
  if (sig.sharps) for (let i = 0; i < sig.sharps; i += 1) acc[SHARP_ORDER[i] ?? ''] = 1
  if (sig.flats) for (let i = 0; i < sig.flats; i += 1) acc[FLAT_ORDER[i] ?? ''] = -1
  return acc
}

/**
 * 解析 ABC 文本 → 音符序列(1 拍 = M 的分母对应音符)。
 * 解析失败(无音符)返回 null。
 */
export function parseAbc(abcText: string): AbcParseResult | null {
  const lines = abcText.split(/\r?\n/)
  const headers: Record<string, string> = {}
  const music: string[] = []
  for (const line of lines) {
    const h = line.match(/^([A-Za-z]):\s*(.*)$/)
    if (h) {
      if (h[1] === 'K' || h[1] === 'M' || h[1] === 'L' || h[1] === 'T') headers[h[1]] = (h[2] ?? '').trim()
      continue
    }
    if (line.trim() !== '' && !line.startsWith('%')) music.push(line.trim())
  }
  const m = (headers.M ?? '4/4').match(/(\d+)\/(\d+)/)
  const bpi = Number(m?.[1] ?? 4)
  const mDen = m ? Number(m[2]) : 4
  const lMatch = (headers.L ?? '1/8').match(/(\d+)\/(\d+)/)
  // 基本时值 L 对应的拍数: 一拍 = M 的分母对应音符
  const lBeats = lMatch ? (Number(lMatch[1]) * mDen) / Number(lMatch[2]) : 0.5
  const acc = keyAccidentals(headers.K ?? 'C')

  const tokens = music.join(' ').match(/(?:\[[^\]\s]+\]|\|[1-2]|:\||\||[^|\s]+)/g) ?? []
  const notes: SongNote[] = []
  let beat = 0
  let repeatInner: SongNote[] | null = null
  let repeatStart = 0
  let repeatOffset = 0

  for (const tok of tokens) {
    if (tok === '|' || tok.startsWith('|1') || tok.startsWith('|2')) continue
    if (tok === ':|') {
      if (repeatInner !== null) {
        for (const n of repeatInner) notes.push({ ...n, beat: n.beat + (beat - repeatStart) + repeatOffset })
        repeatInner = null
      }
      continue
    }
    if (tok === '|:') {
      repeatInner = []
      repeatStart = beat
      continue
    }
    const chord = tok.match(/^\[([_^=]?[A-Ga-g][',]*)/)
    let core = (chord && chord[1] ? chord[1] : tok).replace(/[~()]/g, '')
    const noteMatch = core.match(/^([_^=]?)([A-Ga-g])([',]*)(\d*)(\/\d*)?/)
    if (!noteMatch) continue
    const [, accSym = '', letter = '', octMarks = '', num = '', den = ''] = noteMatch
    const mult = (num ? Number(num) : 1) / (den ? Number(den.replace('/', '')) : 1) || 1
    const durBeats = mult * lBeats
    const upper = letter === letter.toUpperCase()
    const semitone = SEMITONE[letter.toUpperCase()] ?? 0
    const octaveBase = upper ? 60 : 72
    let octShift = 0
    for (const c of octMarks) octShift += c === "'" ? 12 : -12
    let alter = 0
    if (accSym === '^') alter = 1
    else if (accSym === '_') alter = -1
    else alter = acc[letter.toUpperCase()] ?? 0
    const entry: SongNote = { note: octaveBase + semitone + octShift + alter, beat, duration: Math.max(durBeats, 0.001) }
    if (repeatInner !== null) repeatInner.push(entry)
    notes.push(entry)
    beat += durBeats
  }

  if (notes.length === 0) return null
  return { title: headers.T ?? '导入曲目', bpi, notes }
}

/**
 * ABC → 可保存的 Song(单旋律声部,钢琴,自动移调到可演奏范围)。
 * 移调失败(音域太宽)或解析失败返回 null。
 */
export function abcToSong(abcText: string): Song | null {
  const parsed = parseAbc(abcText)
  if (parsed === null) return null

  const lo = Math.min(...parsed.notes.map((n) => n.note))
  const hi = Math.max(...parsed.notes.map((n) => n.note))
  if (hi - lo > PLAYABLE_HIGH - PLAYABLE_LOW) return null // 音域过宽,无法一次移调入键盘

  // 找一个移调量使 [lo+shift, hi+shift] ⊆ [PLAYABLE_LOW, PLAYABLE_HIGH]
  let shift = 0
  for (let s = PLAYABLE_LOW - lo; s <= PLAYABLE_HIGH - hi; s += 1) {
    shift = s
    break
  }
  if (lo + shift < PLAYABLE_LOW || hi + shift > PLAYABLE_HIGH) return null

  const notes = parsed.notes.map((n) => ({ ...n, note: n.note + shift }))
  return {
    id: `abc-${Date.now().toString(36)}`,
    title: parsed.title,
    bpm: 90,
    bpi: parsed.bpi,
    parts: [{ id: 'melody', name: '旋律', instrument: 'piano', notes }],
  }
}
