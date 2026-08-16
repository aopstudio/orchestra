/**
 * ABC notation → Song 解析器(前端版)。
 *
 * 支持: 头字段 M(拍号)/L(基本时值)/K(调号,含小调关系大调)/T(标题)、
 * 升降记号 ^ _ =、时值(A2 / A/2 A3/2)、小节线、重复 |: :| [1 [2、
 * **多声部 V:1 / V:2**(每个声部独立音符流,生成多个 part)、
 * 和弦 [...] 取最低音(适配"每拍单音"的曲库约束)、装饰音/倚音忽略。
 *
 * 输出: Song —— 每个声部一个钢琴 part,自动整体移调使所有音落入
 * 键盘可演奏范围(C3–C5, MIDI 48–84)。
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

/** 解析结果: 拍号 + 每个声部的音符(beat 以 1 拍为单位)。 */
export interface AbcParseResult {
  title: string
  bpi: number
  voices: SongNote[][]
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

/** 单个 ABC 音符 token(音高+时值) → MIDI;非法返回 null。 */
function abcTokenToMidi(token: string, acc: Record<string, number>): number | null {
  const core = token.replace(/[~()]/g, '')
  const m = core.match(/^([_^=]?)([A-Ga-g])([',]*)(\d*)(\/\d*)?/)
  if (!m) return null
  const [, accSym = '', letter = '', octMarks = ''] = m
  const upper = letter === letter.toUpperCase()
  const semitone = SEMITONE[letter.toUpperCase()] ?? 0
  const octaveBase = upper ? 60 : 72
  let octShift = 0
  for (const c of octMarks) octShift += c === "'" ? 12 : -12
  let alter = 0
  if (accSym === '^') alter = 1
  else if (accSym === '_') alter = -1
  else alter = acc[letter.toUpperCase()] ?? 0
  return octaveBase + semitone + octShift + alter
}

/** 解析 ABC 文本 → 多声部音符序列。解析失败(无音符)返回 null。 */
export function parseAbc(abcText: string): AbcParseResult | null {
  const lines = abcText.split(/\r?\n/)
  const headers: Record<string, string> = {}
  const music: string[] = []
  for (const line of lines) {
    const h = line.match(/^([A-Za-z]):\s*(.*)$/)
    if (h) {
      // V: 是声部切换标记,不是头字段 —— 保留到音乐流
      if (h[1] === 'V') {
        music.push(line.trim())
      } else if (h[1] === 'K' || h[1] === 'M' || h[1] === 'L' || h[1] === 'T') {
        headers[h[1]] = (h[2] ?? '').trim()
      }
      continue
    }
    if (line.trim() !== '' && !line.startsWith('%')) music.push(line.trim())
  }
  const m = (headers.M ?? '4/4').match(/(\d+)\/(\d+)/)
  const bpi = Number(m?.[1] ?? 4)
  const mDen = m ? Number(m[2]) : 4
  const lMatch = (headers.L ?? '1/8').match(/(\d+)\/(\d+)/)
  const lBeats = lMatch ? (Number(lMatch[1]) * mDen) / Number(lMatch[2]) : 0.5
  const acc = keyAccidentals(headers.K ?? 'C')

  interface VoiceState {
    notes: SongNote[]
    repeatInner: SongNote[] | null
    repeatStart: number
    repeatOffset: number
  }
  const voices: VoiceState[] = [{ notes: [], repeatInner: null, repeatStart: 0, repeatOffset: 0 }]
  let cur = 0

  for (const line of music) {
    const vMatch = line.match(/^V:\s*(\d+)/i)
    if (vMatch) {
      const idx = Number(vMatch[1]) - 1
      while (voices.length <= idx) {
        voices.push({ notes: [], repeatInner: null, repeatStart: 0, repeatOffset: 0 })
      }
      cur = idx
      continue
    }
    const tokens = line.match(/(?:\[[^\]\s]+\]|\|[1-2]|:\||\||[^|\s]+)/g) ?? []
    const v = voices[cur] ?? voices[0]!
    for (const tok of tokens) {
      if (tok === '|' || tok.startsWith('|1') || tok.startsWith('|2')) continue
      if (tok === ':|') {
        if (v.repeatInner !== null) {
          const len = beatOf(v) - v.repeatStart
          for (const n of v.repeatInner) {
            v.notes.push({ ...n, beat: n.beat + len })
          }
          v.repeatInner = null
        }
        continue
      }
      if (tok === '|:') {
        v.repeatInner = []
        v.repeatStart = beatOf(v)
        continue
      }
      // 和弦 [...] 取音高最低的音(适配每拍单音)
      let core: string
      const chord = tok.match(/^\[([^\]\s]+)\]/)
      if (chord) {
        const sorted = chord[1].split(/\s+/).sort(
          (a, b) => (abcTokenToMidi(a, acc) ?? 999) - (abcTokenToMidi(b, acc) ?? 999),
        )
        core = sorted[0] ?? ''
      } else {
        core = tok.replace(/[~()]/g, '')
      }
      const noteMatch = core.match(/^([_^=]?)([A-Ga-g])([',]*)(\d*)(\/\d*)?/)
      if (!noteMatch) continue
      const [, , , , num = '', den = ''] = noteMatch
      const mult = (num ? Number(num) : 1) / (den ? Number(den.replace('/', '')) : 1) || 1
      const durBeats = mult * lBeats
      const midi = abcTokenToMidi(core, acc) ?? 0
      const entry: SongNote = { note: midi, beat: beatOf(v), duration: Math.max(durBeats, 0.001) }
      if (v.repeatInner !== null) v.repeatInner.push(entry)
      v.notes.push(entry)
    }
  }

  const flat = voices.flatMap((v) => v.notes)
  if (flat.length === 0) return null
  return { title: headers.T ?? '导入曲目', bpi, voices: voices.map((v) => v.notes) }
}

/** 当前声部已累计的拍数(最后音符的结束拍)。 */
function beatOf(v: { notes: SongNote[] }): number {
  const last = v.notes[v.notes.length - 1]
  return last === undefined ? 0 : last.beat + (last.duration ?? 1)
}

/**
 * ABC → 可保存的 Song(每个声部一个钢琴 part,自动整体移调到可演奏范围)。
 * 移调失败(音域太宽)或解析失败返回 null。
 */
export function abcToSong(abcText: string): Song | null {
  const parsed = parseAbc(abcText)
  if (parsed === null) return null

  const allNotes = parsed.voices.flat()
  const lo = Math.min(...allNotes.map((n) => n.note))
  const hi = Math.max(...allNotes.map((n) => n.note))
  if (hi - lo > PLAYABLE_HIGH - PLAYABLE_LOW) return null // 音域过宽

  // 整体移调(所有声部同一 shift,保持相对关系)
  let shift = 0
  for (let s = PLAYABLE_LOW - lo; s <= PLAYABLE_HIGH - hi; s += 1) {
    shift = s
    break
  }
  if (lo + shift < PLAYABLE_LOW || hi + shift > PLAYABLE_HIGH) return null

  const parts = parsed.voices.map((notes, i) => ({
    id: i === 0 ? 'melody' : `part${i + 1}`,
    name: i === 0 ? '旋律' : `声部 ${i + 1}`,
    instrument: 'piano' as const,
    notes: notes.map((n) => ({ ...n, note: n.note + shift })),
  }))
  return {
    id: `abc-${Date.now().toString(36)}`,
    title: parsed.title,
    bpm: 90,
    bpi: parsed.bpi,
    parts,
  }
}
