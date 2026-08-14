/**
 * 节拍网格(Phase 0 同步原型)
 *
 * 服务器是节拍时钟的权威(见 shared/src/protocol.ts):音符事件带 serverTime 广播,
 * 客户端把 serverTime 换算到本地 AudioContext 时钟,并用量子边界量化,
 * 保证所有客户端听到同一个 downbeat。
 */

export interface BeatGridDeps {
  /**
   * 时钟偏移 offset = server - client(ms)。
   * Phase 0 预留:调用方保证 serverNow 已在服务器时钟域,toAudioTime 不直接使用 offset;
   * 后续用于输出延迟补偿(localAudioTime = serverTime + offset + outputLatency)。
   */
  offset: number
  /** 返回 AudioContext.currentTime(秒) */
  ctxNow: () => number
  /** 返回当前服务器时钟读数(ms,已在服务器时钟域,由调用方基于 offset 构造) */
  serverNow: () => number
}

export interface BeatGrid {
  /** 把服务器时间戳换算成音频时钟上的秒数(未来 = 正值,过去 = 负值域) */
  toAudioTime(serverTime: number): number
  /** 把拍号量化到最近的量子边界(如 4 拍一小节的 downbeat) */
  quantize(beat: number, quantum: number): number
  /** 服务器时间 → 分数拍(相对当前会话节拍基准 0) */
  beatOfServerTime(serverTime: number): number
  /** 更新当前 BPM,影响 beatOfServerTime 的拍换算;非法值(非有限数或 ≤0)被忽略 */
  setTempo(bpm: number): void
}

export function createBeatGrid(deps: BeatGridDeps & { bpm: number; bpi: number }): BeatGrid {
  let currentBpm = deps.bpm
  // 每小节毫秒数: bpi 拍 / (bpm/60 拍每秒) * 1000
  const intervalMs = () => (deps.bpi / (currentBpm / 60)) * 1000

  return {
    toAudioTime(serverTime: number): number {
      return deps.ctxNow() + (serverTime - deps.serverNow()) / 1000
    },

    /**
     * 拍号 → 最近的量子边界:beat 距所在边界超过半拍则进位到下一边界。
     * 契约示例:quantize(4.3, 4) = 4,quantize(4.6, 4) = 8,quantize(8.0, 4) = 8。
     */
    quantize(beat: number, quantum: number): number {
      const boundary = Math.floor(beat / quantum)
      const frac = beat - boundary * quantum
      return frac >= 0.5 ? (boundary + 1) * quantum : boundary * quantum
    },

    beatOfServerTime(serverTime: number): number {
      return (serverTime / intervalMs()) * deps.bpi
    },

    setTempo(bpm: number): void {
      if (!Number.isFinite(bpm) || bpm <= 0) return
      currentBpm = bpm
    },
  }
}
