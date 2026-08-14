import { describe, expect, it } from 'vitest'
import { parseMidiMessage } from './midi'

describe('parseMidiMessage', () => {
  it('解析 noteOn 消息(0x90 通道 0)', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 100]))).toEqual({
      type: 'noteOn',
      note: 60,
      velocity: 100,
    })
  })

  it('解析任意通道的 noteOn(0x90–0x9F)', () => {
    expect(parseMidiMessage(new Uint8Array([0x91, 64, 80]))).toEqual({
      type: 'noteOn',
      note: 64,
      velocity: 80,
    })
  })

  it('解析 noteOff 消息(0x80–0x8F)', () => {
    expect(parseMidiMessage(new Uint8Array([0x80, 60, 0]))).toEqual({
      type: 'noteOff',
      note: 60,
      velocity: 0,
    })
  })

  it('noteOn 力度 0 视为 noteOff(规范要求)', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 62, 0]))).toEqual({
      type: 'noteOff',
      note: 62,
      velocity: 0,
    })
  })

  it('忽略非音符消息(控制变更/程序变更/系统消息)', () => {
    expect(parseMidiMessage(new Uint8Array([0xb0, 64, 127]))).toBeNull() // CC
    expect(parseMidiMessage(new Uint8Array([0xc0, 0, 0]))).toBeNull() // program change
    expect(parseMidiMessage(new Uint8Array([0xf0, 0x7e, 0x7f]))).toBeNull() // sysex start
  })

  it('长度不足返回 null', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60]))).toBeNull()
    expect(parseMidiMessage(new Uint8Array([]))).toBeNull()
  })
})
