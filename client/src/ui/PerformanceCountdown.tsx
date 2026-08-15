/**
 * PerformanceCountdown — 演奏区(键盘上方)的同步起奏节拍倒计时。
 *
 * 演奏者的视线在键盘上,左侧控制面板的倒计时容易被忽略;这个组件把
 * 「还剩几拍、到 0 一起开始」用大号数字悬浮在键盘正上方,余光即见。
 * 覆盖两种起奏:
 * - 自由合奏同步起奏(server 广播 jamStart 的起奏目标拍);
 * - 歌曲合奏(武装声部后的预备小节倒计时)。
 * 倒计时结束瞬间(仅自由合奏,有可靠的 jamActive 信号)闪现 GO!,随后消失。
 */

import { useEffect, useRef, useState } from 'react'
import type { JamCountdown } from './JamSyncPanel'

export interface PerformanceCountdownProps {
  /** 服务器广播的自由合奏起奏目标(null = 无倒计时)。 */
  jamCountdown: JamCountdown | null
  /** 剩余拍数(屏上倒计时读数,随时钟广播刷新)。 */
  jamBeatsLeft: number | null
  /** 已进入合奏(倒计时结束)。 */
  jamActive: boolean
  /** 歌曲预备小节剩余拍数(null = 无倒计时)。 */
  countdownBeatsLeft: number | null
}

export default function PerformanceCountdown({
  jamCountdown,
  jamBeatsLeft,
  jamActive,
  countdownBeatsLeft,
}: PerformanceCountdownProps) {
  // GO! 闪现: 自由合奏倒计时归零瞬间亮一下,提醒「现在开始」。
  const [goFlash, setGoFlash] = useState(false)
  const wasCountingRef = useRef(false)

  useEffect(() => {
    const nowCounting = jamCountdown !== null || (countdownBeatsLeft ?? 0) > 0
    const wasCounting = wasCountingRef.current
    wasCountingRef.current = nowCounting
    if (wasCounting && !nowCounting && jamActive) {
      setGoFlash(true)
      const t = setTimeout(() => setGoFlash(false), 1500)
      return () => clearTimeout(t)
    }
  }, [jamCountdown, countdownBeatsLeft, jamActive])

  if (goFlash) {
    return (
      <div className="perf-countdown perf-go" data-testid="perf-countdown-go">
        <span className="perf-countdown-label">同步起奏</span>
        <span className="perf-countdown-value">GO!</span>
      </div>
    )
  }

  if (jamCountdown !== null) {
    return (
      <div className="perf-countdown" data-testid="perf-countdown">
        <span className="perf-countdown-label">
          {jamCountdown.pickup ? '弱起 · 节拍倒计时' : '小节开始 · 节拍倒计时'}
        </span>
        <span className="perf-countdown-value" data-testid="perf-countdown-value">
          {jamBeatsLeft === null ? '…' : jamBeatsLeft}
        </span>
        <span className="perf-countdown-sub">所有人同步 · 到 0 一起演奏</span>
      </div>
    )
  }

  if (countdownBeatsLeft !== null && countdownBeatsLeft > 0) {
    return (
      <div className="perf-countdown" data-testid="perf-countdown">
        <span className="perf-countdown-label">歌曲准备 · 节拍倒计时</span>
        <span className="perf-countdown-value" data-testid="perf-countdown-value">
          {countdownBeatsLeft}
        </span>
        <span className="perf-countdown-sub">到 0 歌曲开始</span>
      </div>
    )
  }

  return null
}
