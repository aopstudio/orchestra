/**
 * MIDI 输入模块(Phase 2)
 *
 * 把 Web MIDI API(navigator.requestMIDIAccess)接入现有 noteOn/noteOff 管线:
 * - 必须在用户手势(点击按钮)中调用 requestMIDIAccess
 * - Chrome/Edge 支持;Safari 不支持 Web MIDI(返回 unsupported,由 UI 提示键盘回退)
 * - 消息解析拆成纯函数 {@link parseMidiMessage},便于单元测试
 */

/** MIDI 通道消息解析结果。 */
export interface ParsedMidiMessage {
  type: 'noteOn' | 'noteOff'
  /** MIDI 音符号 0–127 */
  note: number
  /** 力度 0–127 */
  velocity: number
}

/**
 * 解析一条 MIDI 通道消息(状态字节 + 数据字节)。
 * 仅处理 noteOn(0x90–0x9F)与 noteOff(0x80–0x8F);
 * noteOn 力度为 0 视为 noteOff(规范要求)。
 * 无法解析返回 null。
 */
export function parseMidiMessage(data: Uint8Array): ParsedMidiMessage | null {
  if (data.length < 3) return null
  const status = data[0] ?? 0
  const note = data[1] ?? 0
  const velocity = data[2] ?? 0
  if (status >= 0x90 && status <= 0x9f) {
    if (velocity === 0) return { type: 'noteOff', note, velocity }
    return { type: 'noteOn', note, velocity }
  }
  if (status >= 0x80 && status <= 0x8f) {
    return { type: 'noteOff', note, velocity }
  }
  return null
}

export interface MidiConnection {
  /** 已连接的输入设备名。 */
  deviceNames: string[]
  /** 断开所有输入监听。 */
  disconnect(): void
}

export interface MidiHandlers {
  onNoteOn(note: number, velocity: number): void
  onNoteOff(note: number): void
}

/**
 * 请求 MIDI 访问并监听所有输入。必须在用户手势中调用。
 * - 不支持(如 Safari)→ 返回 null
 * - 用户拒绝授权 / 无设备 → 抛错,由调用方提示
 */
export async function connectMidi(handlers: MidiHandlers): Promise<MidiConnection | null> {
  if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
    return null
  }
  const access = await navigator.requestMIDIAccess({ sysex: false })
  const listeners: Array<() => void> = []
  const deviceNames: string[] = []

  const attachInput = (input: MIDIInput): void => {
    deviceNames.push(input.name || input.id)
    const onMessage = (event: MIDIMessageEvent): void => {
      const parsed = parseMidiMessage(new Uint8Array(event.data ?? []))
      if (parsed === null) return
      if (parsed.type === 'noteOn') {
        handlers.onNoteOn(parsed.note, parsed.velocity)
      } else {
        handlers.onNoteOff(parsed.note)
      }
    }
    input.addEventListener('midimessage', onMessage)
    listeners.push(() => input.removeEventListener('midimessage', onMessage))
  }

  // 初始枚举
  for (const input of access.inputs.values()) {
    attachInput(input)
  }
  // 热插拔
  const onInputAdded = (event: MIDIConnectionEvent): void => {
    const port = event.port
    if (port !== null && port.type === 'input' && port.state === 'connected') {
      attachInput(port as MIDIInput)
    }
  }
  access.addEventListener('statechange', onInputAdded as EventListener)
  listeners.push(() => access.removeEventListener('statechange', onInputAdded))

  return {
    deviceNames,
    disconnect: () => {
      for (const off of listeners) off()
    },
  }
}
