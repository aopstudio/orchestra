# Orchestra — 浏览器在线音乐合奏

> 让任何人和朋友在浏览器里一起合奏。音乐版的多人在线游戏——只是它用的是真实乐谱和真实音色。

## 这是什么

面向**入门/初阶用户**的线上合奏软件（个人项目，技术验证阶段）。学乐器的人大多独自练习，但大部分曲子是合奏的；线下排演成本高，于是有了这个软件：不懂音乐的人可以跟着屏幕引导和朋友合奏，进阶用户可以用 MIDI 键盘、看谱面。

**核心同步思路（已被 Phase 0 验证）：** 服务器是权威节拍时钟，客户端只通过网络传输**音符事件**（带服务器时间戳），每个客户端在本地用采样级调度合成声音。网络抖动只影响"你何时听说这个事件"，不影响"它落在节拍网格哪里"——所以所有用户听到的是同一首曲子，对齐误差目标 < 30ms。这是 NINJAM 验证了 20 年的「节拍网格 + 时间戳事件」模型。

**明确不做：** 实时无损音频互动（那是 Jamulus / JackTrip 的主场）、专业编曲工具。

## 技术栈

| 层     | 选型                                                                 |
| ------ | -------------------------------------------------------------------- |
| 前端   | React 18 + TypeScript + Vite                                         |
| 音频   | Web Audio API（AudioWorklet + lookahead scheduler）+ smplr SoundFont |
| 网络   | WebSocket（`ws` 库），NTP 式时钟同步                                 |
| 服务器 | Node.js + ws（单进程）                                               |
| 测试   | Vitest（单元）+ Playwright（E2E）                                    |

## 目录结构

```
shared/    共享协议类型（client/server 共同依赖，@orchestra/shared）
server/    Node.js ws 服务器：权威节拍时钟、房间、事件中继、同步应答
client/    React 前端：时钟偏移估计 → 节拍网格 → 音频调度 + 引导 UI
docs/      计划文档（plan.md / plan-v2.md）、Phase 0 实施计划与验证报告、截图
```

## 快速开始

前置：Node ≥ 18（开发环境实测 Node 24）。

```bash
npm install

# 终端 1：启动服务器（ws://localhost:8080）
npm run dev:server

# 终端 2：启动前端（http://localhost:5173，/ws 代理到 8080）
npm run dev:client
```

打开两个浏览器窗口访问 `http://localhost:5173`，各自填写昵称点 Connect，就能敲键盘合奏（白键 A–K，黑键 W–U）。

> ⚠️ **端口 8080 冲突**：本机若有其他服务占用 8080，前端会连上不认识的协议而卡在 Connecting。E2E 使用 8081 端口规避（见 `client/playwright.config.ts` 注释）。前端 Server 输入框可以直接填 `ws://localhost:8081`。

## 测试与 CI

GitHub Actions(`.github/workflows/ci.yml`)在每次 push / PR 自动运行:
类型检查 → lint → 单元测试 → 生产构建 → E2E(11 个场景)。

## 测试

```bash
npm test               # 全部单元测试（shared + server + client）
npm run e2e -w client  # Playwright 双浏览器合奏 E2E（自动起 server:8081 + Vite:5173）
npx tsc --noEmit -p shared    # 各包类型检查
npx tsc --noEmit -p server
npx tsc --noEmit -p client
```

## 当前状态与路线图

- ✅ **Phase 0 — 同步技术验证原型**：双浏览器敲键盘合奏，三项指标全部达标（key→sound 29–32ms / 环回 RTT 2ms / 事件中继中位 5ms），见 `docs/phase0-validation.md`
- ✅ **Phase 1 — MVP**：多房间（6 位房间码）、键盘/鼠标输入、双引导模式（下落音符 / 虚拟乐器高亮 + 鼓垫）、SoundFont 音色、节拍网格同步、内置曲库、判定计分、声部音量混音；E2E 覆盖房间/引导/判定/节拍/四人合奏，验收映射见 `docs/phase1-validation.md`
- ✅ **Phase 2**：Web MIDI 键盘输入、OSMD 总谱/分谱渲染与跟随高亮、单进程部署（http(s)+ws 同端口，WSS 证书即开，见 `docs/deployment.md`）、曲库扩充至 9 首 + 曲目编辑器（录制→量化→保存→JSON/服务器分享）
- ✅ **Phase 3**：服务器曲目分享（6 位分享码）、新手教程 + 演奏键位手册、录音回放、铜管/弦乐编制模板（小号/小提琴 + 号角合奏/弦乐小夜曲）
- 📋 **待人工验证**（执行协议已写入 `docs/phase1-validation.md`）：4 台真实设备局域网合奏、新手 5 分钟上手计时、≥8 人定性访谈、真实跨城网络对齐测试、实际上云部署

测试规模：**172 个单元测试 + 9 个 E2E 场景**。详细规划见 `plan-v2.md`；Phase 0 实施细节见 `docs/plans/2026-08-11-phase0-sync-prototype.md`。

## 演奏方式

- **键盘**：白键 A–K、Z–M、黑键 W–U、Q–6（两个八度 C3–C5），映射到 MIDI 音符
- **鼠标/触摸**：点击 JamPad 上的琴键
- **引导模式**：选一首歌和一个声部，屏幕会提示现在该按哪个键（下落音符滚动条 / 琴键与鼓垫高亮 / 谱面跟随），并实时判定打分
- **进阶**：Web MIDI 键盘（Chrome/Edge）

## 许可证注意

音色库与渲染库均为宽松许可（smplr MIT、OSMD BSD-3、VexFlow MIT）；SonoBus / jacktrip-webrtc 等 GPL-3.0 项目只借鉴协议思路、不抄代码。内置曲目均为公有领域/原创。
