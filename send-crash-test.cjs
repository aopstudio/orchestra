const { WebSocketServer } = require('ws')
const WebSocket = require('ws')
const wss = new WebSocketServer({ port: 18096 })
// 不注册任何 error 监听器 —— 模拟当前服务器代码
wss.on('connection', (ws) => {
  console.log('[server] client connected')
  ws.on('message', () => {
    console.log('[server] got message, closing socket then sending to it...')
    ws.close()
    setTimeout(() => {
      console.log('[server] attempting send on closed socket (no error listener)...')
      ws.send(JSON.stringify({ type: 'welcome', id: 'x', roomCode: 'TEST', bpm: 120, bpi: 4 }))
      console.log('[server] send() returned without throwing (async error may follow)')
    }, 100)
  })
})
const client = new WebSocket('ws://127.0.0.1:18096')
client.on('open', () => client.send('join'))
client.on('message', () => {})
setTimeout(() => {
  const probe = new WebSocket('ws://127.0.0.1:18096')
  probe.on('open', () => { console.log('[probe] server STILL ALIVE'); process.exit(0) })
  probe.on('error', () => { console.log('[probe] server appears DEAD'); process.exit(1) })
  setTimeout(() => { console.log('[probe] timeout'); process.exit(2) }, 3000)
}, 3000)
