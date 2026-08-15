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
  /** 进入房间后修改自己的玩家名称(全房间同步)。 */
  | { type: 'setName'; name: string }
  | { type: 'note'; note: number; velocity: number; instrument: InstrumentId }
  | { type: 'noteOff'; note: number }
  | { type: 'setTempo'; bpm: number }
  | { type: 'setBpi'; bpi: number }
  | { type: 'startSong' }
  | { type: 'startJam'; bars: number; pickup: boolean }
  /** 房主(或唯一在线用户)选定房间曲目;null = 取消选曲。 */
  | { type: 'selectSong'; songId: string | null }
  /**
   * 认领/取消认领房间曲目的某个声部(房间级编排,同一声部只能一人选)。
   * partId=null 表示取消自己的认领。歌曲必须等于房主选定的歌曲。
   */
  | { type: 'selectPart'; songId: string; partId: string | null }
  /** 准备/取消准备(所有在线玩家都准备后,由房主统一开始倒计时)。 */
  | { type: 'setReady'; ready: boolean }
  | { type: 'sync'; t1: number }

/** 服务器 → 客户端 */
export type ServerMsg =
  | {
      type: 'welcome'
      id: string
      name: string
      roomCode: string
      bpm: number
      bpi: number
      /** 房主(房间创建者)的玩家 id —— 选曲/开始的权限归属。 */
      ownerId: string
    }
  | { type: 'roomError'; message: string }
  | { type: 'peerJoined'; id: string; name: string }
  | { type: 'playerRenamed'; id: string; name: string }
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
  | {
      /** 房间同步开始: 全房间在 beat 这一小节边界开始各自的武装声部。 */
      type: 'songStart'
      beat: number
      bpi: number
    }
  | {
      /**
       * 自由合奏同步起奏: 全房间在 startBeat 一起开始演奏。
       * pickup=false → startBeat 是小节边界(强拍起);
       * pickup=true  → startBeat 是边界前一拍(弱起,上一小节末拍起)。
       */
      type: 'jamStart'
      startBeat: number
      bpi: number
      pickup: boolean
    }
  | {
      /** 房主选定/取消房间曲目 —— 全房间同步高亮曲库。 */
      type: 'songSelected'
      songId: string | null
    }
  | {
      /**
       * 房间合奏编排状态(房主/歌曲/声部认领/在线成员准备)。
       * 每次变化广播给全房间,新成员加入时也会收到一次。
       */
      type: 'ensembleState'
      songId: string | null
      bpi: number
      ownerId: string
      parts: Array<{
        partId: string
        playerId: string
        playerName: string
        ready: boolean
      }>
      members: Array<{ playerId: string; playerName: string; ready: boolean }>
    }
  | { type: 'partError'; message: string }

/** 服务器房间配置 */
export interface RoomConfig {
  bpm: number
  bpi: number
}
