import { describe, expect, it, vi } from 'vitest'
import { WsClient, type WsHandlers } from './wsClient'

/** 假 WebSocket: 记录发送的消息,允许测试手动触发 open/message/close。 */
class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = FakeWebSocket.CONNECTING
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  constructor(public url: string) {}
  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }
  close(): void {
    this.readyState = FakeWebSocket.CLOSED
  }
  /** 测试辅助: 模拟连接打开。 */
  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }
  /** 测试辅助: 模拟服务器消息。 */
  message(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }
  /** 测试辅助: 模拟连接断开。 */
  disconnect(code = 1006): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code })
  }
}

/** 每个测试新建独立的假 WebSocket/定时器环境。 */
function setup() {
  const instances: FakeWebSocket[] = []
  let reconnectCb: (() => void) | null = null
  vi.stubGlobal(
    'WebSocket',
    class extends FakeWebSocket {
      constructor(url: string) {
        super(url)
        instances.push(this)
      }
    },
  )
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void) => {
      reconnectCb = fn
      return 1
    },
    clearTimeout: () => {},
  })
  return {
    instances,
    fireReconnect: () => {
      const cb = reconnectCb
      reconnectCb = null
      cb?.()
    },
  }
}

function makeHandlers(): { handlers: WsHandlers; welcomes: unknown[] } {
  const welcomes: unknown[] = []
  const handlers: WsHandlers = {
    onWelcome: (m) => welcomes.push(m),
    onRoomError: () => {},
    onPeerJoined: () => {},
    onPeerLeft: () => {},
    onClock: () => {},
    onNote: () => {},
    onNoteOff: () => {},
    onTempo: () => {},
    onBpi: () => {},
    onSyncAck: () => {},
    onSongStart: () => {},
    onJamStart: () => {},
    onEnsembleState: () => {},
    onSongSelected: () => {},
    onPartError: () => {},
  }
  return { handlers, welcomes }
}

describe('WsClient 断线重连', () => {
  it('创建房间后断线重连,凭原房间码重新加入而非新建房间', () => {
    const { instances, fireReconnect } = setup()
    const { handlers } = makeHandlers()
    const client = new WsClient('ws://x/ws', handlers)

    client.connect()
    client.createRoom('房主A')
    instances[0]!.open()
    expect(instances[0]!.sent).toEqual([{ type: 'createRoom', name: '房主A' }])

    // 服务器 welcome 下发房间码
    instances[0]!.message({
      type: 'welcome',
      id: 'id-1',
      name: '房主A',
      roomCode: 'ABC123',
      bpm: 120,
      bpi: 4,
    })

    // 断线 → 触发重连(定时器回调)
    instances[0]!.disconnect(1006)
    fireReconnect()
    const second = instances[1]!
    expect(second).toBeDefined()
    second.open()

    // 关键断言: 重连后发送的是 join 原房间,而不是 createRoom
    expect(second.sent).toEqual([{ type: 'join', name: '房主A', roomCode: 'ABC123' }])
  })

  it('凭码加入后断线重连,仍用原房间码重新加入', () => {
    const { instances, fireReconnect } = setup()
    const { handlers } = makeHandlers()
    const client = new WsClient('ws://x/ws', handlers)

    client.connect()
    client.joinRoom('DEF456', '朋友B')
    instances[0]!.open()
    expect(instances[0]!.sent).toEqual([{ type: 'join', name: '朋友B', roomCode: 'DEF456' }])

    instances[0]!.message({
      type: 'welcome',
      id: 'id-2',
      name: '朋友B',
      roomCode: 'DEF456',
      bpm: 120,
      bpi: 4,
    })
    instances[0]!.disconnect(1006)
    fireReconnect()
    const second = instances[1]!
    second.open()
    expect(second.sent).toEqual([{ type: 'join', name: '朋友B', roomCode: 'DEF456' }])
  })

  it('房间不存在(roomError)后清空房间码,允许重新创建', () => {
    const { instances, fireReconnect } = setup()
    const { handlers } = makeHandlers()
    const client = new WsClient('ws://x/ws', handlers)

    client.connect()
    client.joinRoom('ZZZZZZ', 'Solo')
    instances[0]!.open()
    instances[0]!.message({ type: 'roomError', message: '房间 ZZZZZZ 不存在' })

    instances[0]!.disconnect(1006)
    fireReconnect()
    const second = instances[1]!
    second.open()
    // 房间码已被清空,重连不会带旧码
    expect(second.sent).toEqual([{ type: 'join', name: 'Solo', roomCode: 'ZZZZZZ' }])
  })
})
