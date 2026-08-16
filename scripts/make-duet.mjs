#!/usr/bin/env node
/**
 * MusicXML 单旋律 → 双声部 ABC(旋律 + 自动分解和弦伴奏)
 *
 * 用途: 从 abcnotation.com 下载权威单旋律 MusicXML,自动生成"旋律+伴奏"
 * 双声部 ABC 文件,可直接用界面的「导入 ABC 曲谱」导入。
 *
 * 伴奏启发式: 每个小节取该小节最低音作为根音,生成三和弦分解
 * (根音-三音-五音-三音),覆盖整个小节。
 *
 * 用法: node scripts/make-duet.mjs 输入.xml 输出.abc [标题]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseMusicXml } from './abc-to-song.mjs'

const [, , inXml, outAbc, title] = process.argv
if (!inXml || !outAbc) {
  console.error('用法: node scripts/make-duet.mjs 输入.xml 输出.abc [标题]')
  process.exit(1)
}

const { bpi, notes } = parseMusicXml(readFileSync(inXml, 'utf8'))
const name = title ?? 'Duet'

// MIDI → ABC 音名(约定: 大写 C-B = octave4, 小写 = octave5, ' 高八度, , 低八度)
const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
function midiToAbc(midi) {
  const pc = midi % 12
  const oct = Math.floor(midi / 12) - 1
  let s = LETTERS[pc] ?? 'C'
  if (s.includes('#')) s = s.replace('#', '^')
  // oct 4 用大写, 5 用小写, 其他补 ' 或 ,
  if (oct === 4) return s.toUpperCase()
  if (oct === 5) return s.toLowerCase()
  if (oct > 5) return s.toLowerCase() + "'".repeat(oct - 5)
  return s.toUpperCase() + ','.repeat(4 - oct)
}

// 时值(拍) → ABC 后缀(相对 L:1/4; 1 拍=1, 2 拍=2, 0.5 拍=/2)
function beatToAbcDur(beats) {
  if (Math.abs(beats - 1) < 0.01) return ''
  if (Math.abs(beats - 2) < 0.01) return '2'
  if (Math.abs(beats - 0.5) < 0.01) return '/2'
  if (Math.abs(beats - 1.5) < 0.01) return '3/2'
  return beats.toString()
}

// 旋律声部
const melody = notes.map((n) => midiToAbc(n.note) + beatToAbcDur(n.duration)).join(' ')
// 按小节分组生成伴奏: 每小节根音 = 该小节最低音,三和弦分解(自然大三/小三近似: 用调内三度)
const beatPerBar = bpi
const bars = []
let cur = []
let barBeat = 0
for (const n of notes) {
  cur.push(n)
  barBeat += n.duration
  if (barBeat >= beatPerBar - 0.01) {
    bars.push(cur)
    cur = []
    barBeat = 0
  }
}
if (cur.length) bars.push(cur)

function triadNotes(root, barNotes) {
  // 根据小节内旋律音选择大小三和弦: 出现小三度(root+3)音 → 小三和弦,
  // 否则大三和弦(root+4)。更贴合调式色彩。
  const minor = barNotes.some((n) => n.note === root + 3)
  return minor ? [root, root + 3, root + 7] : [root, root + 4, root + 7]
}
const accomp = []
for (const bar of bars) {
  const root = Math.min(...bar.map((n) => n.note))
  const [r, t, f] = triadNotes(root, bar)
  // 4 拍小节 → 根音 三音 五音 三音; 3 拍 → 根音 三音 五音
  const arp = bpi === 3 ? [r, t, f] : [r, t, f, t]
  for (const note of arp) {
    const prev = accomp[accomp.length - 1]
    const beat = prev ? prev.beat + prev.duration : 0
    accomp.push({ note, beat, duration: 1 })
  }
}
const accompStr = accomp.map((n) => midiToAbc(n.note)).join(' ')

const abc = `X:1
T:${name}(旋律 + 分解伴奏)
M:${bpi}/4
L:1/4
K:C
V:1
${melody} |
V:2
${accompStr} |
`
writeFileSync(outAbc, abc)
console.log(`已生成 ${outAbc} (${bpi}/4, 旋律 ${notes.length} 音, 伴奏 ${accomp.length} 音)`)
