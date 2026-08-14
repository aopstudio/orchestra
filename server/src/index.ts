import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import type { ClientMsg, ServerMsg } from '@orchestra/shared'
import { isValidSong } from '@orchestra/shared'
import { createRoomManager, type RoomEntry } from './roomManager'
import type { RoomMember } from './room'
import { createSongStore } from './songStore'
import { handleStatic } from './static'

const PORT = Number(process.env.PORT ?? 8080)
const HOST = process.env.HOST ?? '0.0.0.0'
// 生产环境提供证书路径即启用 WSS(wss://),否则为 ws://
const TLS_CERT = process.env.WSS_TLS_CERT
const TLS_KEY = process.env.WSS_TLS_KEY

// 服务器权威时钟:单调毫秒(协议约定基于 performance.now)
const manager = createRoomManager(() => performance.now())

/** 成员 id → 所在房间;未加入房间的成员不在表中 */
const memberRooms = new Map<string, RoomEntry>()

/** 曲目分享存储(Phase 3): POST /api/songs 存曲,GET /api/songs/:code 取曲。 */
const songStore = createSongStore()

/** HTTP 请求 → 静态托管(部署模式);WebSocket 升级请求由 ws 库接管。 */
function requestHandler(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (url.pathname === '/api/songs' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      if (body.length > 1_000_000) req.destroy() // 防滥用
    })
    req.on('end', () => {
      try {
        const parsed: unknown = JSON.parse(body)
        if (!isValidSong(parsed)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'invalid song' }))
          return
        }
        const code = songStore.add(parsed)
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ shareId: code }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'bad json' }))
      }
    })
    return
  }

  const match = url.pathname.match(/^\/api\/songs\/([A-Za-z0-9]+)$/)
  if (match !== null && req.method === 'GET') {
    const song = songStore.get(match[1] ?? '')
    if (song === null) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(song))
    return
  }

  // 评分(Phase 3): 点赞与查询
  const likeMatch = url.pathname.match(/^\/api\/songs\/([A-Za-z0-9]+)\/like$/)
  if (likeMatch !== null && req.method === 'POST') {
    const likes = songStore.like(likeMatch[1] ?? '')
    if (likes === null) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ likes }))
    return
  }
  const metaMatch = url.pathname.match(/^\/api\/songs\/([A-Za-z0-9]+)\/meta$/)
  if (metaMatch !== null && req.method === 'GET') {
    const likes = songStore.likesOf(metaMatch[1] ?? '')
    if (likes === null) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ likes }))
    return
  }

  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'unknown api' }))
    return
  }

  void handleStatic(req, res)
}

const tls = TLS_CERT !== undefined && TLS_KEY !== undefined
const httpServer = tls
  ? createHttpsServer(
      { cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) },
      requestHandler,
    )
  : createServer(requestHandler)

const wss = new WebSocketServer({ server: httpServer })

/** 心跳周期: 防 NAT/路由器静默断开连接,并清理死连接(触发空房回收)。
 *  每周期把 isAlive 置 false,下个周期仍未 pong 回来即 terminate,
 *  因此死连接的清理延迟为一个周期(30s)。 */
const HEARTBEAT_INTERVAL_MS = 30_000

/** ws 连接上附加的心跳标记。 */
type AliveSocket = WebSocket & { isAlive?: boolean }

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

wss.on('connection', (rawWs) => {
  const ws = rawWs as AliveSocket
  ws.isAlive = true
  ws.on('pong', () => {
    ws.isAlive = true
  })
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
      room.note(member.id, msg.note, msg.velocity, msg.instrument)
    } else if (msg.type === 'noteOff') {
      room.noteOff(member.id, msg.note)
    } else if (msg.type === 'setTempo') {
      room.setTempo(msg.bpm)
    } else if (msg.type === 'setBpi') {
      room.setBpi(msg.bpi)
    } else if (msg.type === 'startSong') {
      room.startSong()
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

// 心跳: 定期 ping,防 NAT 静默断连;超时未 pong 的连接 terminate,
// 触发 close → room.leave → 空房回收。间隔必须小于常见 NAT 空闲超时。
setInterval(() => {
  for (const rawWs of wss.clients) {
    const ws = rawWs as AliveSocket
    if (ws.isAlive === false) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, HEARTBEAT_INTERVAL_MS)


httpServer.listen(PORT, HOST, () => {
  console.log(`orchestra server listening on ${tls ? 'wss' : 'ws'}://${HOST}:${PORT}`)
})

export { wss }
