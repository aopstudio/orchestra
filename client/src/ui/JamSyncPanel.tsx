/**
 * JamSyncPanel — 自由合奏同步起奏(异地玩家一起开演)。
 *
 * 发起方设置「预备小节数」与「小节开始/弱起」,点击同步开始后,服务器广播
 * 统一的起奏目标拍,所有玩家屏幕同步显示节拍倒计时,到点一起演奏。
 * 用于自由合奏(未武装歌曲声部)时的统一起奏。
 */

import type { ConnState } from './StatusPanel'

export interface JamCountdown {
  untilBeat: number
  bpi: number
  pickup: boolean
}

export interface JamSyncPanelProps {
  connState: ConnState
  /** 预备小节数(1-4)。 */
  bars: number
  onBarsChange: (bars: number) => void
  /** 弱起开关。 */
  pickup: boolean
  onPickupChange: (pickup: boolean) => void
  /** 发起同步起奏。 */
  onStart: () => void
  /** 服务器广播的起奏目标(收到后所有玩家进入倒计时)。 */
  countdown: JamCountdown | null
  /** 剩余拍数(屏上倒计时读数)。 */
  beatsLeft: number | null
  /** 已进入合奏(倒计时结束)。 */
  active: boolean
}

export default function JamSyncPanel({
  connState,
  bars,
  onBarsChange,
  pickup,
  onPickupChange,
  onStart,
  countdown,
  beatsLeft,
  active,
}: JamSyncPanelProps) {
  const connected = connState === 'connected'

  return (
    <section className="panel">
      <h2 className="panel-title">自由合奏 · 同步起奏</h2>

      <div className="jam-controls">
        <div className="jam-row">
          <span className="field-label">预备小节</span>
          <div className="tsig-pills" role="group" aria-label="Lead-in bars">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={bars === n ? 'tsig-pill tsig-pill-active' : 'tsig-pill'}
                data-testid={`jam-bars-${n}`}
                disabled={!connected}
                aria-pressed={bars === n}
                onClick={() => onBarsChange(n)}
              >
                {n} 小节
              </button>
            ))}
          </div>
        </div>

        <div className="jam-row">
          <span className="field-label">起始方式</span>
          <div className="tsig-pills" role="group" aria-label="Start style">
            <button
              type="button"
              className={!pickup ? 'tsig-pill tsig-pill-active' : 'tsig-pill'}
              data-testid="jam-downbeat"
              disabled={!connected}
              aria-pressed={!pickup}
              onClick={() => onPickupChange(false)}
            >
              小节开始(强拍)
            </button>
            <button
              type="button"
              className={pickup ? 'tsig-pill tsig-pill-active' : 'tsig-pill'}
              data-testid="jam-pickup"
              disabled={!connected}
              aria-pressed={pickup}
              onClick={() => onPickupChange(true)}
            >
              弱起(边界前一拍)
            </button>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          data-testid="jam-start-btn"
          disabled={!connected}
          onClick={onStart}
        >
          ▶ 同步开始合奏
        </button>
        <p className="tempo-hint">
          全房间在预备小节后统一起奏;弱起则从上一小节末拍(弱拍)起,下一拍即强拍。
        </p>
      </div>

      {countdown !== null && (
        <div className="jam-countdown" data-testid="jam-countdown">
          <span className="jam-countdown-label">
            {countdown.pickup ? '弱起' : '小节开始'}
            · 节拍倒计时
          </span>
          <span className="jam-countdown-value" data-testid="jam-beats-left">
            {beatsLeft === null ? '…' : beatsLeft}
          </span>
          <span className="jam-countdown-sub">拍 · 所有人同步</span>
        </div>
      )}
      {active && (
        <div className="jam-go" data-testid="jam-go">
          <span className="jam-go-dot" />
          演奏中 —— 已同步起奏
        </div>
      )}
    </section>
  )
}
