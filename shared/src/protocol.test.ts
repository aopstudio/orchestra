import { expectTypeOf, test } from 'vitest'
import type { ClientMsg, ServerMsg } from './protocol'

/**
 * 类型级协议契约测试。
 *
 * 注意: `expectTypeOf` 在运行时是 no-op,真正的检查发生在 TypeScript 编译期,
 * 所以这些断言只有在文件被 tsc 检查时才有意义(shared/tsconfig.json 已 include src)。
 * 断言模式: 用 Extract 取出联合类型中对应 type 标签的成员,再与期望形状做全等比较,
 * 这样联合类型整体不会因为"其他成员不匹配单一形状"而误报。
 */

test('note 消息形状(携带乐器)', () => {
  expectTypeOf<Extract<ClientMsg, { type: 'note' }>>().toEqualTypeOf<{
    type: 'note'
    note: number
    velocity: number
    instrument: 'piano' | 'bass' | 'drums'
  }>()
})

test('syncAck 消息形状', () => {
  expectTypeOf<Extract<ServerMsg, { type: 'syncAck' }>>().toEqualTypeOf<{
    type: 'syncAck'
    t1: number
    t2: number
    t3: number
  }>()
})

test('clock 消息形状', () => {
  expectTypeOf<Extract<ServerMsg, { type: 'clock' }>>().toEqualTypeOf<{
    type: 'clock'
    beat: number
    tempo: number
    bpi: number
    serverTime: number
  }>()
})

test('note 广播形状(带服务器时间戳与乐器)', () => {
  expectTypeOf<Extract<ServerMsg, { type: 'note' }>>().toEqualTypeOf<{
    type: 'note'
    from: string
    note: number
    velocity: number
    instrument: 'piano' | 'bass' | 'drums'
    serverTime: number
  }>()
})

test('noteOff 消息形状', () => {
  expectTypeOf<Extract<ClientMsg, { type: 'noteOff' }>>().toEqualTypeOf<{
    type: 'noteOff'
    note: number
  }>()
})

test('noteOff 广播形状(带服务器时间戳)', () => {
  expectTypeOf<Extract<ServerMsg, { type: 'noteOff' }>>().toEqualTypeOf<{
    type: 'noteOff'
    from: string
    note: number
    serverTime: number
  }>()
})

test('setTempo 消息形状', () => {
  expectTypeOf<Extract<ClientMsg, { type: 'setTempo' }>>().toEqualTypeOf<{
    type: 'setTempo'
    bpm: number
  }>()
})

test('setBpi 消息形状', () => {
  expectTypeOf<Extract<ClientMsg, { type: 'setBpi' }>>().toEqualTypeOf<{
    type: 'setBpi'
    bpi: number
  }>()
})

test('tempo 广播形状(带服务器时间戳)', () => {
  expectTypeOf<Extract<ServerMsg, { type: 'tempo' }>>().toEqualTypeOf<{
    type: 'tempo'
    bpm: number
    serverTime: number
  }>()
})

test('bpi 广播形状(带服务器时间戳)', () => {
  expectTypeOf<Extract<ServerMsg, { type: 'bpi' }>>().toEqualTypeOf<{
    type: 'bpi'
    bpi: number
    serverTime: number
  }>()
})

test('createRoom 消息形状', () => {
  expectTypeOf<Extract<ClientMsg, { type: 'createRoom' }>>().toEqualTypeOf<{
    type: 'createRoom'
    name: string
  }>()
})

test('join 消息形状(带房间码)', () => {
  expectTypeOf<Extract<ClientMsg, { type: 'join' }>>().toEqualTypeOf<{
    type: 'join'
    name: string
    roomCode: string
  }>()
})

test('roomError 消息形状', () => {
  expectTypeOf<Extract<ServerMsg, { type: 'roomError' }>>().toEqualTypeOf<{
    type: 'roomError'
    message: string
  }>()
})

test('welcome 消息形状(带房间码)', () => {
  expectTypeOf<Extract<ServerMsg, { type: 'welcome' }>>().toEqualTypeOf<{
    type: 'welcome'
    id: string
    name: string
    roomCode: string
    bpm: number
    bpi: number
  }>()
})
