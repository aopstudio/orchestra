/**
 * TempoPanel — 速度与拍号控制(节拍器开关、BPM 滑块、拍号切换)。
 * 从 App.tsx 拆出的纯展示组件。
 */

export type ConnState = 'idle' | 'connecting' | 'connected'

const MIN_TEMPO_BPM = 40
const MAX_TEMPO_BPM = 240

/** 拍号预设: 分母只是显示,协议只传分子(bpi)。 */
const TIME_SIGNATURES: ReadonlyArray<{ bpi: number; label: string }> = [
  { bpi: 2, label: '2/4' },
  { bpi: 3, label: '3/4' },
  { bpi: 4, label: '4/4' },
  { bpi: 5, label: '5/4' },
  { bpi: 6, label: '6/8' },
  { bpi: 7, label: '7/8' },
]

export interface TempoPanelProps {
  connState: ConnState
  bpm: number
  onTempoChange: (bpm: number) => void
  bpi: number
  onBpiChange: (bpi: number) => void
  metronomeOn: boolean
  onMetronomeToggle: () => void
}

export default function TempoPanel({
  connState,
  bpm,
  onTempoChange,
  bpi,
  onBpiChange,
  metronomeOn,
  onMetronomeToggle,
}: TempoPanelProps) {
  const connected = connState === 'connected'
  const tempoFillPct = ((bpm - MIN_TEMPO_BPM) / (MAX_TEMPO_BPM - MIN_TEMPO_BPM)) * 100

  return (
    <section className="panel">
      <h2 className="panel-title">
        <span>Tempo · Meter</span>
        <button
          type="button"
          className={`metronome-toggle${metronomeOn ? ' metronome-toggle-on' : ''}`}
          data-testid="metronome-toggle"
          aria-pressed={metronomeOn}
          onClick={onMetronomeToggle}
        >
          <span className="metronome-toggle-dot" />
          Metronome {metronomeOn ? 'ON' : 'OFF'}
        </button>
      </h2>
      <div className={connected ? 'tempo-control' : 'tempo-control tempo-control-off'}>
        <div className="tempo-head">
          <span className="tempo-label">Room BPM</span>
          <span className="tempo-value" data-testid="tempo-value">
            {bpm}
          </span>
        </div>
        <input
          type="range"
          className="tempo-slider"
          data-testid="tempo-slider"
          min={MIN_TEMPO_BPM}
          max={MAX_TEMPO_BPM}
          step={1}
          value={bpm}
          disabled={!connected}
          onChange={(e) => onTempoChange(Number(e.target.value))}
          aria-label="Metronome tempo in beats per minute"
          style={{
            background: `linear-gradient(to right, var(--amber) ${tempoFillPct}%, var(--line) ${tempoFillPct}%)`,
          }}
        />
        <div className="tempo-range">
          <span>{MIN_TEMPO_BPM}</span>
          <span>{MAX_TEMPO_BPM}</span>
        </div>
        <p className="tempo-hint">
          Any player can change it — everyone in the room hears the new speed from the next beat.
        </p>
      </div>
      <div className={connected ? 'tsig-control' : 'tsig-control tsig-off'}>
        <div className="tsig-head">
          <span className="tsig-label">拍号 · Beats / Bar</span>
        </div>
        <div className="tsig-pills" role="group" aria-label="Time signature">
          {TIME_SIGNATURES.map(({ bpi: sigBpi, label }) => (
            <button
              key={sigBpi}
              type="button"
              className={bpi === sigBpi ? 'tsig-pill tsig-pill-active' : 'tsig-pill'}
              data-testid={`tsig-${sigBpi}`}
              disabled={!connected}
              aria-pressed={bpi === sigBpi}
              onClick={() => onBpiChange(sigBpi)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="tsig-hint">
          Any player can change it — everyone re-bars from the same beat position.
        </p>
      </div>
    </section>
  )
}
