# Phase 0 同步技术验证原型 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 验证 3 个核心风险——①键盘→音色延迟 <50ms、②LAN 时钟同步精度 <10ms、③节拍网格事件对齐 <30ms 无漂移——产出可运行的「双浏览器敲键盘合奏节拍器」demo。

**Architecture:** npm workspaces 单仓:`shared`(协议类型)+ `server`(Node.js+ws:权威节拍时钟、事件中继、NTP 式同步应答)+ `client`(React+Vite:时钟偏移估计 → 节拍网格 → lookahead 调度 + smplr 音色)。所有音符事件由**服务器打时间戳**,客户端换算到本地音频时钟(`ctx.currentTime`)采样级播放。引导 UI(下落音符/乐器高亮)不在 Phase 0 范围,Phase 1 再做。

**Tech Stack:** TypeScript / Vite + React 18 / Node.js + ws / Web Audio API(AudioWorklet + lookahead scheduler)/ smplr + gleitz/midi-js-soundfonts / Vitest(单元)+ Playwright(E2E)

**同步协议核心(所有任务以此为准):**

```ts
// 时钟偏移(NTP 式,毫秒,基于 performance.now())
// client 发 {type:'sync', t1}; server 收到记 t2,回复 {type:'syncAck', t1, t2, t3};
// client 收到记 t4。offset = ((t2-t1)+(t3-t4))/2 (server 时钟 - client 时钟)
// delay = (t4-t1)-(t3-t2);只保留 delay < 50ms 的样本,取均值;每 30s 重同步

// 服务器时钟广播: {type:'clock', beat, tempo, serverTime}
// 事件: client→server {type:'note', note, velocity}; server→其他人 {type:'note', from, note, velocity, serverTime}
```

---

### Task 1: 项目脚手架(workspaces + tsconfig + git 基线)

**Files:**

- Create: `package.json`(root, npm workspaces: shared/server/client)
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `shared/package.json`、`server/package.json`、`client/package.json`

**Step 1:** 写 root `package.json`:

```json
{
  "name": "orchestra",
  "private": true,
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev:server": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "test": "npm run test -ws --if-present"
  }
}
```

**Step 2:** 写 `tsconfig.base.json`(strict: true、target ES2022、moduleResolution bundler)。

**Step 3:** 三个子包 package.json:

- `shared`: `"main": "src/index.ts"`,无依赖,`"test": "vitest run"`
- `server`: deps `ws`、`@orchestra/shared`(workspace:*);devDeps `tsx`、`vitest`、`@types/ws`;scripts `dev: tsx watch src/index.ts`、`test`
- `client`: deps `react`、`react-dom`、`smplr`、`@orchestra/shared`;devDeps `vite`、`@vitejs/plugin-react`、`vitest`、`playwright`、`@playwright/test`;scripts `dev`、`test`、`e2e`

**Step 4:** 安装依赖,验证:`npm install && npm run build` 概念验证(或 tsc --noEmit)。

**Step 5:** Commit: `chore: scaffold npm workspaces`

---

### Task 2: 共享协议类型

**Files:**

- Create: `shared/src/protocol.ts`
- Create: `shared/src/index.ts`(re-export)
- Test: `shared/src/protocol.test.ts`

**Step 1(测试先行):** 写协议判别联合的类型级测试(用 `expectTypeOf` 或编译期断言):

```ts
// protocol.test.ts
import { expectTypeOf, test } from 'vitest'
import type { ClientMsg, ServerMsg } from './protocol'
test('note 消息形状', () => {
  expectTypeOf<ClientMsg>().toMatchTypeOf<{ type: 'note'; note: number; velocity: number }>()
})
```

**Step 2:** 实现 `protocol.ts`:

```ts
export type ClientMsg =
  | { type: 'join'; name: string }
  | { type: 'note'; note: number; velocity: number }
  | { type: 'sync'; t1: number }
export type ServerMsg =
  | { type: 'welcome'; id: string; name: string }
  | { type: 'peerJoined'; id: string; name: string }
  | { type: 'peerLeft'; id: string }
  | { type: 'clock'; beat: number; tempo: number; serverTime: number }
  | { type: 'note'; from: string; note: number; velocity: number; serverTime: number }
  | { type: 'syncAck'; t1: number; t2: number; t3: number }
```

**Step 3:** `npm run test -w shared` 通过。

**Step 4:** Commit: `feat(shared): define WebSocket protocol types`

---

### Task 3: 服务器权威节拍时钟(纯逻辑,TDD)

**Files:**

- Create: `server/src/beatClock.ts`
- Test: `server/src/beatClock.test.ts`

**Step 1(测试先行):**

```ts
import { describe, expect, it } from 'vitest'
import { createBeatClock } from './beatClock'

describe('beatClock', () => {
  it('interval 长度 = bpi / (bpm/60) 毫秒', () => {
    const c = createBeatClock(120, 4)
    expect(c.intervalMs).toBe(2000)
  })
  it('beat 随时间推进', () => {
    const c = createBeatClock(120, 4)
    expect(c.beatAt(0)).toBe(0)
    expect(c.beatAt(2000)).toBe(4)
    expect(c.beatAt(2500)).toBe(5)
  })
  it('serverTime 单调递增', () => {
    const c = createBeatClock(90, 8)
    const t1 = c.now()
    const t2 = c.now()
    expect(t2).toBeGreaterThanOrEqual(t1)
  })
})
```

**Step 2:** 实现——纯时间函数(不依赖真实时钟,注入 `now` 函数):

```ts
export interface BeatClock {
  intervalMs: number
  now(): number // 当前 serverTime(注入时钟)
  beatAt(serverTime: number): number // 任意时刻的 beat 数(可非整数)
}
export function createBeatClock(bpm: number, bpi: number, now: () => number): BeatClock
```

**Step 3:** 测试通过。

**Step 4:** Commit: `feat(server): authoritative beat clock logic`

---

### Task 4: 服务器房间 + 事件中继 + 同步应答(TDD)

**Files:**

- Create: `server/src/room.ts`
- Create: `server/src/index.ts`(ws server 接线)
- Test: `server/src/room.test.ts`

**Step 1(测试先行):**

```ts
import { describe, expect, it } from 'vitest'
import { createRoom } from './room'

describe('room', () => {
  it('加入返回 id 并通知已有成员', () => {
    const r = createRoom(120, 4, () => 1000)
    const a = { send: () => {} }
    const b = { send: () => {} }
    r.join(a as any, 'Alice')
    r.join(b as any, 'Bob')
    expect(r.size()).toBe(2)
  })
  it('note 广播给其他人并带服务器时间戳', () => {
    const r = createRoom(120, 4, () => 5000)
    let received: any = null
    const a = { send: () => {} }
    const b = {
      send: (m: any) => {
        received = m
      },
    }
    r.join(a as any, 'A')
    r.join(b as any, 'B')
    r.note(a as any, 60, 100)
    expect(received).toMatchObject({
      type: 'note',
      from: 'A',
      note: 60,
      velocity: 100,
      serverTime: 5000,
    })
  })
  it('syncAck 回传 t1/t2/t3', () => {
    const r = createRoom(120, 4, () => 777)
    let ack: any = null
    const a = {
      send: (m: any) => {
        ack = m
      },
    }
    r.join(a as any, 'A')
    r.sync(a as any, 100)
    expect(ack).toMatchObject({ type: 'syncAck', t1: 100, t2: 777, t3: 777 })
  })
})
```

**Step 2:** 实现 `room.ts`——维护成员表、`join`/`leave`/`note`/`sync`/`broadcastClock`;成员抽象为 `{ id, name, send(msg) }`;时钟用注入的 `now()`。

**Step 3:** `index.ts` 接线:ws server → 解析 JSON → 分发到 room;每 500ms 广播 `clock` 消息;客户端断开自动 leave。

**Step 4:** 测试通过 + 手动冒烟(可选 `node --test` 或 ws 客户端脚本)。

**Step 5:** Commit: `feat(server): room relay + ntp sync responder`

---

### Task 5: 客户端时钟偏移估计(TDD)

**Files:**

- Create: `client/src/sync/clockOffset.ts`
- Test: `client/src/sync/clockOffset.test.ts`

**Step 1(测试先行):**

```ts
import { describe, expect, it } from 'vitest'
import { computeOffset, filterSamples } from './clockOffset'

describe('clockOffset', () => {
  it('对称 RTT 下 offset 精确', () => {
    // client 时钟快 100ms: t2-t1 = 40, t3-t4 = -40 → offset = 0? 需定义清楚
    // 约定: offset = server - client。client 发 t1=0,server 收到 t2=140(server 时钟,真实差 100+40),
    // server 回 t3=140,client 收 t4=40 → offset = ((140-0)+(140-40))/2 = 120? 见实现注
    expect(computeOffset(0, 140, 140, 40)).toBe(120)
  })
  it('过滤高延迟样本', () => {
    const samples = [5, 6, 500, 7]
    expect(filterSamples(samples, 50).length).toBe(3)
  })
})
```

**Step 2:** 实现纯函数 + `estimateOffset(sendSync): Promise<number>`(封装 ws 往返,取 ≤5 个低延迟样本均值)。

**Step 3:** 测试通过。

**Step 4:** Commit: `feat(client): ntp-style clock offset estimation`

---

### Task 6: 客户端节拍网格(TDD)

**Files:**

- Create: `client/src/sync/beatGrid.ts`
- Test: `client/src/sync/beatGrid.test.ts`

**Step 1(测试先行):**

```ts
import { describe, expect, it } from 'vitest'
import { createBeatGrid } from './beatGrid'

describe('beatGrid', () => {
  it('serverTime → 本地音频时间', () => {
    // offset=100(server 领先),当前 ctx.currentTime=1.0 对应 serverTime=1100
    // 目标 serverTime=1200 → 本地音频时间 = 1.0 + (1200-1100)/1000 = 1.1
    const g = createBeatGrid({ offset: 100, ctxNow: () => 1.0, serverNow: () => 1100 })
    expect(g.toAudioTime(1200)).toBeCloseTo(1.1)
  })
  it('量化到 quantum 边界', () => {
    const g = createBeatGrid({ offset: 0, ctxNow: () => 0, serverNow: () => 0 })
    expect(g.quantize(4.3, 4)).toBe(4)
    expect(g.quantize(4.6, 4)).toBe(8)
  })
})
```

**Step 2:** 实现——`createBeatGrid({offset, ctxNow, serverNow})`,`toAudioTime(serverTime)`、`quantize(beat, quantum)`、`beatOfServerTime()`。

**Step 3:** 测试通过。

**Step 4:** Commit: `feat(client): beat grid conversions`

---

### Task 7: 客户端音频调度器 + 音色

**Files:**

- Create: `client/src/audio/scheduler.ts`(lookahead scheduler)
- Create: `client/src/audio/instruments.ts`(smplr 封装:钢琴/鼓)
- Create: `client/src/audio/metronome.ts`(节拍器)
- Test: `client/src/audio/scheduler.test.ts`(纯调度逻辑部分)

**Step 1:** 实现 `scheduler.ts`——Chris Wilson lookahead 模式:`setInterval(25ms)` 唤醒,把所有 <100ms 内到期的 `(audioTime, note)` 调度到 `ctx.currentTime` 上;暴露 `schedule(note, audioTime)` 与 `latencySince(keydownPerfTime)` 测量(用 `ctx.getOutputTimestamp()` 换算)。

**Step 2:** `instruments.ts`——smplr `Soundfont`(钢琴)+ `DrumMachine`(鼓,GM 鼓图),延迟加载,失败降级到 WebAudio 振荡器(保证 demo 必响)。

**Step 3:** `metronome.ts`——按 beatGrid 在 `ctx.currentTime` 上采样级调度节拍器滴答。

**Step 4:** 手动验证(浏览器):按键出声,延迟读数显示在 UI。

**Step 5:** Commit: `feat(client): lookahead scheduler + smplr instruments + metronome`

---

### Task 8: 客户端输入 + ws 客户端 + 状态流

**Files:**

- Create: `client/src/net/wsClient.ts`(连接、重连、消息路由)
- Create: `client/src/input/keyboard.ts`(键盘→note 事件映射)
- Test: `client/src/input/keyboard.test.ts`

**Step 1(测试先行):** keyboard 映射——`KEYMAP = { 'a': 60, 's': 62, ... }`,测试按键→note 映射、防连发(keydown 重复忽略)。

**Step 2:** `wsClient.ts`——连接服务器,分发 `clock/note/peerJoined` 到回调;暴露 `sendNote/sync`。

**Step 3:** 集成:keydown → `sendNote` → 服务器打时间戳广播 → 本地也回放(旁路,本地即时监听)+ 远端事件进 scheduler。

**Step 4:** 手动冒烟:两个标签页互通。

**Step 5:** Commit: `feat(client): keyboard input + ws client + event flow`

---

### Task 9: 客户端 UI(JamPad)

**Files:**

- Create: `client/src/App.tsx`
- Create: `client/src/ui/JamPad.tsx`(键盘布局 + 状态读数)
- Create: `client/index.html`、`client/vite.config.ts`、`client/src/main.tsx`

**Step 1:** App 接线:连接表单(服务器地址)、房间状态(成员列表)、BPM 显示、按键高亮反馈、三个验证读数:

- ① key→sound 延迟(ms,取自 scheduler 测量)
- ② 时钟偏移估计 + 样本延迟(ms)
- ③ 对齐误差指示(本地 tap 与节拍网格的偏差,取自 metronome 校准)

**Step 2:** JamPad 渲染键盘映射(标注每个键对应的音名),按下高亮。

**Step 3:** `npm run dev` 冒烟:打开两个窗口,敲键互听。

**Step 4:** Commit: `feat(client): jam pad UI with validation readouts`

---

### Task 10: E2E + 验证报告

**Files:**

- Create: `client/e2e/jam.spec.ts`(Playwright:两个 page 连同一 server,验证事件互达 + 读回验证读数)
- Create: `docs/phase0-validation.md`(三个指标的实测结果)

**Step 1:** Playwright 测试:起 server → 两个 page → join → page A 发 note → 断言 page B 收到;读取 UI 中的 offset/延迟读数,断言在阈值内(LAN 环境)。

**Step 2:** 手动验证脚本:`docs/phase0-validation.md` 记录三项指标实测值:

- ① key→sound < 50ms
- ② offset 估计稳定 < 10ms(LAN)
- ③ 双客户端节拍对齐 < 30ms、60s 无累积漂移

**Step 3:** 全量 `npm test` + `npm run e2e` 通过。

**Step 4:** Commit: `test(e2e): two-browser jam validation + report`

---

## 验收标准(全部满足即 Phase 0 通过)

| 指标             | 阈值              | 验证方式                       |
| ---------------- | ----------------- | ------------------------------ |
| ① key→sound 延迟 | < 50ms            | UI 读数 + scheduler 测量       |
| ② 时钟偏移精度   | < 10ms(LAN)       | offset 估计稳定性 + 样本延迟   |
| ③ 节拍网格对齐   | < 30ms,60s 无漂移 | 双客户端 tap 偏差 + Playwright |
| demo 可用性      | 双浏览器互通合奏  | 手动 + E2E                     |

## 已知边界(Phase 0 不做)

- 引导 UI(下落音符/乐器高亮)——Phase 1
- Web MIDI、OSMD 记谱、互联网部署——Phase 2
- 实时音频流——远期实验
