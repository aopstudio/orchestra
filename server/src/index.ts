import { randomUUID } from 'node:crypto'
import { WebSocketServer, type RawData } from 'ws'
import type { ClientMsg, ServerMsg } from '@orchestra/shared'
import { createRoomManager, type RoomEntry } from './roomManager'
import type { RoomMember } from './room'

const PORT = Number(process.env.PORT ?? 8080)

// 服务器权威时钟:单调毫秒(协议约定基于 performance.now)
const manager = createRoomManager(() => performance.now())

/** 成员 id → 所在房间;未加入房间的成员不在表中 */
const memberRooms = new Map<string, RoomEntry>()

const wss = new WebSocketServer({ port: PORT })

/** 解析客户端消息缓冲;解析失败返回 null(记录日志,不中断连接) */
function parseClientMsg(raw: RawData): ClientMsg | null {
  let msg: ClientMsg
  try {
    msg = JSON.parse(raw.toString())
  } catch (err) {
    console.error('dropping unparseable message:', err)
    return null
  }
  return msg
}

wss.on('connection', (ws) => {
  const member: RoomMember = {
    id: randomUUID(),
    name: '',
    send: (msg: ServerMsg) => ws.send(JSON.stringify(msg)),
  }
  let joined = false

  ws.on('message', (raw) => {
    const msg = parseClientMsg(raw)
    if (!msg) return

    if (msg.type === 'createRoom') {
      if (joined) return
      member.name = msg.name
      const entry = manager.createRoom(member)
      memberRooms.set(member.id, entry)
      joined = true
      return
    }

    if (msg.type === 'join') {
      if (joined) return
      member.name = msg.name
      const entry = manager.joinRoom(msg.roomCode, member)
      if (entry === null) {
        member.send({
          type: 'roomError',
          message: `房间 ${msg.roomCode.trim().toUpperCase()} 不存在`,
        })
        return
      }
      memberRooms.set(member.id, entry)
      joined = true
      return
    }

    // 未加入任何房间前收到的 note/sync 等一律忽略
    if (!joined) return
    const entry = memberRooms.get(member.id)
    if (entry === undefined) return
    const { room } = entry

    if (msg.type === 'note') {
      room.note(member.id, msg.note, msg.velocity)
    } else if (msg.type === 'noteOff') {
      room.noteOff(member.id, msg.note)
    } else if (msg.type === 'setTempo') {
      room.setTempo(msg.bpm)
    } else if (msg.type === 'setBpi') {
      room.setBpi(msg.bpi)
    } else if (msg.type === 'sync') {
      room.sync(member.id, msg.t1)
    }
  })

  ws.on('close', () => {
    const entry = memberRooms.get(member.id)
    if (entry !== undefined) {
      entry.room.leave(member.id)
      memberRooms.delete(member.id)
    }
    console.log(`client disconnected: ${member.name} (${member.id})`)
  })

  console.log(`client connected: ${member.id}`)
})

// 每 500ms 向所有房间的成员广播权威节拍
setInterval(() => {
  manager.forEachRoom((entry) => entry.room.broadcastClock())
}, 500)

console.log(`orchestra server listening on ws://localhost:${PORT}`)

export { wss }
