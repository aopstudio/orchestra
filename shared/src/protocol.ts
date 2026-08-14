/**
 * WebSocket 协议类型
 *
 * 时钟模型:
 * - serverTime: 服务器上的单调毫秒时钟(基于 performance.now())
 * - offset = server - client:NTP 式同步测得
 * - 音符事件一律由服务器打时间戳(serverTime)后广播
 */

/**
 * 乐器标识。音符事件携带它,让远端按发送者的乐器回放声音:
 * - piano:   采样钢琴 / 振荡器三角波
 * - bass:    采样电贝斯 / 振荡器锯齿波+低通
 * - drums:   TR-808 采样(GM 鼓图 35–51) / 合成鼓
 * - trumpet: 采样小号 / 振荡器方波+包络(铜管编制)
 * - violin:  采样小提琴 / 振荡器锯齿波+颤音(弦乐编制)
 */
export type InstrumentId = 'piano' | 'bass' | 'drums' | 'trumpet' | 'violin'

/** 客户端 → 服务器 */
export type ClientMsg =
  | { type: 'createRoom'; name: string }
  | { type: 'join'; name: string; roomCode: string }
  | { type: 'note'; note: number; velocity: number; instrument: InstrumentId }
  | { type: 'noteOff'; note: number }
  | { type: 'setTempo'; bpm: number }
  | { type: 'setBpi'; bpi: number }
  | { type: 'sync'; t1: number }

/** 服务器 → 客户端 */
export type ServerMsg =
  | { type: 'welcome'; id: string; name: string; roomCode: string; bpm: number; bpi: number }
  | { type: 'roomError'; message: string }
  | { type: 'peerJoined'; id: string; name: string }
  | { type: 'peerLeft'; id: string }
  | { type: 'clock'; beat: number; tempo: number; bpi: number; serverTime: number }
  | { type: 'tempo'; bpm: number; serverTime: number }
  | { type: 'bpi'; bpi: number; serverTime: number }
  | {
      type: 'note'
      from: string
      note: number
      velocity: number
      instrument: InstrumentId
      serverTime: number
    }
  | { type: 'noteOff'; from: string; note: number; serverTime: number }
  | { type: 'syncAck'; t1: number; t2: number; t3: number }

/** 服务器房间配置 */
export interface RoomConfig {
  bpm: number
  bpi: number
}
