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
// real DOM at least once — the template picker is a ToggleGroup not a select,
// and now sits behind a "Presets…" collapsible trigger in the rail's Events
// panel (Radix unmounts closed content, so the trigger must be clicked first);
// "Number of strips" matches three elements unless scoped by role; the share
// button reads "Generate Link" and lives behind the top bar's "Save / Share"
// collapsible, also closed by default; and the page has several tables. The
// auto-scheduler can also leave a competition unplaced when strips run short
// (no pool_start → no placement, src/store/runActions.ts), so the fencer-edit
// step must pick an input for a placed competition, not just the first one
// alphabetically — the Unplaced tray names the ones to skip. Fix locators here
// rather than rediscovering them in a scratch file.

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

// ── Workbench shell ──
await page.goto(BASE)
// The workbench is the only layout and boots directly — no tab to select.
// The top bar's "Save / Share" trigger proves the shell (and its top bar)
// mounted; the rail's panels render statically regardless of store data.
await page.getByRole('button', { name: 'Save / Share' }).waitFor()
await shot('01-initial')

// Template picker is a ToggleGroup, not a select, and now sits behind the
// rail's "Presets…" collapsible trigger (CompetitionMatrix, Events panel,
// open by default) — Radix unmounts closed content, so click it first.
await page.getByRole('button', { name: 'Presets…' }).click()
await page.getByText('ROC Div1A/Vet', { exact: true }).click()
log('template applied')

// "Number of strips" matches three elements unless scoped to the spinbutton role.
await page.getByRole('button', { name: 'Suggest' }).first().click()
const strips = await page.getByRole('spinbutton', { name: 'Number of strips' }).inputValue()
log('suggested strips =', strips)
await shot('02-configured')

const gen = page.getByRole('button', { name: 'Auto-schedule all' })
if (await gen.isDisabled()) {
  await shot('02b-generate-disabled')
  throw new Error('Auto-schedule all disabled — read smoke-shots/02b for the blocking findings')
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

// The auto-scheduler can leave a competition unplaced when strip capacity runs
// out (an event with no pool_start gets no placement — src/store/runActions.ts,
// predates this feature). The Unplaced tray names those by the same label the
// fencer input's aria-label carries, so ".first()" alphabetically can land on
// one that never renders in the schedule table — pick the first input NOT in
// that tray instead, since that's what this assertion means to edit.
const unplacedText = await page.getByRole('region', { name: 'Unplaced events' }).textContent()
const fencerInputs = await page.getByRole('spinbutton', { name: /Fencer count for/ }).all()
let fencerInput
for (const input of fencerInputs) {
  const label = await input.getAttribute('aria-label')
  if (!unplacedText.includes(label.replace('Fencer count for ', ''))) {
    fencerInput = input
    break
  }
}
if (!fencerInput) throw new Error('no placed competition found to edit its fencer count')
log('editing:', await fencerInput.getAttribute('aria-label'))
await fencerInput.fill('99')
await fencerInput.blur()
await page.waitForTimeout(400)
const after = await schedTable.textContent()
if (before === after) throw new Error('derived schedule table did not update after fencer-count edit')
log('derived table followed the edit')
await shot('04-after-edit')

// Share URL round-trip: a shared link must reproduce the same schedule.
// "Save / Share" is a closed-by-default collapsible over the unmodified
// <SaveLoadShare /> — its contents (including "Generate Link") are not in
// the DOM until the trigger is clicked.
await page.getByRole('button', { name: 'Save / Share' }).click()
await page.getByRole('button', { name: 'Generate Link' }).click()
const shareUrl = await page.locator('input[readonly]').first().inputValue()
log('share url length =', shareUrl.length)
const rowsNow = await page.locator('table tbody tr').count()
const page2 = await ctx.newPage()
page2.on('pageerror', (e) => errors.push('p2: ' + e))
await page2.goto(shareUrl)
// No layout tab to select on page2 either — same readiness wait as the boot above.
await page2.getByRole('button', { name: 'Save / Share' }).waitFor()
await page2.waitForTimeout(300)
const rows2 = await page2.locator('table tbody tr').count()
log('round-trip rows:', rowsNow, 'vs', rows2)
await page2.screenshot({ path: `${SHOTS}05-roundtrip.png`, fullPage: FULLPAGE })
if (rows2 !== rowsNow) throw new Error(`share round-trip row mismatch ${rowsNow} != ${rows2}`)
await page2.close()

await browser.close()
log('console errors =', errors.length, errors.slice(0, 3))
if (errors.length) throw new Error('console errors: ' + errors.join(' | '))
log('SMOKE PASS')
