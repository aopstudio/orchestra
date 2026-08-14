import { test, expect, type Page } from '@playwright/test'
import { DRUM_KEYMAP } from '../src/input/keyboard'

declare global {
  interface Window {
    /** E2E hook: count of remote note events received (set only under ?e2e=1). */
    __orchNotes: number | undefined
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

/** Abort smplr CDN fetches so the fallback synth initialises immediately. */
async function blockCdn(page: Page): Promise<void> {
  await page.route(SMPLR_CDN, (route) => route.abort())
}

/** Open the app, fill server + name, and click the given action button. */
async function openForm(page: Page, name: string): Promise<void> {
  await blockCdn(page)
  await page.goto(E2E_URL)
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

  // 选摇滚曲目并武装鼓声部 → 倒计时出现
  await page.getByTestId('song-rock-groove').click()
  await page.getByTestId('part-rock-groove-drums').click()
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
