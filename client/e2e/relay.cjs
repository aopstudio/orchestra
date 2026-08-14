/**
 * 网络延迟模拟中继(E2E): 在客户端与真实 ws 服务器之间插入固定延迟,
 * 模拟跨城网络(如单程 60ms)。用于验证「事件架构对 RTT 不敏感、
 * 时钟同步在跨城延迟下依然成立」这一核心论断。
 *
 * 用法: PORT=8082 TARGET=ws://localhost:8081 DELAY_MS=60 node relay.cjs
 * 所有经过的 ws 消息(双向)延迟 DELAY_MS 毫秒后转发。
 *
 * 注意: upstream 建连前到达的客户端消息必须缓冲(ws 对无监听器的
 * 'message' 事件不会缓存,直接丢失)。
 */
const { WebSocketServer } = require('ws')
const WebSocket = require('ws')

const PORT = Number(process.env.PORT ?? 8082)
const TARGET = process.env.TARGET ?? 'ws://localhost:8081'
const DELAY_MS = Number(process.env.DELAY_MS ?? 60)

const wss = new WebSocketServer({ port: PORT })

function forward(from, to, data, isBinary) {
  setTimeout(() => {
    if (to.readyState === WebSocket.OPEN) {
      to.send(data, { binary: isBinary })
    }
  }, DELAY_MS)
}

wss.on('connection', (client) => {
  let server = null
  /** upstream 建连前到达的客户端消息缓冲。 */
  const pending = []

  client.on('message', (data, isBinary) => {
    if (server !== null && server.readyState === WebSocket.OPEN) {
      forward(client, server, data, isBinary)
    } else {
      pending.push({ data, isBinary })
    }
  })
  client.on('error', () => server?.close())
  client.on('close', () => server?.close())

  server = new WebSocket(TARGET)
  server.on('open', () => {
    // 回放缓冲中的客户端消息
    for (const m of pending) {
      forward(client, server, m.data, m.isBinary)
    }
    pending.length = 0
    // 服务器 → 客户端方向
    server.on('message', (data, isBinary) => {
      forward(server, client, data, isBinary)
    })
  })
  server.on('error', () => client.close())
  server.on('close', () => client.close())
})

console.log(`relay proxy listening on ws://localhost:${PORT} → ${TARGET} (delay ${DELAY_MS}ms)`)
