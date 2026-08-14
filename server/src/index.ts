import { randomUUID } from 'node:crypto'
import { WebSocketServer, type RawData } from 'ws'
import type { ClientMsg, ServerMsg } from '@orchestra/shared'
import { createRoom, type RoomMember } from './room'

const PORT = Number(process.env.PORT ?? 8080)

// 服务器权威时钟:单调毫秒(协议约定基于 performance.now)
const room = createRoom(120, 4, () => performance.now())

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

    if (msg.type === 'join') {
      if (joined) return
      member.name = msg.name
      room.join(member)
      joined = true
      return
    }

    // 未 join 前收到的 note/sync 一律忽略
    if (!joined) return

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
    if (joined) room.leave(member.id)
    console.log(`client disconnected: ${member.name} (${member.id})`)
  })

  console.log(`client connected: ${member.id}`)
})

// 每 500ms 向所有成员广播权威节拍
setInterval(() => room.broadcastClock(), 500)

console.log(`orchestra server listening on ws://localhost:${PORT}`)

export { wss }
