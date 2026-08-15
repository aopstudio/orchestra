/**
 * GM 鼓件(35–51)的中文短名 —— 流动谱/鼓垫的通用标签。
 *
 * 鼓声部没有音高,简谱数字对它没有意义;用击打乐器名代替。
 * 短名用于流动谱的窄格子(2 字以内),DrumPad 另有完整英文名(DRUM_NAMES)。
 */

/** GM 鼓件音符 → 中文短名。 */
export const DRUM_LABELS: Record<number, string> = {
  35: '底鼓',
  36: '底鼓',
  37: '边击',
  38: '军鼓',
  39: '拍手',
  40: '电军鼓',
  41: '低嗵',
  42: '踩镲',
  43: '低嗵',
  44: '踩镲',
  45: '中嗵',
  46: '开镲',
  47: '中嗵',
  48: '高嗵',
  49: '吊镲',
  50: '高嗵',
  51: '牛铃',
}

/** 返回鼓件的中文短名;非鼓件音符返回 null(调用方回退到简谱数字)。 */
export function drumLabel(note: number): string | null {
  return DRUM_LABELS[note] ?? null
}
