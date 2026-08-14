/**
 * NTP 式时钟偏移估计(Phase 0 同步原型)
 *
 * 时钟模型(与 shared/src/protocol.ts 一致):
 * - 一次完整同步交换产生四个时间戳:
 *   t1: 客户端发送时刻(客户端时钟)
 *   t2: 服务器接收时刻(服务器时钟)
 *   t3: 服务器回复时刻(服务器时钟)
 *   t4: 客户端接收时刻(客户端时钟)
 * - offset = server - client:正值表示服务器时钟领先客户端。
 * - 采用低延迟样本多次采样取平均,剔除高 RTT 样本,抵消网络抖动。
 */

/** 单次交换的四个时间戳(单位: ms) */
export interface SyncSample {
  t1: number
  t2: number
  t3: number
  t4: number
}

/** 对一次交换估计出的时钟偏移与往返延迟(单位: ms) */
export interface OffsetEstimate {
  offset: number
  delay: number
}

/**
 * NTP 偏移公式: offset = ((t2 - t1) + (t3 - t4)) / 2。
 * 往返延迟项 (t3 - t4) 与 (t2 - t1) 符号相反,对称 RTT 下完全抵消,
 * 非对称 RTT 下误差仅为双向延迟差的一半。
 */
export function computeOffset(t1: number, t2: number, t3: number, t4: number): number {
  return (t2 - t1 + (t3 - t4)) / 2
}

/** 往返延迟: delay = (t4 - t1) - (t3 - t2) */
export function computeDelay(t1: number, t2: number, t3: number, t4: number): number {
  return t4 - t1 - (t3 - t2)
}

/** 仅保留严格小于阈值的样本(高延迟样本不可信,直接丢弃) */
export function filterSamples(samples: number[], thresholdMs: number): number[] {
  return samples.filter((s) => s < thresholdMs)
}

/** 非空数组的均值 */
export function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * 运行 N 次同步交换并估计时钟偏移。
 *
 * 每次交换计算 offset + delay;丢弃 delay >= maxDelayMs 的样本;
 * 对剩余样本的 offset 取平均。全部被丢弃时抛出错误。
 */
export async function estimateOffset(
  sendSync: () => Promise<SyncSample>,
  opts?: { samples?: number; maxDelayMs?: number },
): Promise<OffsetEstimate> {
  const samples = opts?.samples ?? 5
  const maxDelayMs = opts?.maxDelayMs ?? 50

  const offsets: number[] = []
  const delays: number[] = []

  for (let i = 0; i < samples; i++) {
    const { t1, t2, t3, t4 } = await sendSync()
    const delay = computeDelay(t1, t2, t3, t4)
    if (delay < maxDelayMs) {
      offsets.push(computeOffset(t1, t2, t3, t4))
      delays.push(delay)
    }
  }

  if (offsets.length === 0) {
    throw new Error('no valid sync samples')
  }

  return { offset: average(offsets), delay: average(delays) }
}
