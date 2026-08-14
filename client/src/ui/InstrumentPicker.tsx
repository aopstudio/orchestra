/**
 * InstrumentPicker — 音色选择(自由合奏模式)。
 *
 * 自由合奏(未武装声部)时,玩家可主动选择自己演奏的音色(钢琴/贝斯/鼓/小号/
 * 提琴),决定本地发声与发送到房间的 instrument 字段(远端按同一音色回放)。
 * 武装声部后乐器由声部决定,选择器锁定并显示当前声部乐器。
 */

import type { InstrumentId } from '@orchestra/shared'

const INSTRUMENTS: ReadonlyArray<{ id: InstrumentId; label: string; hint: string }> = [
  { id: 'piano', label: '钢琴', hint: '明亮采样钢琴' },
  { id: 'bass', label: '贝斯', hint: '电贝斯 / 低音' },
  { id: 'drums', label: '鼓', hint: 'TR-808 采样 / GM 鼓件' },
  { id: 'trumpet', label: '小号', hint: '铜管号角' },
  { id: 'violin', label: '提琴', hint: '弦乐' },
]

export interface InstrumentPickerProps {
  /** 当前生效的乐器(自由合奏时是选择值,武装后是声部乐器)。 */
  current: InstrumentId
  /** 武装声部后锁定(乐器由声部决定)。 */
  locked: boolean
  /** 锁定时显示的声部名。 */
  lockedLabel?: string
  /** 是否已连接(未连接时不可选)。 */
  enabled: boolean
  onChange: (instrument: InstrumentId) => void
}

export default function InstrumentPicker({
  current,
  locked,
  lockedLabel,
  enabled,
  onChange,
}: InstrumentPickerProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">音色 · Instrument</h2>
      <div className="tsig-pills" role="radiogroup" aria-label="Instrument">
        {INSTRUMENTS.map(({ id, label, hint }) => {
          const active = current === id
          return (
            <button
              key={id}
              type="button"
              className={active ? 'tsig-pill tsig-pill-active instr-pill' : 'tsig-pill instr-pill'}
              data-testid={`instrument-${id}`}
              disabled={locked || !enabled}
              aria-pressed={active}
              title={hint}
              onClick={() => onChange(id)}
            >
              {label}
            </button>
          )
        })}
      </div>
      <p className="tempo-hint" data-testid="instrument-hint">
        {locked
          ? `已按声部锁定: ${lockedLabel ?? ''} —— 换声部即换音色`
          : '自由合奏时选择你演奏的音色;武装声部后跟随该声部的乐器'}
      </p>
    </section>
  )
}
