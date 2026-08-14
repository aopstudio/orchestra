/**
 * Browser WebSocket client for the Phase 0 jam-sync protocol.
 *
 * Speaks the {@link ClientMsg}/{@link ServerMsg} contract from
 * `@orchestra/shared`, dispatches typed server messages to per-type
 * handlers, and auto-reconnects with exponential backoff (1s, 2s, 4s,
 * capped at 10s). `connect()` resets the reconnect flag.
 */

import type { ClientMsg, ServerMsg } from '@orchestra/shared'

/** Discriminated-union extraction: the per-type server messages. */
type WelcomeMsg = Extract<ServerMsg, { type: 'welcome' }>
type RoomErrorMsg = Extract<ServerMsg, { type: 'roomError' }>
type PeerJoinedMsg = Extract<ServerMsg, { type: 'peerJoined' }>
type PeerLeftMsg = Extract<ServerMsg, { type: 'peerLeft' }>
type ClockMsg = Extract<ServerMsg, { type: 'clock' }>
type NoteMsg = Extract<ServerMsg, { type: 'note' }>
type NoteOffMsg = Extract<ServerMsg, { type: 'noteOff' }>
type TempoMsg = Extract<ServerMsg, { type: 'tempo' }>
type BpiMsg = Extract<ServerMsg, { type: 'bpi' }>
type SyncAckMsg = Extract<ServerMsg, { type: 'syncAck' }>

/** 加入房间的意图: 创建新房间或凭码加入已有房间。断线重连后按此意图重新加入。 */
type JoinIntent = { kind: 'create'; name: string } | { kind: 'join'; name: string; roomCode: string }

/** Per-message-type callbacks. Unknown message types are ignored. */
export interface WsHandlers {
  onWelcome(msg: WelcomeMsg): void
  onRoomError(msg: RoomErrorMsg): void
  onPeerJoined(msg: PeerJoinedMsg): void
  onPeerLeft(msg: PeerLeftMsg): void
  onClock(msg: ClockMsg): void
  onNote(msg: NoteMsg): void
  onNoteOff(msg: NoteOffMsg): void
  onTempo(msg: TempoMsg): void
  onBpi(msg: BpiMsg): void
  onSyncAck(msg: SyncAckMsg): void
}

const MAX_RECONNECT_DELAY_MS = 10_000

export class WsClient {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  /** When false, a closed socket stays closed (explicit close or never connected). */
  private reconnectFlag = false
  /** 入房意图: 连接建立(含重连)后自动发送。 */
  private intent: JoinIntent | null = null

  constructor(
    private readonly url: string,
    private readonly handlers: WsHandlers,
  ) {}

  /** Opens the connection (or reopens after a close). Resets the reconnect flag and backoff. */
  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    this.reconnectFlag = true
    this.reconnectAttempts = 0
    this.openSocket()
  }

  /** 记录"创建房间"意图并立即发送(若连接未就绪则在 open 后发送)。 */
  createRoom(name: string): void {
    this.intent = { kind: 'create', name }
    this.trySendIntent()
  }

  /** 记录"凭码加入"意图并立即发送(若连接未就绪则在 open 后发送)。 */
  joinRoom(roomCode: string, name: string): void {
    this.intent = { kind: 'join', name, roomCode }
    this.trySendIntent()
  }

  /** Sends a `note` message (note is a MIDI number). */
  sendNote(note: number, velocity: number): void {
    this.send({ type: 'note', note, velocity })
  }

  /** Sends a `noteOff` message (note is a MIDI number). */
  sendNoteOff(note: number): void {
    this.send({ type: 'noteOff', note })
  }

  /** Sends a `setTempo` message with the new BPM. */
  sendSetTempo(bpm: number): void {
    this.send({ type: 'setTempo', bpm })
  }

  /** Sends a `setBpi` message with the new beats-per-bar (time signature numerator). */
  sendSetBpi(bpi: number): void {
    this.send({ type: 'setBpi', bpi })
  }

  /** Sends a `sync` message with the client timestamp for clock offset estimation. */
  sendSync(t1: number): void {
    this.send({ type: 'sync', t1 })
  }

  /** Stops reconnecting and closes the socket. */
  close(): void {
    this.reconnectFlag = false
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /** The underlying socket's readyState, or CLOSED when no socket exists. */
  get readyState(): number {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED
  }

  private trySendIntent(): void {
    if (this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.intent !== null) {
      this.sendIntent(this.intent)
    }
  }

  private sendIntent(intent: JoinIntent): void {
    if (intent.kind === 'create') {
      this.send({ type: 'createRoom', name: intent.name })
    } else {
      this.send({ type: 'join', name: intent.name, roomCode: intent.roomCode })
    }
  }

  private openSocket(): void {
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onopen = () => {
      this.reconnectAttempts = 0
      if (this.intent !== null) {
        this.sendIntent(this.intent)
      }
    }

    ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(String(event.data))
    }

    ws.onerror = () => {
      console.warn('[WsClient] WebSocket error on', this.url)
    }

    ws.onclose = (event: CloseEvent) => {
      this.ws = null
      if (this.reconnectFlag) {
        console.warn(`[WsClient] connection closed (code=${event.code}); reconnecting`)
        this.scheduleReconnect()
      }
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1_000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS)
    this.reconnectAttempts += 1
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      if (this.reconnectFlag) {
        this.openSocket()
      }
    }, delay)
  }

  private send(msg: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WsClient] socket not open; dropping message:', msg.type)
      return
    }
    this.ws.send(JSON.stringify(msg))
  }

  private handleMessage(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
      return
    }
    // `parsed` is a JSON object whose `type` we dispatch on; each case is
    // narrowed to its ServerMsg variant by the protocol contract.
    switch (parsed.type) {
      case 'welcome':
        this.handlers.onWelcome(parsed as WelcomeMsg)
        break
      case 'roomError':
        this.handlers.onRoomError(parsed as RoomErrorMsg)
        break
      case 'peerJoined':
        this.handlers.onPeerJoined(parsed as PeerJoinedMsg)
        break
      case 'peerLeft':
        this.handlers.onPeerLeft(parsed as PeerLeftMsg)
        break
      case 'clock':
        this.handlers.onClock(parsed as ClockMsg)
        break
      case 'note':
        this.handlers.onNote(parsed as NoteMsg)
        break
      case 'noteOff':
        this.handlers.onNoteOff(parsed as NoteOffMsg)
        break
      case 'tempo':
        this.handlers.onTempo(parsed as TempoMsg)
        break
      case 'bpi':
        this.handlers.onBpi(parsed as BpiMsg)
        break
      case 'syncAck':
        this.handlers.onSyncAck(parsed as SyncAckMsg)
        break
      default:
        // Unknown message type: ignore per protocol.
        break
    }
  }
}
