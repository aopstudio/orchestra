/**
 * MixerPanel — 声部音量混音(Phase 1 v1 范围)。
 *
 * 三个声部(鼓/贝斯/键盘)各自一个音量滑块,作用于本地混音总线
 * (instruments.ts 里的 per-instrument GainNode),只影响自己的听感。
 */

import type { InstrumentId } from '@orchestra/shared'

const INSTRUMENTS: ReadonlyArray<{ id: InstrumentId; label: string }> = [
  { id: 'drums', label: '鼓' },
  { id: 'bass', label: '贝斯' },
  { id: 'piano', label: '键盘' },
  { id: 'trumpet', label: '小号' },
  { id: 'violin', label: '提琴' },
]

export interface MixerPanelProps {
  /** 每乐器音量 0..1。 */
  volumes: Record<InstrumentId, number>
  onChange: (instrument: InstrumentId, volume: number) => void
}

export default function MixerPanel({ volumes, onChange }: MixerPanelProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">混音台 · 声部音量</h2>
      <div className="mixer">
        {INSTRUMENTS.map(({ id, label }) => {
          const pct = Math.round((volumes[id] ?? 1) * 100)
          return (
            <label className="mixer-row" key={id}>
              <span className="mixer-label">{label}</span>
              <input
                type="range"
                className="mixer-slider"
                data-testid={`mixer-${id}`}
                min={0}
                max={100}
                value={pct}
                onChange={(e) => onChange(id, Number(e.target.value) / 100)}
                aria-label={`${label} volume`}
              />
              <span className="mixer-value">{pct}%</span>
            </label>
          )
        })}
      </div>
      <p className="tempo-hint">只影响你自己的听感——把太响的声部调小,其他房间成员不受影响。</p>
    </section>
  )
}
