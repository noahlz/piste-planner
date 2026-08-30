// Live smoke test — drives the running app in a real browser.
//
// The unit suite checks the engine and components in isolation. This checks the
// thing a user touches: that a template applies, a schedule renders, a derived
// table follows an edit without a re-run, and a shared URL reproduces it.
//
//   pnpm dev &                 # or any server on SMOKE_BASE
//   node scripts/smoke.mjs
//
// Env:
//   SMOKE_BASE      app URL (default http://localhost:5173/piste-planner/)
//   SMOKE_CHROME    explicit browser executable, else the ms-playwright cache
//   SMOKE_FULLPAGE  set to 1 for full-page screenshots (large; costly to read)
//
// Exit 0 with "SMOKE PASS" on the last line, or exit 1 naming the failed step.
//
// Locators are the fragile part. Every selector here was corrected against the
// real DOM at least once — the picker is a ToggleGroup not a select, "Number of
// strips" matches three elements unless scoped by role, the share button reads
// "Generate Link", and the page has several tables. Fix them here rather than
// rediscovering them in a scratch file.

import { chromium } from 'playwright-core'
import { homedir } from 'node:os'
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:5173/piste-planner/'
const FULLPAGE = process.env.SMOKE_FULLPAGE === '1'
const SHOTS = new URL('./smoke-shots/', import.meta.url).pathname

/** Newest chromium in the playwright cache, so a browser update does not break this. */
function findChrome() {
  if (process.env.SMOKE_CHROME) return process.env.SMOKE_CHROME
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  if (!existsSync(cache)) return undefined
  const builds = readdirSync(cache)
    .filter((d) => d.startsWith('chromium-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const b of builds) {
    const exe = join(
      cache,
      b,
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    )
    if (existsSync(exe)) return exe
  }
  return undefined
}

mkdirSync(SHOTS, { recursive: true })

const errors = []
const browser = await chromium.launch({ executablePath: findChrome() })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: FULLPAGE })
const log = (...a) => console.log('[smoke]', ...a)

// ── Single Page layout ──
await page.goto(BASE)
await page.getByRole('tab', { name: 'Single Page' }).click()
await page.getByText('Save / Load / Share').waitFor()
await shot('01-initial')

// Template picker is a ToggleGroup, not a select.
await page.getByText('ROC Div1A/Vet', { exact: true }).click()
log('template applied')

// "Number of strips" matches three elements unless scoped to the spinbutton role.
await page.getByRole('button', { name: 'Suggest' }).first().click()
const strips = await page.getByRole('spinbutton', { name: 'Number of strips' }).inputValue()
log('suggested strips =', strips)
await shot('02-configured')

const gen = page.getByRole('button', { name: 'Generate Schedule' })
if (await gen.isDisabled()) {
  await shot('02b-generate-disabled')
  throw new Error('Generate Schedule disabled — read smoke-shots/02b for the blocking findings')
}
await gen.click()
await page.waitForTimeout(300)
await shot('03-schedule')

const rowCount = await page.locator('table tbody tr').count()
log('schedule table rows =', rowCount)
if (rowCount < 5) throw new Error('schedule table did not render rows')

// P2 deleted the staleness surface; nothing should reintroduce it.
const body = await page.textContent('body')
for (const w of ['stale', 'outdated', 'out of date', 'Run Validate']) {
  if (body.toLowerCase().includes(w.toLowerCase())) throw new Error(`staleness text found: ${w}`)
}
log('no staleness text')

// Editing a fencer count must move the derived table with no explicit re-run.
// Scope to the schedule table by a column header — the page has several tables.
const schedTable = page
  .locator('table')
  .filter({ has: page.getByRole('columnheader', { name: 'Pool Start' }) })
const before = await schedTable.textContent()
const fencerInput = page.getByRole('spinbutton', { name: /Fencer count for/ }).first()
log('editing:', await fencerInput.getAttribute('aria-label'))
await fencerInput.fill('99')
await fencerInput.blur()
await page.waitForTimeout(400)
const after = await schedTable.textContent()
if (before === after) throw new Error('derived schedule table did not update after fencer-count edit')
log('derived table followed the edit')
await shot('04-after-edit')

// Share URL round-trip: a shared link must reproduce the same schedule.
await page.getByRole('button', { name: 'Generate Link' }).click()
const shareUrl = await page.locator('input[readonly]').first().inputValue()
log('share url length =', shareUrl.length)
const rowsNow = await page.locator('table tbody tr').count()
const page2 = await ctx.newPage()
page2.on('pageerror', (e) => errors.push('p2: ' + e))
await page2.goto(shareUrl)
await page2.getByRole('tab', { name: 'Single Page' }).click()
await page2.getByText('Save / Load / Share').waitFor()
await page2.waitForTimeout(300)
const rows2 = await page2.locator('table tbody tr').count()
log('round-trip rows:', rowsNow, 'vs', rows2)
await page2.screenshot({ path: `${SHOTS}05-roundtrip.png`, fullPage: FULLPAGE })
if (rows2 !== rowsNow) throw new Error(`share round-trip row mismatch ${rowsNow} != ${rows2}`)
await page2.close()

// ── Wizard layout ──
// P3 deletes the wizard and the layout toggle. Delete this block in that feature
// rather than letting it fail; the assertions above move to the new shell.
await page.getByRole('tab', { name: 'Wizard' }).click()
await shot('06-wizard-step1')
for (let i = 0; i < 3; i++) {
  const next = page.getByRole('button', { name: /Next|View Schedule/ })
  if (await next.isDisabled()) {
    await shot(`06b-wizard-blocked-step${i}`)
    throw new Error(`wizard blocked at step ${i}`)
  }
  await next.click()
  await page.waitForTimeout(200)
}
await shot('07-wizard-step4')
const wizBody = await page.textContent('body')
if (wizBody.toLowerCase().includes('stale')) throw new Error('staleness text in wizard')
await page.getByRole('button', { name: 'View Schedule' }).click()
await page.waitForTimeout(300)
await shot('08-wizard-schedule')
log('wizard schedule rows =', await page.locator('table tbody tr').count())

await browser.close()
log('console errors =', errors.length, errors.slice(0, 3))
if (errors.length) throw new Error('console errors: ' + errors.join(' | '))
log('SMOKE PASS')
