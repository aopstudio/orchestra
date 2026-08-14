import { test, expect, type Page } from '@playwright/test'

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

/** Fill the server + name, connect, and wait until the server has welcomed us in. */
async function connect(page: Page, name: string): Promise<void> {
  await blockCdn(page)
  await page.goto(E2E_URL)
  await page.locator('label.field', { hasText: 'Server' }).locator('input').fill(WS_URL)
  await page.getByTestId('name-input').fill(name)
  await page.getByTestId('connect-btn').click()
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
  // --- page A ---------------------------------------------------------------
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await connect(pageA, 'TestA')

  // All three validation readouts are rendered.
  await expect(pageA.getByTestId('readout-latency')).toBeVisible()
  await expect(pageA.getByTestId('readout-offset')).toBeVisible()
  await expect(pageA.getByTestId('readout-beat')).toBeVisible()

  // --- page B joins ---------------------------------------------------------
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await connect(pageB, 'TestB')

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

  // --- final readout snapshot for the validation report ----------------------
  const snapshot = await pageA.evaluate(() => ({
    latency: document.querySelector('[data-testid="readout-latency"]')?.textContent ?? '',
    offset: document.querySelector('[data-testid="readout-offset"]')?.textContent ?? '',
    beat: document.querySelector('[data-testid="readout-beat"]')?.textContent ?? '',
    peers: document.querySelector('[data-testid="peers"]')?.textContent ?? '',
  }))
  console.log(`[e2e] readout snapshot A: ${JSON.stringify(snapshot)}`)

  await ctxA.close()
  await ctxB.close()
})
