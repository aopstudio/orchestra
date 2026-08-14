/**
 * 权威节拍时钟(纯逻辑,可注入时钟)
 *
 * 锚点模型(Ableton Link 式):
 * - 时钟状态由 (anchorTime, anchorBeat, bpm) 描述
 * - beatAt(t) = anchorBeat + (t - anchorTime) * (bpm / 60) / 1000
 * - setTempo 改变 bpm 时,把当前时刻作为新锚点,拍位置连续,不跳拍
 * - bpi(每小节拍数)只影响 intervalMs,不影响拍位置
 */

export interface BeatClock {
  /** 当前 bpm */
  bpm: number
  /** 每小节拍数(beats per interval) */
  bpi: number
  /** 一个 bar(bpi 拍)的毫秒数(随 bpm / bpi 变化) */
  intervalMs: number
  /** 服务器单调时钟(毫秒),委托给注入的 now */
  now(): number
  /** 将服务器时间换算为小数拍号 */
  beatAt(serverTime: number): number
  /** 调整速度;拍位置保持连续,从当前时刻起按新 bpm 推进 */
  setTempo(newBpm: number): void
  /** 调整每小节拍数;不影响拍位置,只改小节划分 */
  setBpi(newBpi: number): void
}

export function createBeatClock(bpm: number, bpi: number, now: () => number): BeatClock {
  let currentBpm = bpm
  let currentBpi = bpi
  let anchorTime = 0
  let anchorBeat = 0

  const beatAt = (serverTime: number): number =>
    anchorBeat + ((serverTime - anchorTime) * (currentBpm / 60)) / 1000

  return {
    get bpm() {
      return currentBpm
    },
    get bpi() {
      return currentBpi
    },
    get intervalMs() {
      return (currentBpi / (currentBpm / 60)) * 1000
    },
    now,
    beatAt,
    setTempo(newBpm: number) {
      if (!Number.isFinite(newBpm) || newBpm <= 0) return
      const t = now()
      anchorBeat = beatAt(t)
      anchorTime = t
      currentBpm = newBpm
    },
    setBpi(newBpi: number) {
      if (!Number.isInteger(newBpi) || newBpi < 1 || newBpi > 16) return
      const t = now()
      const current = beatAt(t)
      // 切拍号 = 新小节从现在开始:把下一拍锚定为新拍号的第 1 拍
      // (ceil 到 newBpi 的整数倍),与实体节拍器拨动后下一拍即重音一致。
      anchorBeat = Math.ceil(current / newBpi) * newBpi
      anchorTime = t
      currentBpi = newBpi
    },
  }
}
