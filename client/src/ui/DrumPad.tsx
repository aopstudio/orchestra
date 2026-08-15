/**
 * DrumPad — 虚拟乐器高亮模式下的鼓面板(Phase 1)。
 *
 * 鼓声部的音符是 GM 鼓件(35–51),大多落在钢琴琴键(48–84)之外,无法在
 * JamPad 上高亮。DrumPad 把该声部用到的鼓件渲染成独立"鼓垫",每个鼓垫:
 * - 显示鼓件中文名 + 电脑键位(DRUM_KEYMAP 反查,按 A 即敲底鼓)
 * - guideCurrent → 琥珀色脉冲(现在该敲)
 * - guideUpcoming → 淡琥珀描边(即将要敲)
 * - remote → 其他玩家正在敲的紫色高亮
 * - 鼠标/触摸点击 = one-shot 敲击
 *
 * 鼓件名与鼓的简谱流动谱共用同一套中文短名(DRUM_LABELS),两处提示完全一致。
 */

import type { SongNote } from '../songs/songs'
import { DRUM_KEYMAP } from '../input/keyboard'
import { drumLabel } from '../input/drumNames'

/** DRUM_KEYMAP 反查: 鼓件音符 → 键位字母。 */
const DRUM_KEY_TO_NOTE: Record<string, number> = DRUM_KEYMAP
const NOTE_TO_DRUM_KEY: Record<number, string> = {}
for (const [key, note] of Object.entries(DRUM_KEY_TO_NOTE)) {
  NOTE_TO_DRUM_KEY[note] = key.toUpperCase()
}

export interface DrumPadProps {
  /** 该声部的音符序列 —— 决定渲染哪些鼓垫(按出现顺序)。 */
  notes: SongNote[]
  /** 引导当前窗口(琥珀脉冲)。 */
  guideCurrent: ReadonlySet<number>
  /** 引导前瞻窗口(淡琥珀描边)。 */
  guideUpcoming: ReadonlySet<number>
  /** 本地正在按下的鼓垫(点击高亮)。 */
  downNotes: ReadonlySet<number>
  /** 其他玩家正在敲的鼓垫(紫色)。 */
  remoteNotes: ReadonlySet<number>
  enabled: boolean
  /** 敲击一个鼓垫(one-shot)。 */
  onHit: (note: number) => void
}

export default function DrumPad({
  notes,
  guideCurrent,
  guideUpcoming,
  downNotes,
  remoteNotes,
  enabled,
  onHit,
}: DrumPadProps) {
  // 该声部用到的鼓件,按首次出现顺序去重
  const seen = new Set<number>()
  const drumNotes = notes.filter((n) => {
    if (seen.has(n.note)) return false
    seen.add(n.note)
    return true
  })

  return (
    <div className="drumpad" data-testid="drumpad">
      {drumNotes.map((n) => {
        const note = n.note
        const cls = ['drum-pad']
        if (downNotes.has(note)) cls.push('pressed')
        if (remoteNotes.has(note)) cls.push('remote')
        if (guideCurrent.has(note)) cls.push('guide-now')
        else if (guideUpcoming.has(note)) cls.push('guide-next')
        const key = NOTE_TO_DRUM_KEY[note]
        return (
          <button
            type="button"
            key={note}
            className={cls.join(' ')}
            data-testid={`drum-${note}`}
            disabled={!enabled}
            onPointerDown={(e) => {
              e.preventDefault()
              if (enabled) onHit(note)
            }}
          >
            <span className="drum-pad-key">{key ?? ''}</span>
            <span className="drum-pad-name">{drumLabel(note) ?? `GM ${note}`}</span>
          </button>
        )
      })}
    </div>
  )
}
