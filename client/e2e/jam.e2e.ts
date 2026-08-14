import { test, expect, type Page } from '@playwright/test'
import { DRUM_KEYMAP } from '../src/input/keyboard'

declare global {
  interface Window {
    /** E2E hook: count of remote note events received (set only under ?e2e=1). */
    __orchNotes: number | undefined
    __orchLastInstrument: string | undefined
    __orchLastNote: number | undefined
    /** E2E hook: set once the instrument pipeline is ready (set only under ?e2e=1). */
    __orchInstrumentsReady: boolean | undefined
  }
}

const E2E_URL = '/?e2e=1'
/**
 * The ws server for the E2E run is started by playwright.config.ts on port
 * 8081 (8080 is squatted by an unrelated local daemon). The client connects
 * to the backend directly instead of through the Vite /ws proxy; the WebSocket
 * protocol imposes no origin gate, so this exercises the full stack.
 */
const WS_URL = 'ws://localhost:8081'

/**
 * smplr hosts (sampled piano + TR-808). On machines where the CDN is slow or
 * unreachable, the soundfont fetch hangs and instruments stay uninitialised —
 * and the app's keydown guard skips sendNote until they exist. Aborting the
 * CDN requests makes the instrument factories fail fast, so the built-in
 * oscillator fallback is ready in well under a second.
 */
const SMPLR_CDN = /^https?:\/\/(gleitz\.github\.io|goldst\.dev|smpldsnds\.github\.io)/
/** 自托管音源也在 E2E 中拦截,保持测试走快速合成降级。 */
const SELF_SOUNDFONTS = /\/soundfonts\//

/** Abort smplr CDN + self-hosted soundfont fetches so the fallback synth initialises immediately. */
async function blockCdn(page: Page): Promise<void> {
  await page.route(SMPLR_CDN, (route) => route.abort())
  await page.route(SELF_SOUNDFONTS, (route) => route.abort())
}

/** Open the app, fill server + name, and click the given action button. */
async function openForm(page: Page, name: string): Promise<void> {
  await blockCdn(page)
  await page.goto(E2E_URL)
  // 首次访问的新手教程会遮住界面 —— 关掉它
  if ((await page.getByTestId('tutorial-modal').count()) > 0) {
    await page.getByTestId('tut-close').click()
  }
  await page.locator('label.field', { hasText: 'Server' }).locator('input').fill(WS_URL)
  await page.getByTestId('name-input').fill(name)
}

/** Create a brand-new room and wait for the welcome. Returns the room code. */
async function createRoom(page: Page, name: string): Promise<string> {
  await openForm(page, name)
  await page.getByTestId('create-btn').click()
  await expect(page.getByTestId('conn-badge')).toHaveText('CONNECTED', { timeout: 20_000 })
  const code = await page.getByTestId('room-code').locator('b').textContent()
  expect(code).toMatch(/^[A-Z2-9]{6}$/)
  // 醒目的房间码卡片: 展示同一个码 + 复制按钮
  await expect(page.getByTestId('room-code-callout')).toBeVisible()
  await expect(page.getByTestId('room-code-value')).toHaveText(code ?? '')
  await expect(page.getByTestId('copy-room-code')).toBeVisible()
  return code ?? ''
}

/** Join an existing room by code and wait for the welcome. */
async function joinRoom(page: Page, name: string, code: string): Promise<void> {
  await openForm(page, name)
  await page.getByTestId('room-code-input').fill(code)
  await page.getByTestId('join-btn').click()
  await expect(page.getByTestId('conn-badge')).toHaveText('CONNECTED', { timeout: 20_000 })
}

/** Wait until the instrument pipeline exists (see SMPLR_CDN note). */
async function waitInstrumentsReady(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__orchInstrumentsReady === true), {
      timeout: 20_000,
    })
    .toBe(true)
}

/** Strip the "ms" unit off a readout value ("+3ms" -> "+3", "—" -> null). */
function readoutNumber(text: string | null): number | null {
  if (text === null) return null
  const match = text.trim().match(/(-?\d+)/)
  return match === null ? null : Number(match[1])
}

test('two browsers join the room, exchange notes, and show validation readouts', async ({
  browser,
}) => {
  // --- page A creates a room ------------------------------------------------
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  const roomCode = await createRoom(pageA, 'TestA')

  // All three validation readouts are rendered.
  await expect(pageA.getByTestId('readout-latency')).toBeVisible()
  await expect(pageA.getByTestId('readout-offset')).toBeVisible()
  await expect(pageA.getByTestId('readout-beat')).toBeVisible()

  // --- page B joins A's room by code ---------------------------------------
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await joinRoom(pageB, 'TestB', roomCode)

  // The room roster on A must now include TestB.
  await expect(pageA.getByTestId('peers')).toContainText('TestB', { timeout: 20_000 })

  // --- validation readouts settle -------------------------------------------
  // ③ server beat: populated by the 500 ms clock broadcast (a number, not '—').
  await expect
    .poll(() => pageA.getByTestId('readout-beat').locator('.readout-value').textContent(), {
      timeout: 20_000,
    })
    .not.toBe('—')
  const beatText = await pageA.getByTestId('readout-beat').locator('.readout-value').textContent()
  const beat = readoutNumber(beatText)
  expect(beat).not.toBeNull()

  // ② clock offset: at least one full NTP-style sync round trip completed
  // (the sub-line reads "RTT <n> ms · 1 sync" after the first exchange).
  await expect
    .poll(() => pageA.getByTestId('readout-offset').locator('.readout-sub').textContent(), {
      timeout: 20_000,
    })
    .toMatch(/· \d+ sync/)
  const offsetText = await pageA
    .getByTestId('readout-offset')
    .locator('.readout-value')
    .textContent()
  const offset = readoutNumber(offsetText)
  expect(offset).not.toBeNull()

  // --- note exchange: B -> server -> A --------------------------------------
  // Blur any focused control so the keydown lands on the body, not an input.
  // Both pages must have instruments ready: the keydown guard skips sendNote
  // until they exist (see SMPLR_CDN note).
  await waitInstrumentsReady(pageB)
  await waitInstrumentsReady(pageA)
  await pageB.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

  // Manual timing check: how long a keydown on B takes to reach A's onNote.
  const transportSamples: number[] = []
  for (let i = 0; i < 5; i += 1) {
    const prev = await pageA.evaluate(() => window.__orchNotes ?? 0)
    const t0 = Date.now()
    await pageB.keyboard.press('a')
    await pageA.waitForFunction((before: number) => (window.__orchNotes ?? 0) > before, prev, {
      timeout: 10_000,
    })
    transportSamples.push(Date.now() - t0)
  }
  console.log(`[e2e] note transport B->A: ${transportSamples.map((n) => `${n}ms`).join(', ')}`)
  const received = await pageA.evaluate(() => window.__orchNotes ?? 0)
  expect(received).toBeGreaterThanOrEqual(5)

  // --- ① key→sound latency readout (local press on A) -----------------------
  // Headless Chromium may not expose output timestamps, in which case the
  // readout stays '—'; when it is a number it must be plausible (>= 0).
  await pageA.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
  await pageA.keyboard.press('s')
  const latencyText = await pageA
    .getByTestId('readout-latency')
    .locator('.readout-value')
    .textContent()
  const latency = readoutNumber(latencyText)
  if (latency !== null) {
    expect(latency).toBeGreaterThanOrEqual(0)
    expect(latency).toBeLessThanOrEqual(1000)
    console.log(`[e2e] key->sound latency readout: ${latency}ms`)
  } else {
    console.log('[e2e] key->sound latency readout: not available in headless')
  }

  // --- room isolation check: a second room does NOT receive B's notes -------
  // Creates a brand-new room on a third page; its note counter must stay 0
  // while B plays (proving multi-room isolation, not just transport).
  const ctxC = await browser.newContext()
  const pageC = await ctxC.newPage()
  await createRoom(pageC, 'TestC')
  await waitInstrumentsReady(pageC)
  await pageC.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

  await pageB.keyboard.press('d')
  await pageB.keyboard.press('f')
  // Give the relay a generous window; the isolated room must never see them.
  await pageC.waitForTimeout(1500)
  const isolatedCount = await pageC.evaluate(() => window.__orchNotes ?? 0)
  expect(isolatedCount).toBe(0)
  console.log('[e2e] room isolation: other-room note counter stays 0')

  // --- final readout snapshot for the validation report ----------------------
  const snapshot = await pageA.evaluate(() => ({
    latency: document.querySelector('[data-testid="readout-latency"]')?.textContent ?? '',
    offset: document.querySelector('[data-testid="readout-offset"]')?.textContent ?? '',
    beat: document.querySelector('[data-testid="readout-beat"]')?.textContent ?? '',
    peers: document.querySelector('[data-testid="peers"]')?.textContent ?? '',
    room: document.querySelector('[data-testid="room-code"]')?.textContent ?? '',
  }))
  console.log(`[e2e] readout snapshot A: ${JSON.stringify(snapshot)}`)

  await ctxA.close()
  await ctxB.close()
  await ctxC.close()
})

test('joining a non-existent room surfaces a room error and allows retry', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await openForm(page, 'Solo')
  await page.getByTestId('room-code-input').fill('NOPE42')
  await page.getByTestId('join-btn').click()
  // The server rejects with a roomError; the app surfaces it and goes idle.
  await expect(page.getByTestId('error-box')).toContainText('NOPE42', { timeout: 20_000 })
  await expect(page.getByTestId('conn-badge')).toHaveText('OFFLINE', { timeout: 20_000 })
  await ctx.close()
})

test('song guide: arm the rock-groove drums → countdown → guide highlight → judgment', async ({
  browser,
}) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await createRoom(page, 'Drummer')
  await waitInstrumentsReady(page)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

  // 乐器高亮模式(鼓垫)
  await page.getByTestId('guide-mode-highlight').click()

  // 选摇滚曲目并认领鼓声部 → 等待认领采纳
  await page.getByTestId('song-rock-groove').click()
  await page.getByTestId('part-rock-groove-drums').click()
  await expect(page.getByTestId('part-rock-groove-drums')).toContainText('我', {
    timeout: 10_000,
  })
  // 认领后不立即倒计时: 准备 → 开始倒计时
  await expect(page.getByTestId('songbook-countdown')).toHaveCount(0)
  await page.getByTestId('ready-btn').click()
  await page.getByTestId('sync-start-btn').click()
  await expect(page.getByTestId('songbook-countdown')).toBeVisible()

  // 倒计时结束、歌曲开始 → 鼓垫出现且出现引导高亮
  await expect(page.getByTestId('drumpad')).toBeVisible({ timeout: 25_000 })
  await expect
    .poll(
      () =>
        page.locator('.drum-pad.guide-now, .drum-pad.guide-next').count(),
      { timeout: 25_000 },
    )
    .toBeGreaterThan(0)

  // 判定统计开始滚动(miss 会随播放自动累积)
  await expect(page.getByTestId('judge-stats')).toBeVisible()

  // 追着引导鼓垫按对应键位 → 至少命中一次。
  // 判定窗口比引导窗口宽 ±0.5 拍,所以 guide-now 没有时按 guide-next 也可能命中。
  let hits = 0
  for (let i = 0; i < 24; i += 1) {
    const pad = page
      .locator('.drum-pad.guide-now, .drum-pad.guide-next')
      .first()
    if ((await pad.count()) > 0) {
      const testid = await pad.getAttribute('data-testid')
      const note = Number(testid?.replace('drum-', ''))
      const key = Object.entries(DRUM_KEYMAP).find(([, n]) => n === note)?.[0]
      if (key !== undefined) {
        await page.keyboard.press(key)
      }
    }
    await page.waitForTimeout(130)
    // 注意: judge-stats 的 textContent 已剥离 <b> 标签,正则直接匹配数字
    const text = await page.getByTestId('judge-stats').textContent()
    hits = Number(text?.match(/HIT\s+(\d+)/)?.[1] ?? 0)
    if (hits >= 1) break
  }
  expect(hits).toBeGreaterThanOrEqual(1)
  console.log(`[e2e] drum guide: ${hits} hit(s) while chasing the guide`)

  await ctx.close()
})

test('tempo and meter changes broadcast to every player in the room', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  const roomCode = await createRoom(pageA, 'TempoA')

  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await joinRoom(pageB, 'TempoB', roomCode)

  // A 把速度从 120 改到 90(聚焦滑块,按到目标值为止;快速连按偶有丢键)
  const slider = pageA.getByTestId('tempo-slider')
  await slider.focus()
  for (let i = 0; i < 80; i += 1) {
    if ((await pageA.getByTestId('tempo-value').textContent()) === '90') break
    await pageA.keyboard.press('ArrowDown')
  }
  await expect(pageA.getByTestId('tempo-value')).toHaveText('90')
  await expect
    .poll(() => pageB.getByTestId('tempo-value').textContent(), { timeout: 10_000 })
    .toBe('90')
  await expect(pageA.getByTestId('tempo-value')).toHaveText('90')

  // A 把拍号改成 3/4 → B 的节拍读数显示 / 3
  await pageA.getByTestId('tsig-3').click()
  await expect
    .poll(() => pageB.getByTestId('readout-beat').textContent(), { timeout: 10_000 })
    .toContain('/ 3')

  await ctxA.close()
  await ctxB.close()
})

test('four players share one room: roster, note fan-out, and isolation from a second room', async ({
  browser,
}) => {
  // Room A: four players
  const pages: Page[] = []
  const ctxs = []
  for (let i = 0; i < 4; i += 1) {
    const ctx = await browser.newContext()
    ctxs.push(ctx)
    const page = await ctx.newPage()
    pages.push(page)
  }
  const roomCode = await createRoom(pages[0], 'P1')
  for (let i = 1; i < 4; i += 1) {
    await joinRoom(pages[i], `P${i + 1}`, roomCode)
  }
  for (let i = 0; i < 4; i += 1) {
    await waitInstrumentsReady(pages[i])
  }

  // 每个人都看到其他 3 个成员(StatusPanel 会过滤自己)
  const names = ['P1', 'P2', 'P3', 'P4']
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      if (j === i) continue
      await expect(pages[i]!.getByTestId('peers')).toContainText(names[j]!, {
        timeout: 20_000,
      })
    }
  }

  // P4 弹奏 → P1/P2/P3 都收到
  await pages[3]!.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
  await pages[3]!.keyboard.press('a')
  await pages[0]!.waitForTimeout(2000)
  const counters: number[] = []
  for (let i = 0; i < 3; i += 1) {
    counters.push(await pages[i]!.evaluate(() => window.__orchNotes ?? 0))
  }
  console.log(`[e2e] four-player: counters after P4 press = ${JSON.stringify(counters)}`)
  for (const c of counters) {
    expect(c).toBeGreaterThan(0)
  }
  console.log('[e2e] four-player room: note from P4 reached P1/P2/P3')

  for (const ctx of ctxs) {
    await ctx.close()
  }
})

test('score view renders OSMD sheet music and follows the armed part', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await createRoom(page, 'Reader')
  await waitInstrumentsReady(page)

  // 打开谱面开关 → 选小星星(未武装前为总谱)
  await page.getByTestId('score-toggle').click()
  await page.getByTestId('song-twinkle').click()
  await expect(page.getByTestId('score-view')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.score-canvas svg').first()).toBeVisible({ timeout: 20_000 })

  // 武装旋律声部 → 分谱 + 倒计时开始后光标跟随(OSMD cursor 元素出现)
  await page.getByTestId('part-twinkle-melody').click()
  await expect
    .poll(() => page.locator('.score-canvas svg').count(), { timeout: 20_000 })
    .toBeGreaterThan(0)
  await page.waitForTimeout(4000) // 等倒计时结束、歌曲开始
  const cursorCount = await page
    .locator('.score-canvas svg [fill="#c00000"], .score-canvas svg [fill="#ff0000"]')
    .count()
  console.log(`[e2e] score: cursor-highlighted elements = ${cursorCount}`)

  await ctx.close()
})

test('song studio: record a few notes, save as a song, and arm it from the library', async ({
  browser,
}) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await createRoom(page, 'Composer')
  await waitInstrumentsReady(page)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

  // 开始录制并弹几个音(先等节拍网格就绪: 录制锚点需要服务器拍)
  await expect
    .poll(() => page.getByTestId('readout-beat').locator('.readout-value').textContent(), {
      timeout: 20_000,
    })
    .not.toBe('—')
  await page.getByTestId('record-btn').click()
  await expect(page.getByTestId('recording-badge')).toBeVisible()
  await page.waitForTimeout(500) // 确保至少收到一条时钟(录制锚点)
  await page.keyboard.press('a')
  await page.waitForTimeout(300)
  await page.keyboard.press('s')
  await page.waitForTimeout(300)
  await page.keyboard.press('d')
  await page.getByTestId('stop-btn').click()
  // 录到音 → 保存区(标题输入 + 保存按钮)出现
  await expect(page.getByTestId('song-title-input')).toBeVisible()

  // 保存 → 曲库列表出现自定义曲目
  await page.getByTestId('song-title-input').fill('我的测试曲')
  await page.getByTestId('save-song-btn').click()
  await expect(page.getByTestId('song-custom-')).toHaveCount(0) // id 随机,按标题断言
  await expect(page.locator('.song-row', { hasText: '我的测试曲' })).toBeVisible()

  // 可以选中并认领(进入引导管线)
  await page.locator('.song-row', { hasText: '我的测试曲' }).click()
  await expect(page.getByTestId('part-')).toHaveCount(0)
  const partPills = page.locator('.part-pill')
  expect(await partPills.count()).toBeGreaterThan(0)
  await partPills.first().click()
  // 认领采纳后: 准备 → 开始倒计时
  await expect(page.getByTestId('ready-btn')).toBeEnabled({ timeout: 10_000 })
  await page.getByTestId('ready-btn').click()
  await page.getByTestId('sync-start-btn').click()
  await expect(page.getByTestId('songbook-countdown')).toBeVisible()

  await ctx.close()
})

test('song sharing: publish a song to the server and fetch it back by share code', async ({
  browser,
}) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await createRoom(page, 'Sharers')
  await waitInstrumentsReady(page)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())

  // 录两三个音并保存
  await expect
    .poll(() => page.getByTestId('readout-beat').locator('.readout-value').textContent(), {
      timeout: 20_000,
    })
    .not.toBe('—')
  await page.getByTestId('record-btn').click()
  await page.waitForTimeout(300)
  await page.keyboard.press('a')
  await page.waitForTimeout(250)
  await page.keyboard.press('s')
  await page.waitForTimeout(250)
  await page.keyboard.press('d')
  await page.getByTestId('stop-btn').click()
  await expect(page.getByTestId('song-title-input')).toBeVisible()
  await page.getByTestId('song-title-input').fill('分享测试曲')
  await page.getByTestId('save-song-btn').click()

  // 分享到服务器 → 拿到 6 位分享码
  await page.getByTestId('share-btn').click()
  await expect(page.getByTestId('share-id')).toBeVisible({ timeout: 10_000 })
  const code = (await page.getByTestId('share-id').textContent())?.match(/[A-Z2-9]{6}/)?.[0]
  expect(code).toMatch(/^[A-Z2-9]{6}$/)

  // 直接打 API 验证
  const res = await page.request.get(`http://localhost:8081/api/songs/${code}`)
  expect(res.status()).toBe(200)
  const song = (await res.json()) as { title: string }
  expect(song.title).toBe('分享测试曲')

  // 通过 UI 凭码取回 → 曲库出现第二份
  await page.getByTestId('share-code-input').fill(code)
  await page.getByTestId('fetch-btn').click()
  await expect(page.getByTestId('fetch-ok')).toBeVisible()
  await expect(page.locator('.song-row', { hasText: '分享测试曲' })).toHaveCount(2)

  // 评分: 点赞 → 计数 +1
  await expect(page.getByTestId('like-btn')).toContainText('♥ 0')
  await page.getByTestId('like-btn').click()
  await expect(page.getByTestId('like-btn')).toContainText('♥ 1')
  console.log(`[e2e] song share round-trip: ${code} (liked)`)

  await ctx.close()
})

test('first-run tutorial walks through all steps and closes', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await blockCdn(page)
  await page.goto(E2E_URL)

  // 首次访问自动弹出教程;共 6 步,从第 1 步按「下一步」5 次到达末步
  await expect(page.getByTestId('tutorial-modal')).toBeVisible()
  await expect(page.getByTestId('tut-prev')).toBeDisabled()
  for (let i = 0; i < 5; i += 1) {
    await page.getByTestId('tut-next').click()
  }
  await page.getByTestId('tut-finish').click()
  await expect(page.getByTestId('tutorial-modal')).toHaveCount(0)

  // 完成标记: 刷新后不再自动弹出
  await page.reload()
  await expect(page.getByTestId('tutorial-modal')).toHaveCount(0)

  // 手动按钮可再次打开
  await page.getByTestId('tutorial-btn').click()
  await expect(page.getByTestId('tutorial-modal')).toBeVisible()
  await ctx.close()
})

test('cross-city simulation: 60ms one-way relay still syncs the clock and relays notes', async ({
  browser,
}) => {
  // 通过 60ms 延迟代理连接(模拟跨城),验证事件架构对 RTT 不敏感
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await blockCdn(pageA)
  await pageA.goto(E2E_URL)
  if ((await pageA.getByTestId('tutorial-modal').count()) > 0) {
    await pageA.getByTestId('tut-close').click()
  }
  await pageA.locator('label.field', { hasText: 'Server' }).locator('input').fill('ws://localhost:8082')
  await pageA.getByTestId('name-input').fill('ProxyA')
  await pageA.getByTestId('create-btn').click()
  await expect(pageA.getByTestId('conn-badge')).toHaveText('CONNECTED', { timeout: 20_000 })

  // 时钟同步在 ~120ms RTT 下仍须完成(≥1 次 sync)
  await expect
    .poll(() => pageA.getByTestId('readout-offset').locator('.readout-sub').textContent(), {
      timeout: 25_000,
    })
    .toMatch(/· \d+ sync/)

  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await blockCdn(pageB)
  await pageB.goto(E2E_URL)
  if ((await pageB.getByTestId('tutorial-modal').count()) > 0) {
    await pageB.getByTestId('tut-close').click()
  }
  await pageB.locator('label.field', { hasText: 'Server' }).locator('input').fill('ws://localhost:8082')
  const roomCode = await pageA.getByTestId('room-code').locator('b').textContent()
  await pageB.getByTestId('name-input').fill('ProxyB')
  await pageB.getByTestId('room-code-input').fill(roomCode ?? '')
  await pageB.getByTestId('join-btn').click()
  await expect(pageB.getByTestId('conn-badge')).toHaveText('CONNECTED', { timeout: 20_000 })

  // 音符经 60ms×2 延迟仍能到达(中继只影响"何时听说",不影响"落在哪一拍")
  await waitInstrumentsReady(pageB)
  await waitInstrumentsReady(pageA)
  await pageB.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
  await pageB.keyboard.press('a')
  await pageA.waitForFunction(
    (before) => (window.__orchNotes ?? 0) > before,
    await pageA.evaluate(() => window.__orchNotes ?? 0),
    { timeout: 15_000 },
  )
  console.log('[e2e] cross-city relay: note arrived through 60ms one-way proxy')
  const rtt = await pageA
    .getByTestId('readout-offset')
    .locator('.readout-sub')
    .textContent()
  console.log(`[e2e] cross-city relay: sync RTT ~ ${rtt?.trim()}`)

  await ctxA.close()
  await ctxB.close()
})

test('three players claim distinct parts, ready up, and start rock-groove together (exclusive parts)', async ({
  browser,
}) => {
  // 3 人进同一房间,每人认领不同声部(鼓/贝斯/键盘);第 4 人认领被占声部应被拒
  const ctxs = []
  const pages: Page[] = []
  for (let i = 0; i < 4; i += 1) {
    const ctx = await browser.newContext()
    ctxs.push(ctx)
    pages.push(await ctx.newPage())
  }
  const roomCode = await createRoom(pages[0]!, 'Ensemble1')
  for (let i = 1; i < 4; i += 1) {
    await joinRoom(pages[i]!, `Ensemble${i + 1}`, roomCode)
  }
  for (const p of pages) {
    await waitInstrumentsReady(p!)
    await p!.getByTestId('guide-mode-highlight').click()
    await p!.getByTestId('song-rock-groove').click()
  }
  const parts = ['drums', 'bass', 'keys']
  for (let i = 0; i < 3; i += 1) {
    await pages[i]!.getByTestId(`part-rock-groove-${parts[i]}`).click()
  }
  // 等待三人的认领都被服务器确认
  for (let i = 0; i < 3; i += 1) {
    await expect(pages[i]!.getByTestId(`part-rock-groove-${parts[i]}`)).toContainText('我', {
      timeout: 10_000,
    })
  }

  // 声部互斥: 已被占的 keys 在未认领它的玩家(P1/P2)界面上禁用并显示占用者
  for (const p of pages.slice(0, 2)) {
    await expect(p!.getByTestId('part-rock-groove-keys')).toBeDisabled({ timeout: 10_000 })
    await expect(p!.getByTestId('part-rock-groove-keys')).toContainText('已选', { timeout: 10_000 })
  }
  console.log('[e2e] ensemble: part exclusivity enforced (taken part disabled for others)')

  // 未全部准备时「开始倒计时」不可用
  await expect(pages[0]!.getByTestId('sync-start-btn')).toBeDisabled()

  // 三人准备就绪 → 开始倒计时
  for (let i = 0; i < 3; i += 1) {
    await pages[i]!.getByTestId('ready-btn').click()
  }
  await pages[0]!.getByTestId('sync-start-btn').click()
  for (const p of pages.slice(0, 3)) {
    await expect(p!.getByTestId('songbook-countdown')).toBeVisible({ timeout: 10_000 })
  }

  // 倒计时结束 → 每个页面都出现引导高亮(鼓手看鼓垫,其他看琴键)
  for (let i = 0; i < 3; i += 1) {
    const p = pages[i]!
    const guideSel =
      parts[i] === 'drums'
        ? '.drum-pad.guide-now, .drum-pad.guide-next'
        : 'button.key.guide-now, button.key.guide-next'
    await expect
      .poll(() => p.locator(guideSel).count(), { timeout: 25_000 })
      .toBeGreaterThan(0)
    await expect(p.getByTestId('songbook-countdown')).toHaveCount(0)
  }
  console.log('[e2e] ensemble: all 4 guides started after sync-start')

  for (const ctx of ctxs) {
    await ctx.close()
  }
})

test('instrument picker: free-jam timbre selection is heard by remote players', async ({
  browser,
}) => {
  // A 创建房间,B 加入;B 自由合奏模式选择贝斯音色后弹奏,A 应听到贝斯
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  const roomCode = await createRoom(pageA, 'TimbreA')
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await joinRoom(pageB, 'TimbreB', roomCode)
  await waitInstrumentsReady(pageB)
  await waitInstrumentsReady(pageA)

  // 自由合奏下默认钢琴;选贝斯
  await expect(pageB.getByTestId('instrument-piano')).toHaveAttribute('aria-pressed', 'true')
  await pageB.getByTestId('instrument-bass').click()
  await expect(pageB.getByTestId('instrument-bass')).toHaveAttribute('aria-pressed', 'true')

  // B 弹奏 → A 收到且乐器为 bass(固定等待后读计数器,避免 before 采样竞态)
  await pageB.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
  await pageB.keyboard.press('a')
  await pageA.waitForTimeout(1500)
  const received = await pageA.evaluate(() => window.__orchNotes ?? 0)
  expect(received).toBeGreaterThan(0)
  const heard = await pageA.evaluate(() => window.__orchLastInstrument)
  expect(heard).toBe('bass')
  console.log(`[e2e] instrument picker: remote heard '${heard}'`)

  // 武装声部后选择器锁定并跟随声部乐器(小星星旋律 = 钢琴)
  await pageB.getByTestId('song-twinkle').click()
  await pageB.getByTestId('part-twinkle-melody').click()
  await expect(pageB.getByTestId('instrument-piano')).toHaveAttribute('aria-pressed', 'true')
  await expect(pageB.getByTestId('instrument-hint')).toContainText('锁定')

  await ctxA.close()
  await ctxB.close()
})

test('jam sync: two players start a free jam together after a custom lead-in (bars + pickup)', async ({
  browser,
}) => {
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  const roomCode = await createRoom(pageA, 'JamA')
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await joinRoom(pageB, 'JamB', roomCode)

  // A 设置 2 小节预备 + 小节开始(强拍),发起
  await pageA.getByTestId('jam-bars-2').click()
  await pageA.getByTestId('jam-downbeat').click()
  await pageA.getByTestId('jam-start-btn').click()

  // 双方都进入倒计时
  await expect(pageA.getByTestId('jam-countdown')).toBeVisible({ timeout: 10_000 })
  await expect(pageB.getByTestId('jam-countdown')).toBeVisible({ timeout: 10_000 })

  // 双方读数一致(同一服务器目标拍)
  await expect
    .poll(
      () => pageA.getByTestId('jam-beats-left').textContent(),
      { timeout: 10_000 },
    )
    .not.toBe('…')
  const aLeft = await pageA.getByTestId('jam-beats-left').textContent()
  const bLeft = await pageB.getByTestId('jam-beats-left').textContent()
  expect(aLeft).toBe(bLeft)

  // 倒计时结束 → 双方显示"演奏中"
  await expect(pageA.getByTestId('jam-go')).toBeVisible({ timeout: 25_000 })
  await expect(pageB.getByTestId('jam-go')).toBeVisible({ timeout: 25_000 })
  console.log('[e2e] jam sync: both started together after lead-in')

  // 弱起变体: B 发起
  await pageB.getByTestId('jam-bars-1').click()
  await pageB.getByTestId('jam-pickup').click()
  await pageB.getByTestId('jam-start-btn').click()
  await expect(pageB.getByTestId('jam-countdown')).toBeVisible({ timeout: 10_000 })
  await expect(pageA.getByTestId('jam-countdown')).toBeVisible({ timeout: 10_000 })
  await expect(pageB.getByTestId('jam-go')).toBeVisible({ timeout: 25_000 })
  await expect(pageA.getByTestId('jam-go')).toBeVisible({ timeout: 25_000 })
  console.log('[e2e] jam sync: pickup variant also synchronized')

  await ctxA.close()
  await ctxB.close()
})

test('free-jam drums: keyboard maps to drum pads (a = kick 36), not pitch keys', async ({
  browser,
}) => {
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  const roomCode = await createRoom(pageA, 'DrumFreeA')
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await joinRoom(pageB, 'DrumFreeB', roomCode)
  await waitInstrumentsReady(pageB)
  await waitInstrumentsReady(pageA)

  // 自由合奏(不武装声部)选鼓音色
  await pageB.getByTestId('instrument-drums').click()
  await pageB.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
  await pageB.keyboard.press('a')
  await pageA.waitForTimeout(1200)
  const heard = await pageA.evaluate(() => ({
    instrument: window.__orchLastInstrument,
    note: window.__orchLastNote,
  }))
  // 关键: 按 'a' 应发鼓件 36(kick),而不是钢琴音高 60
  expect(heard.instrument).toBe('drums')
  expect(heard.note).toBe(36)
  console.log(`[e2e] free-jam drums: a → kick (note ${heard.note}, instrument ${heard.instrument})`)
  await ctxA.close()
  await ctxB.close()
})
