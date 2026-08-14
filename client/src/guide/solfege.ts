/**
 * 简谱转换(Phase 1 GuideTicker)
 *
 * 把 MIDI 音高转成简谱唱名数字(do re mi …),带八度升降点标记。
 * 纯函数,无 DOM 依赖,便于单元测试。
 *
 * 简谱约定:
 * - 7 个唱名: do=1 re=2 mi=3 fa=4 sol=5 la=6 si=7
 * - 高八度在数字上方加点 → 文本中用 `1'` 表示;低八度用 `1,` 表示
 * - C 大调固定唱名(内置曲目均为 C 大调):C→1, D→2, …, B→7
 */

/** pitch class(0..11)→ 七音尺度位置(0=do … 6=si)。黑键归到相邻白键。 */
const PC_TO_DEGREE: Readonly<Record<number, number>> = {
  0: 0, // C
  1: 0, // C#
  2: 1, // D
  3: 1, // D#
  4: 2, // E
  5: 3, // F
  6: 3, // F#
  7: 4, // G
  8: 4, // G#
  9: 5, // A
  10: 5, // A#
  11: 6, // B
}

/** MIDI 音高 → 简谱数字(1..7,1=do) */
export function midiToNumber(note: number): number {
  return (PC_TO_DEGREE[note % 12] ?? 0) + 1
}

/** MIDI 音高 → 相对 C4(60)的八度差(C4→0, C5→+1, C3→-1) */
export function octaveShift(note: number): number {
  return Math.floor(note / 12) - 5
}

/** MIDI 音高 → 简谱数字字符串(1..7) */
export function midiToSolfege(note: number): string {
  const degree = midiToNumber(note)
  return degree >= 1 && degree <= 7 ? String(degree) : '?'
}

/** MIDI 音高 → 带八度标记的简谱文本(C4→'1', C5→"1'", C3→'1,') */
export function midiToTickerLabel(note: number): string {
  const num = midiToSolfege(note)
  const shift = octaveShift(note)
  if (shift > 0) return `${num}${"'".repeat(shift)}`
  if (shift < 0) return `${num}${','.repeat(-shift)}`
  return num
}
