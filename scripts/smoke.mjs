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
//
// T041: the matrix canvas is now the center's default view (FR-023), so every
// step that reads the schedule table has to click the "Schedule" radio in the
// "Center view mode" radiogroup first — nothing with `[data-schedule-row]` is
// in the DOM until then. The reverse held too: the boot assertion below reads
// the matrix region and confirms no schedule table exists yet, before either
// view has been touched.
//
// Every locator this task needed — the region/toolbar/gutter markers,
// `data-event-block`, `data-schedule-row`, `data-cell` — matched the real DOM
// on the first run. The one that didn't: `data-tooltip-field` matches twice
// per field, not once — Radix's Tooltip.Content portals a positioned copy and
// an unpositioned measurement copy (the second wrapped in an extra <span>),
// both carrying identical text, so a bare field locator is a strict-mode
// violation and every read needs `.first()`. The other real subtlety is FR-023's
// cross-view comparison: `eventTimeSegments` (geometry.ts) only emits
// FLIGHT_A/FLIGHT_B blocks for a flighted event, but the schedule table keeps
// one Pool Start/Pool End pair for the whole event, not one per flight — so
// comparing a flight block against that pair fails on a correct app. Only a
// `data-phase="POOLS"` block maps 1:1 onto those two cells (its start/end
// *are* `r.pool_start`/`r.pool_end`), so the comparison is restricted to that
// phase.
//
// The row-count floor this file used to check (`rowCount < 5`) was never
// actually reading the schedule table: `table tbody tr` unscoped counts rows
// across every table on the page (day-header rows included), and happened to
// clear 5 by coincidence. Scoped to `[data-schedule-row]`, ROC Div1A/Vet at
// the Suggested strip count placed only 4 of its 12 competitions at the
// time — attributed then to a genuine strip shortfall. That attribution was
// made while 006's day-axis defect was live (all four day windows sharing
// one day's strip capacity), and it was wrong: re-measured against the
// running app after 006's fix, the same template places all 12 of 12, strip
// count unchanged. The block-count and row-count floors below (T018) are set
// to the numbers actually measured now, not to "non-empty".

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

/** Mirrors src/lib/time.ts — this script has no build step to import it through. */
function formatMinutes(mins) {
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

/** Every block's on-screen box, keyed by its `data-event-block` id, for a before/after zoom diff. */
async function blockGeometrySnapshot() {
  return page.$$eval('[data-event-block]', (els) =>
    Object.fromEntries(
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return [el.getAttribute('data-event-block'), { x: r.x, y: r.y, width: r.width, height: r.height }]
      }),
    ),
  )
}

/** True if any block moved, resized, entered, or left the window between two snapshots. */
function geometryChanged(before, after) {
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[id]
    const b = after[id]
    if (!a || !b) return true
    if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) return true
  }
  return false
}

// ── Workbench shell ──
await page.goto(BASE)
// The workbench is the only layout and boots directly — no tab to select.
// The top bar's "Save / Share" trigger proves the shell (and its top bar)
// mounted; the rail's panels render statically regardless of store data.
await page.getByRole('button', { name: 'Save / Share' }).waitFor()
await shot('01-initial')

// The matrix is the center's default view (FR-023) — it must be what greets a
// fresh load, with no schedule table anywhere in the DOM until "Schedule" is
// picked in the "Center view mode" radiogroup.
await page.getByRole('region', { name: 'Matrix canvas' }).waitFor()
const scheduleRowsAtBoot = await page.locator('[data-schedule-row]').count()
if (scheduleRowsAtBoot !== 0) {
  throw new Error('schedule table already in the DOM before the Schedule view was ever selected')
}
log('opens on the matrix, no schedule table mounted')

// T017/FR-008: the boot-count assertion. B1 (the default preset) places 24
// of its 24 selected events after 006's day-axis fix — measured against the
// running app by switching to Schedule (a real table, not windowed) and back;
// before the fix this same boot placed only 11 of 24
// (specs/006-day-axis-parity/baseline.md). The matrix view itself is windowed
// by viewport (see "Blocks render" below), so it is not read here.
await page.getByRole('radio', { name: 'Schedule' }).click()
await page.waitForTimeout(200)
const bootPlacedCount = await page.locator('[data-schedule-row]').count()
if (bootPlacedCount !== 24) {
  throw new Error(`boot placed-event count regressed: expected 24, got ${bootPlacedCount}`)
}
log('boot places 24 of 24 events')
await page.getByRole('radio', { name: 'Matrix' }).click()
await page.waitForTimeout(200)

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
await shot('03-matrix')

// ── Matrix canvas (T041) ──
// Still on the default view: everything below through "Fit to day" reads the
// matrix, not the schedule table.

// Blocks render. ROC Div1A/Vet at the Suggested strip count now places all
// 12 of its 12 competitions (re-measured after 006's day-axis fix — see the
// header comment; the Unplaced tray is empty). The canvas still windows by
// viewport, not by placement count, so not all 12 placed events have a block
// in the DOM at the default scroll position: measured against the running
// app, 11 render and the twelfth sits below the fold at rowScroll 0. The
// schedule table below is the locator that reads the true placed count; this
// floor only guards against the canvas windowing away everything.
const blockCount = await page.locator('[data-event-block]').count()
log('matrix event blocks =', blockCount)
if (blockCount < 11) throw new Error('matrix canvas rendered fewer blocks than the measured floor after auto-schedule')

// Captured now, before "Fit to day" below can scroll a block out of the
// window and drop its DOM node (windowing culls what is off-window rather
// than hiding it — see the "blocks the window actually shows" comment in
// MatrixCanvas.tsx). Restricted to phase POOLS — see the header comment.
const poolBlocks = await page.$$eval('[data-event-block][data-phase="POOLS"]', (els) =>
  els.slice(0, 5).map((el) => ({
    id: el.getAttribute('data-event-id'),
    day: Number(el.getAttribute('data-day')),
    start: Number(el.getAttribute('data-start')),
    end: Number(el.getAttribute('data-end')),
  })),
)
if (poolBlocks.length === 0) {
  throw new Error('no POOLS-phase blocks found to cross-check against the schedule table')
}
await shot('03b-matrix-blocks')

// A tooltip opens on hover and reads the hovered block's own fields, never a
// value hard-coded here. Radix's Tooltip.Content portals each field twice —
// the positioned copy and an unpositioned one wrapped in an extra <span>,
// both carrying identical text — so every `data-tooltip-field` read below is
// `.first()`.
const firstBlock = page.locator('[data-event-block]').first()
await firstBlock.hover()
await page.waitForTimeout(100)
const tooltipName = (await page.locator('[data-tooltip-field="name"]').first().textContent())?.trim()
if (!tooltipName) throw new Error('tooltip did not open on hover')
const tooltipStart = (await page.locator('[data-tooltip-field="start"]').first().textContent())?.trim()
const tooltipEnd = (await page.locator('[data-tooltip-field="end"]').first().textContent())?.trim()
const hoveredStart = Number(await firstBlock.getAttribute('data-start'))
const hoveredEnd = Number(await firstBlock.getAttribute('data-end'))
if (tooltipStart !== formatMinutes(hoveredStart) || tooltipEnd !== formatMinutes(hoveredEnd)) {
  throw new Error(
    `tooltip time mismatch: block ${formatMinutes(hoveredStart)}–${formatMinutes(hoveredEnd)} vs tooltip ${tooltipStart}–${tooltipEnd}`,
  )
}
log('tooltip reads', tooltipName, tooltipStart, '-', tooltipEnd)
await shot('03c-tooltip')

// The hovered block is Strip 1 at the top of the grid, so its tooltip (side
// "top") pops into the toolbar row above it and intercepts a click there
// until it closes. Move off the canvas and let Radix's exit transition finish
// before touching the toolbar.
await page.mouse.move(5, 5)
await page.waitForTimeout(200)

// A zoom action does something: block geometry before and after "Fit to day"
// must differ somewhere, or the click did nothing.
const beforeGeometry = await blockGeometrySnapshot()
await page.getByRole('button', { name: 'Fit to day' }).click()
await page.waitForTimeout(100)
const afterGeometry = await blockGeometrySnapshot()
if (!geometryChanged(beforeGeometry, afterGeometry)) {
  throw new Error('Fit to day did not change any block geometry')
}
log('Fit to day changed block geometry')

// ── Schedule table ──
// The two views agree (FR-023): the schedule table must describe the same
// events, on the same days, at the same times, as the matrix just did —
// compared against the DOM captured above, never against a value typed here.
await page.getByRole('radio', { name: 'Schedule' }).click()
await page.waitForTimeout(200)

const rowCount = await page.locator('[data-schedule-row]').count()
log('schedule table rows =', rowCount)
// All 12 of ROC Div1A/Vet's 12 competitions place at the Suggested strip
// count — see the "Blocks render" comment above. This is the true count, not
// windowed like the matrix's block count.
if (rowCount !== 12) throw new Error(`schedule table rendered ${rowCount} rows, expected 12`)

for (const b of poolBlocks) {
  const row = page.locator(`[data-schedule-row="${b.id}"]`)
  const dayText = (await row.locator('[data-cell="day"]').textContent()) ?? ''
  const rowDay = Number(dayText.match(/\d+/)?.[0]) - 1
  const poolStartText = (await row.locator('[data-cell="poolStart"]').textContent())?.trim()
  const poolEndText = (await row.locator('[data-cell="poolEnd"]').textContent())?.trim()
  if (rowDay !== b.day) {
    throw new Error(`view mismatch: block ${b.id} day ${b.day} vs schedule table day ${rowDay}`)
  }
  if (poolStartText !== formatMinutes(b.start) || poolEndText !== formatMinutes(b.end)) {
    throw new Error(
      `view mismatch: block ${b.id} ${formatMinutes(b.start)}–${formatMinutes(b.end)} vs table ${poolStartText}–${poolEndText}`,
    )
  }
}
log('matrix and schedule table agree on', poolBlocks.length, 'events (FR-023)')
await shot('04-schedule')

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
await shot('05-after-edit')

// Share URL round-trip: a shared link must reproduce the same schedule.
// "Save / Share" is a closed-by-default collapsible over the unmodified
// <SaveLoadShare /> — its contents (including "Generate Link") are not in
// the DOM until the trigger is clicked.
await page.getByRole('button', { name: 'Save / Share' }).click()
await page.getByRole('button', { name: 'Generate Link' }).click()
const shareUrl = await page.locator('input[readonly]').first().inputValue()
log('share url length =', shareUrl.length)
const rowsNow = await page.locator('[data-schedule-row]').count()
const page2 = await ctx.newPage()
page2.on('pageerror', (e) => errors.push('p2: ' + e))
await page2.goto(shareUrl)
// No layout tab to select on page2 either — same readiness wait as the boot above.
// viewMode persists to localStorage (research D10, viewState.ts), which this
// context already shares from page1's toggle above, so page2 also opens on
// Schedule and needs no toggle click of its own.
await page2.getByRole('button', { name: 'Save / Share' }).waitFor()
await page2.waitForTimeout(300)
const rows2 = await page2.locator('[data-schedule-row]').count()
log('round-trip rows:', rowsNow, 'vs', rows2)
await page2.screenshot({ path: `${SHOTS}06-roundtrip.png`, fullPage: FULLPAGE })
if (rows2 !== rowsNow) throw new Error(`share round-trip row mismatch ${rowsNow} != ${rows2}`)
await page2.close()

// ── Team event cut (008) ──
// Before this feature, defaultCutForEntry gave every TEAM catalogue entry a
// percentage cut inherited from its category, which the engine's cut-on-team
// rule (src/engine/validation.ts) flags BINDING — and scheduleAllConcurrent
// returns an empty schedule whenever any BINDING error is present. NAC
// Cadet/Junior (24 events: CADET+JUNIOR × 3 weapons × 2 genders × IND+TEAM)
// went from an empty board to a real schedule once TEAM entries were pinned
// to DISABLED/100 (src/store/competitionDefaults.ts). Nothing above this
// point touches a team event, so a SMOKE PASS without this step proves
// nothing about that fix.
// The "Presets…" panel the ROC step opened above stays open (nothing closes
// it on selection), so click the trigger only if the template list is not
// already showing.
const teamTemplateVisible = await page
  .getByText('NAC Cadet/Junior', { exact: true })
  .isVisible()
  .catch(() => false)
if (!teamTemplateVisible) {
  await page.getByRole('button', { name: 'Presets…' }).click()
}
await page.getByText('NAC Cadet/Junior', { exact: true }).click()
log('NAC Cadet/Junior template applied')

await page.getByRole('button', { name: 'Suggest' }).first().click()
await page.waitForTimeout(100)

const teamGen = page.getByRole('button', { name: 'Auto-schedule all' })
if (await teamGen.isDisabled()) {
  await shot('07b-team-generate-disabled')
  throw new Error('Auto-schedule all disabled for NAC Cadet/Junior — read smoke-shots/07b for the blocking findings')
}
await teamGen.click()
await page.waitForTimeout(300)

await page.getByRole('radio', { name: 'Schedule' }).click()
await page.waitForTimeout(200)
const teamRowCount = await page.locator('[data-schedule-row]').count()
log('NAC Cadet/Junior schedule table rows =', teamRowCount)
// Measured against the running app 2026-08-31 by running this file's exact
// sequence (Presets… → NAC Cadet/Junior → Suggest → Auto-schedule all →
// Schedule radio → count [data-schedule-row]) twice in a row; both runs
// reported 15 of the template's 24 events placed (Suggest set 15 strips —
// the shortfall is a strip-capacity limit on this template, not a
// regression). Before this feature's fix this count was 0: TEAM entries
// carried a percentage cut, cut-on-team fired BINDING, and
// scheduleAllConcurrent returned an empty schedule.
if (teamRowCount !== 15) {
  throw new Error(`NAC Cadet/Junior schedule table rendered ${teamRowCount} rows, expected 15`)
}
await shot('07-team-schedule')

await browser.close()
log('console errors =', errors.length, errors.slice(0, 3))
if (errors.length) throw new Error('console errors: ' + errors.join(' | '))
log('SMOKE PASS')
