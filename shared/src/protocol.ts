/**
 * WebSocket 协议类型(Phase 0 同步验证原型)
 *
 * 时钟模型:
 * - serverTime: 服务器上的单调毫秒时钟(基于 performance.now())
 * - offset = server - client:NTP 式同步测得
 * - 音符事件一律由服务器打时间戳(serverTime)后广播
 */

/** 客户端 → 服务器 */
export type ClientMsg =
  | { type: 'createRoom'; name: string }
  | { type: 'join'; name: string; roomCode: string }
  | { type: 'note'; note: number; velocity: number }
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
  | { type: 'note'; from: string; note: number; velocity: number; serverTime: number }
  | { type: 'noteOff'; from: string; note: number; serverTime: number }
  | { type: 'syncAck'; t1: number; t2: number; t3: number }

/** 服务器房间配置 */
export interface RoomConfig {
  bpm: number
  bpi: number
}
