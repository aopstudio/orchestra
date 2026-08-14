const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.getByTestId('name-input').fill('CountA')
  await page.getByTestId('connect-btn').click()
  await page.waitForTimeout(3000)
  await page.getByTestId('song-twinkle').click()
  await page.waitForTimeout(200)

  // 1. Arm part → countdown should appear
  await page.getByTestId('part-twinkle-melody').click()
  const cd1 = await page
    .getByTestId('songbook-countdown')
    .textContent()
    .catch(() => 'none')
  console.log('immediately after arm — countdown:', cd1.trim())

  // 2. Countdown counts down and disappears; guide starts
  const samples = []
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(400)
    const cd = await page
      .getByTestId('songbook-countdown')
      .textContent()
      .catch(() => null)
    const guideNow = await page.locator('button.key.guide-now').count()
    samples.push(`cd:${cd ? cd.trim() : 'none'} guide:${guideNow}`)
  }
  console.log('over 4.8s:', samples.join(' | '))

  // 3. Restart button exists; click it → countdown re-appears
  const restartCount = await page.getByTestId('restart-btn').count()
  await page.getByTestId('restart-btn').click()
  await page.waitForTimeout(300)
  const cdAfterRestart = await page
    .getByTestId('songbook-countdown')
    .textContent()
    .catch(() => 'none')
  const guideAfterRestart = await page.locator('button.key.guide-now').count()
  console.log(
    'after restart — countdown:',
    cdAfterRestart.trim(),
    '| guide-now:',
    guideAfterRestart,
  )
  await page.waitForTimeout(4000)
  const guideResumed = await page.locator('button.key.guide-now').count()
  console.log('4s after restart — guide resumed:', guideResumed)

  const sawCountdown = samples.some((s) => s.startsWith('cd:准备'))
  const guideStartsAfter = samples.some((s) => s.includes('guide:1') || s.includes('guide:2'))
  const restartWorks =
    restartCount === 1 &&
    cdAfterRestart.includes('准备') &&
    guideAfterRestart === 0 &&
    guideResumed >= 1
  console.log('VERDICT:', sawCountdown && guideStartsAfter && restartWorks ? 'PASS' : 'FAIL')
  await browser.close()
})()
