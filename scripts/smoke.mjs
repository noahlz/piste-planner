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
//
// T052: the scorecard block runs at boot, on B1, before the template picker
// touches anything. The trap it is built around is that the baseline is frozen
// from the very auto-schedule that boot performs, so on the first frame every
// `[data-metric-delta]` reads zero — an assertion that a delta *element* is
// present passes on an app whose deltas never move. So the driver captures a
// delta's text, changes the top bar's strip count, and requires the text to
// have changed to a non-zero magnitude. It varies strips and never a fencer
// count: `computePoolStructure` throws for `fencerCount <= 1`.
//
// T066: the last block drives US4's clarification — a tournament type change
// re-resolves what follows a default and leaves a hand-set value alone. Every
// locator it needed matched the real DOM first try; the corrections it does
// encode are two name-matching ones, since Playwright's `name` is a
// case-insensitive *substring* by default. The top bar's "Tournament type"
// needs `exact` because the rail's Tournament panel holds a second control
// over the same store field whose accessible name is its <Label>, "Type", and
// a competition's name is a prefix of its siblings', so `Referees for …`
// needs it too. The summary element is reached through the trigger's
// `aria-describedby` id rather than by text, and that id comes from React's
// `useId` — ":r7:" and the like — so it is quoted into an attribute selector
// rather than written as `#id`, which those colons are not valid in.

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

// ── Scorecard (T052, US3) ──
// Read here, at boot on B1, before the template picker below changes the
// tournament. The baseline is frozen from the same auto-schedule the boot
// count above asserts (research D9), so on this frame every delta is zero —
// which is exactly why "a [data-metric-delta] element exists" proves nothing,
// and why the strip-count step below is the one that has to make a delta
// actually move.
const scorecard = page.getByRole('region', { name: 'Scorecard' })
await scorecard.waitFor()

/** Every metric row id currently in the scorecard's DOM, in render order. */
const metricIds = () =>
  scorecard
    .locator('li[data-metric]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-metric')))

// Collapsed shows the two collapsed-tier rows and nothing else. The list is
// compared whole and in order, not as a subset: that is what makes this an
// assertion that the expanded rows are *absent from the DOM* rather than
// merely invisible — a hidden row would still satisfy a subset check, and
// jsdom's inability to tell those apart is precisely the gap this driver
// exists to cover.
const details = page.getByRole('button', { name: 'Scorecard details' })
if ((await details.getAttribute('aria-expanded')) !== 'false') {
  throw new Error('scorecard did not boot collapsed (viewState default scorecardExpanded=false)')
}
const collapsedIds = await metricIds()
if (collapsedIds.join(',') !== 'finish:tournament,refs:peak-total') {
  throw new Error(
    `collapsed scorecard rows: expected finish:tournament,refs:peak-total, got ${collapsedIds.join(',')}`,
  )
}
for (const id of collapsedIds) {
  const value = (await scorecard.locator(`li[data-metric="${id}"] [data-metric-value]`).textContent())?.trim()
  if (!value) throw new Error(`collapsed metric ${id} rendered no value`)
}
log('scorecard collapsed:', collapsedIds.join(', '))

// Expanded renders the full set selectScorecardMetrics assembles, in its
// order, with one `finish:day:<d>` row per day. The day count is read off the
// top bar rather than typed here, so the drawer and the top bar are checked
// against each other — the same app-against-app rule the matrix/schedule
// comparison below follows, not a literal that would need editing whenever
// the default preset changes.
await details.click()
if ((await details.getAttribute('aria-expanded')) !== 'true') {
  throw new Error('Scorecard details did not report aria-expanded=true after the click')
}
const dayCountText = (await page.getByRole('combobox', { name: 'Day count' }).textContent()) ?? ''
const dayCount = Number(dayCountText.match(/\d+/)?.[0])
if (!dayCount) throw new Error(`could not read the top bar day count (got "${dayCountText}")`)
const expectedMetricIds = [
  'finish:tournament',
  'refs:peak-total',
  ...Array.from({ length: dayCount }, (_, d) => `finish:day:${d}`),
  'refs:peak-sabre',
  'strips:utilization',
  'days:balance-spread',
  'findings:ERROR',
  'findings:WARN',
  'findings:INFO',
]
const expandedIds = await metricIds()
if (expandedIds.join(',') !== expectedMetricIds.join(',')) {
  throw new Error(
    `expanded scorecard rows:\n  expected ${expectedMetricIds.join(',')}\n  got      ${expandedIds.join(',')}`,
  )
}
log('scorecard expanded:', expandedIds.length, 'rows over', dayCount, 'days')
await shot('01b-scorecard')

// FR-029: hovering a metric lights the blocks that drive it. "Strip
// utilization" is the metric to hover — its driving set is every in-range
// placed block, so whatever the canvas has in its window is in it. A metric
// with a narrower set (a day finish, a findings count) can legitimately name
// only blocks that are scrolled out of the window, and would make this
// assertion flaky rather than strict.
const blocksAtBoot = await page.locator('[data-event-block]').count()
if (blocksAtBoot === 0) throw new Error('no matrix blocks at boot to check the metric highlight against')
if ((await page.locator('[data-event-block][data-highlighted="true"]').count()) !== 0) {
  throw new Error('a block was already highlighted before any metric was hovered')
}
await scorecard.locator('li[data-metric="strips:utilization"]').hover()
await page.waitForTimeout(150)
// Equality, not "at least one": the canvas draws a block only for an in-range
// placed segment (lanes.ts) and this metric's driving set is exactly those, so
// every block on screen has to light. "At least one" would still pass on a
// selector that named only an event's first segment.
const litCount = await page.locator('[data-event-block][data-highlighted="true"]').count()
if (litCount !== blocksAtBoot) {
  throw new Error(
    `hovering Strip utilization lit ${litCount} of the ${blocksAtBoot} blocks on screen; every one drives it (FR-029)`,
  )
}
// The cue has to *paint*, not merely exist. jsdom reads the inline value back
// verbatim, so the unit suite can pin the declaration but not that it resolves
// — the two chrome tokens are the one paint on the canvas that does not come
// from palette.ts, and an unresolved var() would leave FR-029's cue invisible
// with everything above still green.
const cueShadow = await page
  .locator('[data-event-block][data-highlighted="true"] [data-highlight-cue]')
  .first()
  .evaluate((el) => getComputedStyle(el).boxShadow)
if (!cueShadow.includes('inset') || !cueShadow.includes('rgb')) {
  throw new Error(`the highlight cue resolved to no ring at all: box-shadow "${cueShadow}"`)
}
await shot('01c-highlight')
// And it clears when the pointer leaves — the cue is a hover state, not a
// latch. Same corner the tooltip step below moves to.
await page.mouse.move(5, 5)
await page.waitForTimeout(150)
const litAfterLeave = await page.locator('[data-event-block][data-highlighted="true"]').count()
if (litAfterLeave !== 0) {
  throw new Error(`${litAfterLeave} blocks stayed highlighted after the pointer left the metric row`)
}
log('metric hover lit', litCount, 'of', blocksAtBoot, 'blocks, and cleared')

// A delta has to *move*, not merely exist. Strip utilization's denominator is
// strips_total × the day windows, so the top bar's strip count moves it for
// certain. It is a strip count and never a fencer count: computePoolStructure
// (src/engine/pools.ts) throws for fencerCount <= 1 and initialAnalysis calls
// it for every selected competition, so shrinking a fencer count breaks the
// app rather than testing it.
const utilDelta = scorecard.locator('li[data-metric="strips:utilization"] [data-metric-delta]')
if ((await utilDelta.count()) === 0) {
  throw new Error('strip utilization carries no delta at boot — the preset baseline was never captured')
}
const deltaBefore = (await utilDelta.textContent())?.trim()
const stripInput = page.getByRole('spinbutton', { name: 'Strip count' })
const stripsAtBoot = await stripInput.inputValue()
const stripsBumped = Number(stripsAtBoot) + 4
await stripInput.fill(String(stripsBumped))
await stripInput.blur()
await page.waitForTimeout(400)
const deltaAfter = (await utilDelta.textContent())?.trim()
// The minus is U+2212, not a hyphen — formatDelta signs with '+' / '−'.
const deltaMagnitude = Number((deltaAfter ?? '').replace(/[+−\-%]/g, ''))
if (deltaAfter === deltaBefore || !(deltaMagnitude > 0)) {
  throw new Error(
    `strip utilization delta did not move off zero: "${deltaBefore}" -> "${deltaAfter}" (strips ${stripsAtBoot} -> ${stripsBumped})`,
  )
}
log('strips', stripsAtBoot, '->', stripsBumped, 'moved the utilization delta', deltaBefore, '->', deltaAfter)

// Put the strip count back so the template steps below start from the state
// the boot left them, exactly as they did before this block existed.
await stripInput.fill(stripsAtBoot)
await stripInput.blur()
await page.waitForTimeout(400)

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

// ── Gears panel (US5, T077) ──
// Same closed-by-default Collapsible as Save / Share (see the header
// comment) — SettingsPanel's contents are not in the DOM until "Settings" is
// clicked. Placed here, on ROC Div1A/Vet's just-verified schedule, and not
// later in the file: the NAC Cadet/Junior + tournament-type-change block
// below ends with the center dimmed-invalid (confirmed by reading
// `[data-dimmed]` there) — a blocking validation finding from that block's
// own edits freezes the committed schedule regardless of what a setting
// change here would do, so "the schedule follows" cannot be asserted once
// past that point. `schedTable` above is still in scope and still valid.
//
// Save / Share is still open from the round-trip above (its own trigger sits
// right next to the gears trigger, both `absolute right-0` in the same
// header), and its panel overlaps and intercepts pointer events meant for
// Settings underneath it — close it first.
await page.getByRole('button', { name: 'Save / Share' }).click()
await page.getByRole('button', { name: 'Settings' }).click()
const settingsRegion = page.getByRole('region', { name: 'Settings' })
await settingsRegion.waitFor()

// FR-041/SC-009: the panel is reachable, and every row reads its default on
// first open — nothing above this point in the driver touches an engine
// constant (the fencer-count edit above is a per-competition field, not one
// of these). 12 rows total: the 9 in SettingsPanel.ROWS plus
// PoolDurationSettings' own 3, moved in behind this same trigger.
const settingsDefaultCount = () => settingsRegion.getByText('Default', { exact: true }).count()
if ((await settingsDefaultCount()) !== 12) {
  throw new Error(
    `gears panel: expected 12 rows reading Default on first open, got ${await settingsDefaultCount()}`,
  )
}
log('gears panel opened, all 12 settings read Default')
await shot('09-gears-default')

// FR-046: a setting change must move the schedule with no explicit re-run.
// Two settings were tried and rejected before this one, both measured at
// this exact point in the driver (ROC Div1A/Vet, NAC type, Suggested strips,
// fencer count of 99 on the edited competition):
//   - DEFAULT_DE_STRIP_FOOTPRINT: T069 measured that an override only moves
//     anything once it drops below the DE strip grant max_de_strip_pct
//     computes for the fixture; here it stayed at or above that cap, so it
//     changed nothing.
//   - ADMIN_GAP_MINS *increased* by 30 (30 -> 60): every deStart in
//     derive.ts is `poolEnd + ADMIN_GAP_MINS`, so times do move — but
//     validation.ts sums poolDuration + ADMIN_GAP_MINS + deDuration against
//     DAY_LENGTH_MINS, and on a strip-tight template the wider gap pushed a
//     competition over that ceiling. That is a blocking ERROR finding, and
//     CenterView's dimmed-invalid rule (see its own comment) then freezes
//     the committed schedule at its last valid state — confirmed by reading
//     `[data-dimmed]`, which flipped to "true" while the table never moved
//     even though the store had genuinely changed.
// A *decrease* only relaxes that sum, so it can never trigger the same
// freeze — kept here for that reason.
const adminGapInput = settingsRegion.getByRole('spinbutton', { name: 'Admin gap' })
const adminGapDefault = Number(await adminGapInput.inputValue())
const adminGapChanged = adminGapDefault - 15
const scheduleBeforeGap = await schedTable.textContent()
await adminGapInput.fill(String(adminGapChanged))
await adminGapInput.blur()
await page.waitForTimeout(400)
const scheduleAfterGap = await schedTable.textContent()
if (scheduleBeforeGap === scheduleAfterGap) {
  throw new Error('changing Admin gap did not move the schedule table (FR-046)')
}
if ((await page.locator('[data-dimmed]').getAttribute('data-dimmed')) === 'true') {
  throw new Error('Admin gap change left the center dimmed-invalid — the "after" read was not a real committed schedule')
}
log('Admin gap', adminGapDefault, '->', adminGapChanged, 'moved the schedule')
await shot('10-gears-changed')

// FR-044: the revert control actually resets, not just relabels. Cheap once
// the panel is open — nothing else in this driver exercises one.
await settingsRegion.getByRole('button', { name: 'Revert Admin gap to default' }).click()
await page.waitForTimeout(400)
if (Number(await adminGapInput.inputValue()) !== adminGapDefault) {
  throw new Error('Revert Admin gap to default did not restore the default value (FR-044)')
}
if ((await settingsDefaultCount()) !== 12) {
  throw new Error('Revert Admin gap to default did not restore its Default badge (FR-044)')
}
if ((await schedTable.textContent()) !== scheduleBeforeGap) {
  throw new Error('Revert Admin gap to default did not restore the schedule table (FR-044)')
}
log('Revert Admin gap to default restored the default value, badge, and schedule')

// FR-045/SC-007: the override round-trips through a share link, and reads as
// an override on the far side — not merely equal to the default by
// coincidence. Re-apply the change just reverted so there is an override to
// carry. Save / Share was opened once already, above, and nothing has closed
// it since, so click its trigger only if "Generate Link" is not already
// showing — the same defensive check the NAC Cadet/Junior template step
// below uses for its own already-open collapsible.
await adminGapInput.fill(String(adminGapChanged))
await adminGapInput.blur()
await page.waitForTimeout(400)
const generateLinkVisible = await page
  .getByRole('button', { name: 'Generate Link' })
  .isVisible()
  .catch(() => false)
if (!generateLinkVisible) {
  await page.getByRole('button', { name: 'Save / Share' }).click()
}
await page.getByRole('button', { name: 'Generate Link' }).click()
const gearShareUrl = await page.locator('input[readonly]').first().inputValue()
const page3 = await ctx.newPage()
page3.on('pageerror', (e) => errors.push('p3: ' + e))
await page3.goto(gearShareUrl)
await page3.getByRole('button', { name: 'Save / Share' }).waitFor()
await page3.getByRole('button', { name: 'Settings' }).click()
const settingsRegion3 = page3.getByRole('region', { name: 'Settings' })
await settingsRegion3.waitFor()
const adminGapInput3 = settingsRegion3.getByRole('spinbutton', { name: 'Admin gap' })
const adminGapOnLoad = Number(await adminGapInput3.inputValue())
if (adminGapOnLoad !== adminGapChanged) {
  throw new Error(
    `share round-trip lost the Admin gap override: expected ${adminGapChanged}, got ${adminGapOnLoad}`,
  )
}
// The marker, not the value — an implementation that round-tripped the
// number but forgot to mark it non-default would still pass the check above.
const revertVisibleOnLoad = await settingsRegion3
  .getByRole('button', { name: 'Revert Admin gap to default' })
  .isVisible()
  .catch(() => false)
if (!revertVisibleOnLoad) {
  throw new Error(
    'Admin gap round-tripped its value but not its override marker — the far side reads it as Default (FR-045)',
  )
}
log('share round-trip: Admin gap', adminGapChanged, 'arrived marked as an override, not a default')
await page3.screenshot({ path: `${SHOTS}11-gears-roundtrip.png`, fullPage: FULLPAGE })
await page3.close()

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
const teamStrips = await page.getByRole('spinbutton', { name: 'Number of strips' }).inputValue()
log('NAC Cadet/Junior suggested strips =', teamStrips)

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
// Measured against the running app by running this file's exact sequence
// (Presets… → NAC Cadet/Junior → Suggest → Auto-schedule all → Schedule radio
// → count [data-schedule-row]) twice in a row. The strip count is 39 either
// way (baseline.md's fresh-store measurement of Suggest for this template
// recorded 39 too), and the shortfall against 24 is a strip-capacity limit on
// this template, not a regression. This count is measured at this point in the
// driver's accumulated session state — after the ROC template, the
// fencer-count edit to 99, and the share round-trip — not from a fresh boot,
// so it need not match a fresh-store after-column measured elsewhere (e.g.
// T019's handoff).
//
// 2026-08-31 (008): 0 → 15. TEAM entries had carried a percentage cut,
// cut-on-team fired BINDING, and scheduleAllConcurrent returned an empty
// schedule until they were pinned to DISABLED/100.
// 2026-09-01 (004 US4, T066): 15 → 20, re-measured twice. US4 moved the app
// path itself, not this template: research D6 makes an unset `de_mode` resolve
// to the tournament type's mode, so all 24 of these NAC events now schedule
// STAGED where the store used to hardcode SINGLE_STAGE, and T061a gives every
// event `strips_allocated: max(2, ceil(n/7))` where buildConfig used to send 0.
// drift-baseline.md §Part 2 measured both against B1–B8 and attributes exactly
// this kind of movement to them ("re-packing under D6 … and T061a"); five more
// events fitting is that re-pack landing in this template's favour. An
// increase, so constitution III's halt — which is a *drop* in scheduled event
// count — does not apply.
if (teamRowCount !== 20) {
  throw new Error(`NAC Cadet/Junior schedule table rendered ${teamRowCount} rows, expected 20`)
}
await shot('07-team-schedule')

// ── Per-type defaults, and what survives a type change (T066, US4/FR-036) ──
// The clarification US4 exists to settle: changing the tournament type
// re-resolves every setting that is following a default and touches nothing an
// organizer set by hand. Both halves are asserted, because either alone is
// satisfied by a broken app — a survival check passes on an app that resolves
// nothing at all, and a re-resolution check passes on one that overwrites the
// store on every type change.
//
// Runs last, on the 24 events NAC Cadet/Junior just selected, with the type
// still at the NAC that B1's boot preset set. NAC → ROC is the pair that moves
// all three defaults at once (src/store/typeDefaults.ts): referees 2 → 1, video
// strips 8 → 0, DE mode "Staged DE Blocks" → "Single Block".
const advanced = page.getByRole('button', { name: 'Advanced' })
await advanced.click()

// FR-035's summary sits outside CollapsibleContent (Radix unmounts the content
// on close) and the trigger points at it with aria-describedby. Read it through
// that id rather than by its text: the assertion then also fails if the tie
// between trigger and summary is ever dropped, which is the half of FR-035 a
// text locator cannot see. The id comes from React's useId (":r7:" and the
// like), so it is quoted into an attribute selector — those colons are not
// valid in a bare `#id` selector.
const summaryId = await advanced.getAttribute('aria-describedby')
if (!summaryId) throw new Error('the Advanced trigger describes no summary element (FR-035)')
const summaryText = async () => ((await page.locator(`[id="${summaryId}"]`).textContent()) ?? '').trim()

const nacSummary = await summaryText()
if (!nacSummary.includes('Referees per pool: 2') || !nacSummary.includes('DE mode: Staged DE Blocks')) {
  throw new Error(`Advanced summary at a NAC did not read the NAC row of TYPE_DEFAULTS: "${nacSummary}"`)
}

// B1's preset wrote an explicit 12 video strips (applyPreset → setVideoStrips),
// so the count is *not* following the type default yet and the type change
// below would correctly leave it alone. Revert it first (FR-038's control, the
// only way back to the stored null) so it becomes a value that has to move.
await page.getByRole('button', { name: 'Revert video strips to default' }).click()
await page.waitForTimeout(200)
const revertedSummary = await summaryText()
if (!revertedSummary.includes('Video strips: 8')) {
  throw new Error(`reverting video strips did not fall back to the NAC default of 8: "${revertedSummary}"`)
}
log('advanced summary at a NAC:', revertedSummary.replace(/\s+/g, ' '))

// Two events: the first gets a hand-set referee count, the second is left
// following the default. Both start at the store's AUTO marker, which the
// option list names by the count it resolves to.
const refSelects = await page.getByRole('combobox', { name: /^Referees for / }).all()
if (refSelects.length < 2) {
  throw new Error(`the Advanced table offered ${refSelects.length} referee controls; two are needed`)
}
const [handSet, following] = refSelects
const handSetName = await handSet.getAttribute('aria-label')
const followingName = await following.getAttribute('aria-label')
const refText = async (sel) => ((await sel.textContent()) ?? '').trim()
if ((await refText(handSet)) !== 'Auto (2)' || (await refText(following)) !== 'Auto (2)') {
  throw new Error(
    `a fresh event did not start on the type default: "${await refText(handSet)}" / "${await refText(following)}"`,
  )
}

// Exact names throughout: a competition label is a prefix of its Team sibling's
// ("… Épée" vs "… Épée Team"), so the default substring match makes both the
// combobox and the cell lookups below strict-mode violations.
await handSet.click()
await page.getByRole('option', { name: '1 referee', exact: true }).click()
await page.waitForTimeout(200)
if ((await refText(handSet)) !== '1 referee') {
  throw new Error(`setting an explicit referee count did not stick: "${await refText(handSet)}"`)
}

// FR-039's marker is the stored AUTO, never a comparison against the resolved
// count — the cell's `Default` badge is where that shows.
const refCell = (name) => page.locator('td').filter({ has: page.getByRole('combobox', { name, exact: true }) })
const defaultBadges = (name) => refCell(name).getByText('Default', { exact: true }).count()
if ((await defaultBadges(handSetName)) !== 0) {
  throw new Error(`${handSetName} still reads Default after being set by hand`)
}
if ((await defaultBadges(followingName)) !== 1) {
  throw new Error(`${followingName} lost its Default badge without being touched`)
}
log('hand-set:', handSetName, '→ 1 referee; following the default:', followingName)
await shot('08-advanced-nac')

// The type change. The top bar's control, named "Tournament type" — the rail's
// Tournament panel has a second control over the same store field whose
// accessible name is just "Type" (its <Label>), and only an exact match keeps
// "Type" from also matching this one.
await page.getByRole('combobox', { name: 'Tournament type', exact: true }).click()
await page.getByRole('option', { name: 'ROC', exact: true }).click()
await page.waitForTimeout(400)

// Half one — everything that was following a default moved to the ROC row.
const rocSummary = await summaryText()
for (const expected of ['Referees per pool: 1', 'Video strips: 0', 'DE mode: Single Block']) {
  if (!rocSummary.includes(expected)) {
    throw new Error(`NAC → ROC did not re-resolve a default: expected "${expected}" in "${rocSummary}"`)
  }
}
if ((await refText(following)) !== 'Auto (1)') {
  throw new Error(
    `${followingName} was following the NAC default and did not follow ROC's: "${await refText(following)}"`,
  )
}

// Half two — the hand-set count survived (FR-036). And it still reads as *not*
// default: ROC's own default is 1 referee, so an implementation that derived
// the badge by comparing the resolved counts would call this event's explicit
// ONE a default here, which is the exact trap data-model.md §Settings override
// state describes.
if ((await refText(handSet)) !== '1 referee') {
  throw new Error(
    `FR-036 violated: the tournament type change destroyed ${handSetName}'s hand-set referee count ("${await refText(handSet)}")`,
  )
}
if ((await defaultBadges(handSetName)) !== 0) {
  throw new Error(`${handSetName} reads Default at a ROC — the badge is comparing values, not reading the stored marker`)
}
if ((await defaultBadges(followingName)) !== 1) {
  throw new Error(`${followingName} lost its Default badge across the type change`)
}
log('type NAC → ROC: defaults re-resolved,', handSetName, 'kept its hand-set 1 referee')
await shot('08b-advanced-roc')

await browser.close()
log('console errors =', errors.length, errors.slice(0, 3))
if (errors.length) throw new Error('console errors: ' + errors.join(' | '))
log('SMOKE PASS')
