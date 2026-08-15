/**
 * PerformanceCountdown — 演奏区(键盘上方)的同步起奏节拍倒计时。
 *
 * 演奏者的视线在键盘上,左侧控制面板的倒计时容易被忽略;这个组件把
 * 「还剩几拍、到 0 一起开始」用大号数字悬浮在键盘正上方,余光即见。
 * 覆盖两种起奏:
 * - 自由合奏同步起奏(server 广播 jamStart 的起奏目标拍);
 * - 歌曲合奏(武装声部后的预备小节倒计时)。
 * 倒计时归零瞬间闪现 GO!(自由合奏)或「开始!」(歌曲)——都靠可靠的
 * 「已开始」信号触发: 自由合奏看 jamActive,歌曲等第一个歌曲拍出现。
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
  /** 歌曲已推进到的拍位(null = 歌曲尚未开始)——用于判定歌曲真的开演了。 */
  songBeat: number | null
}

type FlashKind = 'jam' | 'song'

export default function PerformanceCountdown({
  jamCountdown,
  jamBeatsLeft,
  jamActive,
  countdownBeatsLeft,
  songBeat,
}: PerformanceCountdownProps) {
  const [flash, setFlash] = useState<FlashKind | null>(null)
  const flashTimerRef = useRef<number | null>(null)
  const wasCountingRef = useRef(false)
  const pendingSongFlashRef = useRef(false)

  const flashNow = (kind: FlashKind): void => {
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
    setFlash(kind)
    flashTimerRef.current = window.setTimeout(() => {
      setFlash(null)
      flashTimerRef.current = null
    }, 1500)
  }

  // 倒计时归零瞬间: 自由合奏立即闪 GO!;歌曲等第一个歌曲拍(约半拍后)闪「开始!」。
  useEffect(() => {
    const nowCounting = jamCountdown !== null || (countdownBeatsLeft ?? 0) > 0
    const wasCounting = wasCountingRef.current
    wasCountingRef.current = nowCounting
    if (wasCounting && !nowCounting) {
      if (jamActive) {
        flashNow('jam')
      } else {
        pendingSongFlashRef.current = true
      }
    }
  }, [jamCountdown, countdownBeatsLeft, jamActive])

  useEffect(() => {
    if (pendingSongFlashRef.current && songBeat !== null && jamCountdown === null) {
      pendingSongFlashRef.current = false
      flashNow('song')
    }
  }, [songBeat, jamCountdown])

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
    },
    [],
  )

  if (flash !== null) {
    return (
      <div className="perf-countdown perf-go" data-testid="perf-countdown-go">
        <span className="perf-countdown-label">同步起奏</span>
        <span className="perf-countdown-value">{flash === 'jam' ? 'GO!' : '开始!'}</span>
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
