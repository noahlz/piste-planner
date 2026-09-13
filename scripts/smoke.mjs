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
// real DOM at least once — the template picker is a Radix Select behind the
// header's "Preset" combobox (its options grouped under "Tournaments" and
// "Templates – invented figures"); "Number of strips" matches three elements
// unless scoped by role and only exists once its panel is open in the tool
// rail; the share control reads "Generate Link" and lives behind the header's
// "Export" popover trigger (Radix unmounts closed popover content, so the
// trigger must be clicked first, and a popover closes on any outside
// pointer-down); and the page has several tables. The auto-scheduler can also
// leave a competition unplaced when strips run short (no pool_start → no
// placement, src/store/runActions.ts), so the fencer-edit step must pick an
// input for a placed competition, not just the first one alphabetically — the
// Unplaced tray names the ones to skip. Fix locators here rather than
// rediscovering them in a scratch file.
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
// T052 (rewritten 013 T014): the status-bar block runs at boot, on B1, before
// the template picker touches anything. D7 retired the collapsible
// scorecard's per-metric delta in favor of three plain footer metrics with no
// captured baseline, so the trap moved: an assertion that a footer metric
// *has a value* passes on an app whose metrics never move. The driver bumps
// the header's strip count instead and requires the footer's strip metric
// text to change alongside it. It varies strips and never a fencer count:
// `computePoolStructure` throws for `fencerCount <= 1`.
//
// T066 (rewritten 013 T014): the last block drives US4's clarification — a
// tournament type change re-resolves what follows a default and leaves a
// hand-set value alone. Every locator it needed matched the real DOM first
// try; the corrections it does encode are two name-matching ones, since
// Playwright's `name` is a case-insensitive *substring* by default. The
// Tournament panel's "Type" combobox needs `exact` since a competition's name
// is a prefix of its siblings', so `Referees for …` needs it too. The retired
// top bar's own "Tournament type" control and the Advanced trigger's
// `aria-describedby` summary link are both gone (013 T009/T010) —
// AdvancedPanel no longer collapses, so its FR-035 summary is read straight
// off the section's first always-rendered `div` instead.

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

// 013 T009: one inspector panel is open at a time, behind the tool rail's five
// named buttons ("Tournament", "Strips & referees", "Events", "Findings",
// "Settings"), each with `aria-pressed`. Pressing the open one closes it;
// pressing another switches to it — so this only clicks when the panel is not
// already the open one, and then waits for the `aside` "Inspector panel" it
// mounts.
//
// `panel` is persisted to `viewState.ts`'s `localStorage`, which every page in
// this driver's shared `ctx` reads on mount — so a fresh `page2`/`page3`
// navigated from a share link does *not* boot with no panel open, it boots
// with whatever panel this function (or a real user) last left open anywhere
// in the context. `pg` defaults to the long-lived `page`; page3's Settings
// round-trip below passes its own page explicitly so this aria-pressed check
// runs against the right one, rather than assuming a "fresh page" with no
// panel state, which cost a 30s timeout the first time this was measured
// against the running app: page3 booted with Settings already open from the
// `page` steps above and the unconditional click on page3 closed it.
async function openPanel(name, pg = page) {
  const button = pg.getByRole('button', { name })
  if ((await button.getAttribute('aria-pressed')) !== 'true') {
    await button.click()
  }
  await pg.getByRole('complementary', { name: 'Inspector panel' }).waitFor()
}

// The inspector panel floats over the canvas by default (undocked, T009) and
// intercepts pointer events on whatever it covers underneath — measured
// against the running app when a hover on a strip-1 matrix block timed out
// with "aside … intercepts pointer events". `InspectorPanel`'s own "Close
// panel" button closes whichever one is open and unmounts the `aside`
// entirely (`WorkbenchShell`'s `panel !== null &&` guard), so this closes it
// before the driver hovers or clicks anything the panel might be covering.
async function closePanel() {
  const aside = page.getByRole('complementary', { name: 'Inspector panel' })
  if (await aside.isVisible().catch(() => false)) {
    await aside.getByRole('button', { name: 'Close panel' }).click()
    await aside.waitFor({ state: 'hidden' })
  }
}

// The template picker is a Radix Select behind the header's "Preset"
// combobox (PresetPicker.tsx), grouped under "Tournaments" (B1-B8) and
// "Templates – invented figures" (the ten template names) — not the retired
// rail's "Presets…" ToggleGroup. Choosing an option re-runs the auto-scheduler
// itself (PresetPicker's `handleChange`), and the Select always closes on a
// choice, so no "is the list already visible" guard is needed the way the old
// collapsible needed one.
async function choosePreset(name) {
  await page.getByRole('combobox', { name: 'Preset' }).click()
  await page.getByRole('option', { name, exact: true }).click()
}

// 013 T018 replaced the Suggest button with a search that runs on open and on
// a debounce, answering into a "Suggested minimum" card the organizer applies
// by hand (research.md D8) — the strip field itself never moves until Apply
// is pressed. This opens the panel, polls (bounded) for
// `[data-suggested-strips]` to hold a number rather than the panel's initial
// em-dash, presses Apply, and returns the stepper's resulting value.
async function pressSuggest(stepName) {
  await openPanel('Strips & referees')
  const suggested = page.locator('[data-suggested-strips]')
  for (let i = 0; i < 60; i++) {
    const text = (await suggested.textContent())?.trim() ?? ''
    if (text !== '' && text !== '—' && !Number.isNaN(Number(text))) break
    await page.waitForTimeout(50)
    if (i === 59) {
      throw new Error(`${stepName}: no suggested strip count appeared within 3s (last read "${text}")`)
    }
  }
  await page.getByRole('button', { name: 'Apply' }).click()
  return page.getByRole('spinbutton', { name: 'Number of strips' }).inputValue()
}

// ── Workbench shell ──
await page.goto(BASE)
// The workbench is the only layout and boots directly — no tab to select.
// The header's "Export" trigger proves the shell (and its header) mounted;
// the rail's panels render statically regardless of store data.
await page.getByRole('button', { name: 'Export' }).waitFor()
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

// ── Status bar (T011a/T014, D7) ──
// The retired scorecard's disclosure, deltas, and hover highlight are gone
// (research D7) — replaced by the always-visible footer's three metrics and
// its `data-counts` triple. Read here, at boot on B1, before the template
// picker below changes the tournament.
const footer = page.getByRole('contentinfo', { name: 'Status bar' })
await footer.waitFor()

const countsText = (await footer.locator('[data-counts]').textContent()) ?? ''
const countsMatch = countsText.match(/^(\d+) placed · (\d+) unplaced · (\d+) pinned$/)
if (!countsMatch) throw new Error(`could not parse footer counts: "${countsText}"`)
const [footerPlaced, footerUnplaced, footerPinned] = countsMatch.slice(1).map(Number)
// Logged beside the schedule-table boot count above, not asserted equal to
// it — the lane packer (footer) and the scheduler (schedule table) can
// legitimately disagree about what counts as "placed".
log('boot placed count: schedule table', bootPlacedCount, 'vs footer', footerPlaced, 'placed /', footerUnplaced, 'unplaced /', footerPinned, 'pinned')

for (const metric of ['finish', 'refs', 'strips']) {
  const value = (await footer.locator(`[data-metric="${metric}"] > span`).last().textContent())?.trim()
  if (!value || value === '—') throw new Error(`footer metric ${metric} read no value at boot: "${value}"`)
}
log('footer metrics all present at boot')

const summaryAtBoot = (await page.locator('[data-summary]').textContent()) ?? ''
const dayCount = Number(summaryAtBoot.match(/(\d+) days/)?.[1])
if (!dayCount) throw new Error(`could not read the header day count (got "${summaryAtBoot}")`)
log('header summary at boot:', summaryAtBoot)
await shot('01b-scorecard')

// A metric has to *move*, not merely exist. Strip use's denominator is
// strips_total × the day windows, so the header's strip count moves it for
// certain — bumping it through the Strips & referees panel, the only place
// that field lives now (T009). It is a strip count and never a fencer count:
// computePoolStructure (src/engine/pools.ts) throws for fencerCount <= 1 and
// initialAnalysis calls it for every selected competition, so shrinking a
// fencer count breaks the app rather than testing it.
await openPanel('Strips & referees')
const stripInput = page.getByRole('spinbutton', { name: 'Number of strips' })
const stripsAtBoot = await stripInput.inputValue()
const stripsBumped = Number(stripsAtBoot) + 4
const stripsMetricBefore = (await footer.locator('[data-metric="strips"] > span').last().textContent())?.trim()
await stripInput.fill(String(stripsBumped))
await stripInput.blur()
await page.waitForTimeout(400)
const stripsMetricAfter = (await footer.locator('[data-metric="strips"] > span').last().textContent())?.trim()
const summaryAfterBump = (await page.locator('[data-summary]').textContent()) ?? ''
if (stripsMetricAfter === stripsMetricBefore) {
  throw new Error(
    `footer strip-use metric did not move: "${stripsMetricBefore}" -> "${stripsMetricAfter}" (strips ${stripsAtBoot} -> ${stripsBumped})`,
  )
}
if (!summaryAfterBump.includes(`${stripsBumped} strips`)) {
  throw new Error(`header summary did not reflect the bumped strip count: "${summaryAfterBump}"`)
}
log('strips', stripsAtBoot, '->', stripsBumped, 'moved the footer strip-use metric', stripsMetricBefore, '->', stripsMetricAfter)

// Put the strip count back so the template steps below start from the state
// the boot left them, exactly as they did before this block existed.
await stripInput.fill(stripsAtBoot)
await stripInput.blur()
await page.waitForTimeout(400)

await choosePreset('ROC Div1A/Vet')
log('template applied')

const strips = await pressSuggest('ROC Div1A/Vet')
log('suggested strips =', strips)
await shot('02-configured')

const gen = page.getByRole('button', { name: 'Auto-assign' })
if (await gen.isDisabled()) {
  await shot('02b-generate-disabled')
  throw new Error('Auto-assign disabled — read smoke-shots/02b for the blocking findings')
}
await gen.click()
await page.waitForTimeout(300)
await shot('03-matrix')

// The Strips & referees panel is still open (floating) from `pressSuggest`
// above and covers the left edge of the canvas underneath it — close it
// before touching any matrix block.
await closePanel()

// ── Matrix canvas (T041) ──
// Still on the default view: everything below through "Fit day" reads the
// matrix, not the schedule table.

// Blocks render. ROC Div1A/Vet at the Suggested strip count now places all
// 12 of its 12 competitions (re-measured after 006's day-axis fix — see the
// header comment; the Unplaced tray is empty). The canvas still culled by
// viewport, not by placement count, so not all 12 placed events have a block
// in the DOM at the default scroll position. The schedule table below is the
// locator that reads the true placed count; this floor only guards against the
// canvas culling away everything.
//
// 011 T013: this floor moved from 11 to 8. `applyTemplate` never touches
// `days_available`, so it stays at boot's B1 value of 4 throughout this whole
// driver — nothing here ever calls setDays. Before this feature the strip
// suggestion was a function of the largest event alone and did not read day
// count, so the old rule and baseline.md's day=3 harness happened to agree.
// T010's busiest-day rule is a function of `days_available` (FR-005) by
// design, so at the app's real days=4 it suggests 23 strips for this template
// where baseline.md's forced days=3 harness measures 30 — both are the rule
// working correctly at different day counts, not a disagreement. 23 strips
// still places all 12 of 12 (re-confirmed via the engine directly), but the
// wider strip axis pushes some of the 12 placed events onto higher strip
// numbers that scroll out of the default viewport, so fewer blocks render
// without scrolling. Measured against the running app, 2026-09-05.
//
// `[M]` 012 T014, 2026-09-06: T007-T011's search-based rule further lowers
// this to 15 strips (baseline.md §5), down from 23. Matrix event blocks
// measured at 14 at that count, still above this floor of 8, so the floor
// below needs no change.
//
// `[M]` 013 T026, 2026-09-13: the canvas no longer culls by viewport — every day group,
// strip row and block is in the DOM inside one native scroller (research D2),
// so the count above is now every placed block rather than the subset a
// viewport happened to show. That can only raise it, so the floor of 8 still
// holds and stays as measured.
const blockCount = await page.locator('[data-event-block]').count()
log('matrix event blocks =', blockCount)
if (blockCount < 8) throw new Error('matrix canvas rendered fewer blocks than the measured floor after auto-schedule')

// Captured now, before the zoom actions below change any geometry. 013 T026
// removed the viewport culling that used to drop a scrolled-out block's DOM node, so
// this is no longer load-bearing against culling — it still reads the blocks
// before the zoom so the table cross-check below compares like with like.
// Restricted to phase POOLS — see the header comment.
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
// "top") pops over whatever is above it and intercepts a click there until it
// closes. Move off the canvas and let Radix's exit transition finish before
// touching the footer.
await page.mouse.move(5, 5)
await page.waitForTimeout(200)

// A zoom action does something: block geometry before and after "Fit day"
// must differ somewhere, or the click did nothing.
//
// 013 T026: the app boots *in* fit mode (DEFAULT_VIEW_STATE.fitting is true),
// so pressing "Fit day" from the opening view would change nothing and this
// check would pass on a dead button. "Zoom in" leaves fit mode for a rung
// first — which is itself a geometry change, percentages to pixels — and
// "Fit day" then has a state to come back from. Both transitions are
// asserted, so the step proves more than it did before, not less. The zoom
// controls live in the footer's `toolbar` "Zoom" now, not in a canvas toolbar.
const zoomToolbar = page.getByRole('toolbar', { name: 'Zoom' })
const beforeGeometry = await blockGeometrySnapshot()
await zoomToolbar.getByRole('button', { name: 'Zoom in' }).click()
await page.waitForTimeout(100)
const rungGeometry = await blockGeometrySnapshot()
if (!geometryChanged(beforeGeometry, rungGeometry)) {
  throw new Error('Zoom in did not change any block geometry')
}
log('Zoom in changed block geometry')

await zoomToolbar.getByRole('button', { name: 'Fit day' }).click()
await page.waitForTimeout(100)
const afterGeometry = await blockGeometrySnapshot()
if (!geometryChanged(rungGeometry, afterGeometry)) {
  throw new Error('Fit day did not change any block geometry')
}
log('Fit day changed block geometry')

// SC-005: step to the top of the ladder from fit mode. "Zoom in" clears
// fitting and advances zoomStep by one each press (zoomLadder.stepZoom); the
// button self-disables once zoomStep reaches MAX_ZOOM_STEP (rung 5, ppm 9.0,
// a 281% readout against the rung-2 100% base). Bounded at 6 presses — a
// button still enabled after that is a defect, not a slow ladder.
const zoomInButton = zoomToolbar.getByRole('button', { name: 'Zoom in' })
const zoomReadoutLocator = page.locator('[data-zoom-readout]')
let zoomInPresses = 0
while (!(await zoomInButton.isDisabled())) {
  if (zoomInPresses >= 6) throw new Error('"Zoom in" did not disable within 6 presses')
  await zoomInButton.click()
  await page.waitForTimeout(100)
  zoomInPresses += 1
}
const maxReadout = (await zoomReadoutLocator.textContent())?.trim()
if (maxReadout !== '281%') {
  throw new Error(`"Zoom in" disabled at readout ${maxReadout}, expected 281% (rung 5)`)
}

// SC-005's "label" is read here as label-or-phase-icon: FR-035 lets a block
// choose either, and D1A-M-SABRE-IND:DE_PRELIMS in B1 (12 strips, 45px wide
// at rung 5) is the case that set it — too narrow for even its category
// label, it draws its phase icon alone instead (Block.tsx, 41dfe0e31f).
const zoomedBlocks = page.locator('[data-event-block]')
const zoomedBlockCount = await zoomedBlocks.count()
for (let i = 0; i < zoomedBlockCount; i += 1) {
  const block = zoomedBlocks.nth(i)
  const weapon = await block.getAttribute('data-weapon')
  if (!weapon) throw new Error(`block ${i} at max zoom has no data-weapon`)
  const labelLocator = block.locator('[data-label]')
  const labelText =
    (await labelLocator.count()) > 0 ? (await labelLocator.textContent())?.trim() : ''
  const hasIcon = (await block.locator('[data-icon]').count()) > 0
  if (!labelText && !hasIcon) {
    throw new Error(`block ${i} at max zoom has neither a label nor an icon`)
  }
}
log('SC-005: zoom in disabled after', zoomInPresses, 'presses at rung 5,', maxReadout, ',', zoomedBlockCount, 'blocks all carry weapon + label/icon')

await zoomToolbar.getByRole('button', { name: 'Reset zoom' }).click()
await page.waitForTimeout(100)
const resetReadout = (await zoomReadoutLocator.textContent())?.trim()
if (resetReadout !== '100%') {
  throw new Error(`"Reset zoom" left readout at ${resetReadout}, expected 100%`)
}
log('Reset zoom returned to 100%')

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
// that tray instead, since that's what this assertion means to edit. The
// fencer inputs live in the Events panel (EventsPanel.tsx, T021), one per
// selected competition, hanging off that competition's pressed chip — so the
// set this loop scans is exactly the selected set.
const unplacedText = await page.getByRole('region', { name: 'Unplaced events' }).textContent()
await openPanel('Events')
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
// "Export" is a Radix Popover trigger over the unmodified <SaveLoadShare />
// logic — its contents (including "Generate Link") are not in the DOM until
// the trigger is clicked, since Radix unmounts closed popover content.
await page.getByRole('button', { name: 'Export' }).click()
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
await page2.getByRole('button', { name: 'Export' }).waitFor()
await page2.waitForTimeout(300)
const rows2 = await page2.locator('[data-schedule-row]').count()
log('round-trip rows:', rowsNow, 'vs', rows2)
await page2.screenshot({ path: `${SHOTS}06-roundtrip.png`, fullPage: FULLPAGE })
if (rows2 !== rowsNow) throw new Error(`share round-trip row mismatch ${rowsNow} != ${rows2}`)
await page2.close()

// ── Gears panel (US5, T077) ──
// Rendered inside the tool rail's Settings panel (T009, InspectorPanel.tsx)
// instead of the retired top bar's gears disclosure. Placed here, on ROC
// Div1A/Vet's just-verified schedule, and not later in the file: the NAC
// Cadet/Junior + tournament-type-change block below ends with the center
// dimmed-invalid (confirmed by reading `[data-dimmed]` there) — a blocking
// validation finding from that block's own edits freezes the committed
// schedule regardless of what a setting change here would do, so "the
// schedule follows" cannot be asserted once past that point. `schedTable`
// above is still in scope and still valid.
//
// Export is still open from the round-trip above. It is a Radix Popover,
// which dismisses on any outside pointer-down — so opening the rail's
// Settings panel (a click outside the popover content) closes it, the same
// mutual exclusion the retired top bar's two sibling overlays once needed
// their own rule for (T079 finding 2).
await openPanel('Settings')
const settingsRegion = page
  .getByRole('complementary', { name: 'Inspector panel' })
  .getByRole('region', { name: 'Settings' })
await settingsRegion.waitFor()
const exportStillOpen = await page
  .getByRole('button', { name: 'Generate Link' })
  .isVisible()
  .catch(() => false)
if (exportStillOpen) {
  throw new Error('opening the Settings panel left Export open — outside pointer-down did not dismiss the popover')
}
log('opening the Settings panel closed Export — the popover dismisses on outside click')

// FR-041/SC-009: the panel is reachable, and every row reads its default on
// first open — nothing above this point in the driver touches an engine
// constant (the fencer-count edit above is a per-competition field, not one
// of these). 5 rows total: the 2 in SettingsPanel.ROWS plus
// PoolDurationSettings' own 3, moved in behind this same trigger. It was 12
// until T078 measured that six of the nine gears rows leave the derived
// schedule byte-identical, and T079 finding 1 cut them to three; a seventh,
// `DE strip footprint`, was cut afterward for a different reason — it moves
// the schedule, but off `de_duration_table` durations calibrated against it,
// so an override desyncs the two rather than doing nothing.
// 4 markers, not 5, since 013 T022: the two gears rows left with the
// global-overrides slice, and the DE mode pills gained one marker of their own
// (it reads Default while the tournament type decides the mode). So the count
// is PoolDurationSettings' 3 weapons plus DE mode's 1. The read is kept rather
// than deleted with the rows it used to count — it is what catches a panel
// that renders but reads every setting as overridden on first open.
const settingsDefaultCount = () => settingsRegion.getByText('Default', { exact: true }).count()
if ((await settingsDefaultCount()) !== 4) {
  throw new Error(
    `Settings panel: expected 4 settings reading Default on first open, got ${await settingsDefaultCount()}`,
  )
}
log('Settings panel opened, all 4 settings read Default')
await shot('09-gears-default')

// FR-046: a setting change must move the schedule with no explicit re-run.
// This was the Admin gap row until 013 T022 deleted it with the
// global-overrides slice; the claim is unchanged and a pool duration now
// carries it. The rejected candidates are kept because each records a trap a
// future re-pointing would otherwise walk back into, all measured at this
// exact point in the driver (ROC Div1A/Vet, NAC type, Suggested strips,
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
// Epee's pool duration sits in that same day-length sum as the first term, so
// the direction rule the Admin gap step settled on carries over unchanged: a
// *decrease* only relaxes the sum and can never trigger the freeze. The
// template is ROC Div1A/Vet, which selects all three weapons across both
// genders, so epee events are on the board for the change to move.
const epeeDurationInput = settingsRegion.getByRole('spinbutton', { name: 'Epee pool round duration' })
const epeeDurationDefault = Number(await epeeDurationInput.inputValue())
const epeeDurationChanged = epeeDurationDefault - 15
const scheduleBeforeDuration = await schedTable.textContent()
await epeeDurationInput.fill(String(epeeDurationChanged))
await epeeDurationInput.blur()
await page.waitForTimeout(400)
const scheduleAfterDuration = await schedTable.textContent()
if (scheduleBeforeDuration === scheduleAfterDuration) {
  throw new Error('changing the epee pool duration did not move the schedule table (FR-046)')
}
if ((await page.locator('[data-dimmed]').getAttribute('data-dimmed')) === 'true') {
  throw new Error('epee pool duration change left the center dimmed-invalid — the "after" read was not a real committed schedule')
}
log('Epee pool duration', epeeDurationDefault, '->', epeeDurationChanged, 'moved the schedule')
await shot('10-gears-changed')

// FR-044: the revert control actually resets, not just relabels. Cheap once
// the panel is open — nothing else in this driver exercises one.
await settingsRegion.getByRole('button', { name: 'Revert Epee to default' }).click()
await page.waitForTimeout(400)
if (Number(await epeeDurationInput.inputValue()) !== epeeDurationDefault) {
  throw new Error('Revert Epee to default did not restore the default value (FR-044)')
}
if ((await settingsDefaultCount()) !== 4) {
  throw new Error('Revert Epee to default did not restore its Default badge (FR-044)')
}
if ((await schedTable.textContent()) !== scheduleBeforeDuration) {
  throw new Error('Revert Epee to default did not restore the schedule table (FR-044)')
}
log('Revert Epee to default restored the default value, badge, and schedule')

// FR-045/SC-007: a setting round-trips through a share link and reads as an
// override on the far side — not merely equal to the default by coincidence.
// The carried setting is DE mode since 013 T022: it is the one setting left
// that a share link can disagree with the tournament type about, which makes
// it the one where "arrived as an override" and "arrived as a default" are
// genuinely different states. Set it to Single on NAC, whose own default is
// Staged, so the far side reading Single proves the payload decided it.
// Opening the Settings panel closed Export (the mutual exclusion asserted
// above), so its trigger has to be clicked again — which in turn closes the
// Settings panel, after the click below has already used it. The visibility
// check is kept rather than an unconditional click so the step survives
// either state, the same defensive shape `openPanel` uses for a panel that
// may already be open.
const deModeGroup = settingsRegion.getByRole('radiogroup', { name: 'DE mode' })
await deModeGroup.getByRole('radio', { name: 'Single' }).click()
await page.waitForTimeout(400)
const generateLinkVisible = await page
  .getByRole('button', { name: 'Generate Link' })
  .isVisible()
  .catch(() => false)
if (!generateLinkVisible) {
  await page.getByRole('button', { name: 'Export' }).click()
}
await page.getByRole('button', { name: 'Generate Link' }).click()
const gearShareUrl = await page.locator('input[readonly]').first().inputValue()
const page3 = await ctx.newPage()
page3.on('pageerror', (e) => errors.push('p3: ' + e))
await page3.goto(gearShareUrl)
await page3.getByRole('button', { name: 'Export' }).waitFor()
// NOT a fresh-page click: `panel` is persisted to `localStorage` (viewState.ts)
// and this driver's pages share one context, so page3 boots with Settings
// already open (left there by the `page` steps above) — an unconditional
// click here closes it instead of opening it. `openPanel` handles either
// state, the same guard it gives the long-lived `page`.
await openPanel('Settings', page3)
const settingsRegion3 = page3
  .getByRole('complementary', { name: 'Inspector panel' })
  .getByRole('region', { name: 'Settings' })
await settingsRegion3.waitFor()
const deModeGroup3 = settingsRegion3.getByRole('radiogroup', { name: 'DE mode' })
const singleChecked = await deModeGroup3
  .getByRole('radio', { name: 'Single' })
  .getAttribute('aria-checked')
if (singleChecked !== 'true') {
  throw new Error(
    `share round-trip lost the DE mode override: expected Single checked, got aria-checked=${singleChecked}`,
  )
}
// The marker, not the checked pill — a payload that carried nothing would
// still show Single checked on a tournament type that defaults to it, and
// would read as Default while doing so. NAC defaults to Staged, so this is
// doubly covered, and the marker is the half that generalises.
const defaultMarkersOnLoad = await settingsRegion3
  .getByText('Default', { exact: true })
  .count()
if (defaultMarkersOnLoad !== 3) {
  throw new Error(
    `DE mode round-tripped its value but not its override marker: expected 3 Default markers (the pool durations only), got ${defaultMarkersOnLoad} (FR-045)`,
  )
}
log('share round-trip: DE mode Single arrived marked as an override, not a default')
await page3.screenshot({ path: `${SHOTS}11-gears-roundtrip.png`, fullPage: FULLPAGE })
await page3.close()

// ── Restore isolation: no control returns `de_mode_override` to null ──
// (handoff.md finding 6), so the Single override set above for the round-trip
// leaks into every template applied after this point — `applyTemplate` keeps
// it across a switch the same way it keeps `days_available`. Clicking Staged
// here writes an explicit STAGED override rather than clearing it, but NAC's
// type default is Staged, so the resolved DE mode every later Suggest sees is
// the same one a fresh store would compute; only the (absent) Default marker
// differs, and nothing after this point reads that marker. 013 T023 measured
// the leak before this step existed: NAC Vet/Div1/Junior's SC-008 read 69
// instead of its fresh-store 80, and NAC Youth read 50 instead of 66. This is
// driver hygiene under D14 (re-point, never rewrite), not an app fix.
await deModeGroup.getByRole('radio', { name: 'Staged' }).click()
await page.waitForTimeout(400)
const stagedChecked = await deModeGroup.getByRole('radio', { name: 'Staged' }).getAttribute('aria-checked')
if (stagedChecked !== 'true') {
  throw new Error(`restoring DE mode to Staged after the round-trip did not check the Staged radio: aria-checked=${stagedChecked}`)
}
log('DE mode restored to Staged after the round-trip, isolating later templates from the leftover Single override')

// ── NAC Div1/Junior (010 R1) ──
// Before R1, indiv-team-same-day blocked D1-M-EPEE-IND + D1-M-EPEE-TEAM's
// worst-case same-day duration (855 vs DAY_LENGTH_MINS 840) and emptied this
// template's whole board at every strip count (baseline.md §3). 80 strips /
// 12 video is the column baseline.md's after-R1 table measured clean through
// the engine (24/24, no ERROR); this is the same claim through the browser.
// Still under tournament type NAC — nothing above this point has changed it.
await choosePreset('NAC Div1/Junior')
log('NAC Div1/Junior template applied')

// Video strips' max is the live strip count, so strips has to commit first —
// filling video to 12 while strips was still ROC's 15 would clamp it to 15.
// Both fields live in the Strips & referees panel (T009).
await openPanel('Strips & referees')
const div1JuniorStrips = page.getByRole('spinbutton', { name: 'Number of strips' })
await div1JuniorStrips.fill('80')
await div1JuniorStrips.blur()
await page.waitForTimeout(200)
const div1JuniorVideo = page.getByRole('spinbutton', { name: 'Number of video strips' })
await div1JuniorVideo.fill('12')
await div1JuniorVideo.blur()
await page.waitForTimeout(200)

const div1JuniorGen = page.getByRole('button', { name: 'Auto-assign' })
if (await div1JuniorGen.isDisabled()) {
  await shot('06b-div1junior-generate-disabled')
  throw new Error('Auto-assign disabled for NAC Div1/Junior — read smoke-shots/06b for the blocking findings')
}
await div1JuniorGen.click()
await page.waitForTimeout(300)

await page.getByRole('radio', { name: 'Schedule' }).click()
await page.waitForTimeout(200)
const div1JuniorRowCount = await page.locator('[data-schedule-row]').count()
log('NAC Div1/Junior schedule table rows =', div1JuniorRowCount)
// Measured against the running app, 2026-09-05: 80 strips / 12 video places
// all 24 of 24, agreeing with baseline.md's after-R1 engine measurement.
if (div1JuniorRowCount !== 24) {
  throw new Error(`NAC Div1/Junior schedule table rendered ${div1JuniorRowCount} rows, expected 24`)
}
await shot('06-div1junior-schedule')

// ── Suggest on a template that renders nothing today (011 SC-005) ──
// Before this feature, NAC Youth's Suggest button wrote 39 strips (the largest
// single event's pool count) and the board came back empty:
// `feasibility-strip-hours` tripped a blocking ERROR before the scheduler ever
// ran (baseline.md §1). US1 (R5) demoted that finding to a WARN and US2 (L5)
// replaced the largest-event rule with one sized for the busiest day's summed
// pool demand, so this step presses the same button on the same template and
// checks the board is no longer empty.
await choosePreset('NAC Youth')
log('NAC Youth template applied')

const nacYouthStrips = await pressSuggest('NAC Youth')
log('NAC Youth suggested strips =', nacYouthStrips)

const nacYouthGen = page.getByRole('button', { name: 'Auto-assign' })
if (await nacYouthGen.isDisabled()) {
  await shot('06c-nacyouth-generate-disabled')
  throw new Error('Auto-assign disabled for NAC Youth — read smoke-shots/06c for the blocking findings')
}
await nacYouthGen.click()
await page.waitForTimeout(300)

await page.getByRole('radio', { name: 'Schedule' }).click()
await page.waitForTimeout(200)
const nacYouthRowCount = await page.locator('[data-schedule-row]').count()
log('NAC Youth schedule table rows =', nacYouthRowCount)
// Not pinned to a literal count: `days_available` sits at boot's B1 value of 4
// for this whole driver (applyTemplate never touches it), so the suggested
// number and the placed count here are one instance of the busiest-day rule
// at a day count baseline.md's engine harness (forced to 3) does not share —
// see the ROC Div1A/Vet matrix-block comment above for the same effect. The
// assertion that matters for SC-005 is non-zero: zero is exactly the outcome
// R5/L5 exist to prevent, and pinning to a packing detail would make this
// driver brittle against day-count or fixture changes that do not bear on the
// defect this step exists to catch.
//
// `[M]` 012 T014, 2026-09-06, in the driver's accumulated session state:
// suggested 63 strips, 24 of 24 placed (superseding the pre-search-rule 197
// this comment recorded on 2026-09-05). baseline.md §5's fresh-store answer
// is 66. Isolated 2026-09-06: the gears-panel step above changes Admin gap
// 30 → 15, reverts it to 30, then re-applies 15 so the override carries
// through the share link — and nothing after that restores it.
// `applyTemplate` keeps that override across a template switch the same way
// it keeps `days_available`. A throwaway probe
// (tmp/probe-nac-youth-gap.test.ts, deleted) replaying this driver's store
// actions found `ADMIN_GAP_MINS` the only field whose single swap moves the
// answer — 63 ↔ 66 in both directions — with `strips_total`, `strips`, and
// `video_strips_total` inert and the search's floor/ceiling identical at
// 53/197. Verdict: not a defect. A gears-panel override is a tournament-wide
// setting, so this step's count is the busiest-day search at a 15-minute
// admin gap; the assertion stays non-zero by design (see above).
//
// 013 T022 deleted that Admin gap step, so the 63 above no longer has its
// cause. The session state reaching here now carries a different tournament-
// wide leftover instead — the share-link step sets DE mode to Single and
// nothing restores it, `applyTemplate` keeping it the same way it kept the
// admin gap. T023 runs the driver and records whatever count that produces.
// The assertion below is unchanged and stays non-zero by design.
//
// `[M]` 013 T023, 2026-09-13: two runs both read 66, agreeing with D14's
// fresh-store expectation. This session's earlier readings (50, then 49
// after adding the Staged-restore step above) were never a config leftover —
// fresh-store probes at `df977bf487` computed 66 through both today's search
// and the pre-T017 one, so the engine was correct the whole time. The stale
// numbers were `pressSuggest` reading `[data-suggested-strips]` before
// `StripsPanel`'s 300ms debounce had replaced the *previous* template's
// answer with this one's — nothing marked the display stale in between.
// Fixed at `9da51b1b15`: the panel now clears the card to `—` (Apply
// disabled) the instant any of its search inputs change, so a read here can
// only ever be this template's own answer.
if (nacYouthRowCount === 0) {
  throw new Error('SC-005: NAC Youth placed 0 events at its Suggest count — the feasibility-strip-hours demotion or the busiest-day suggestion regressed')
}
await shot('06c-nacyouth-schedule')

// ── SC-008: Suggest sizes the largest template (012 T014) ──
// NAC Vet/Div1/Junior (66 events) is the largest template and was not yet
// exercised by this driver. This runs before the Team event cut section
// below rather than after it: that section's closing Advanced-panel checks
// run "on the 24 events NAC Cadet/Junior just selected" (comment further
// down), so switching templates again after it would break that assumption.
//
// `[M]` 012 T014, 2026-09-06: this driver's accumulated session state carries
// boot's B1 preset video strip count of 12 into this step (nothing before it
// resets video_strips_total), and at 12 video strips the suggested count is
// 80, not baseline.md §5's fresh-store 85 (measured there at 8 video
// strips — the spec's 96 is the monotone threshold, baseline.md §1a, the
// smallest count above which *every* count places every event, not the
// smallest count that does). A throwaway probe (tmp/probe-t014-video.test.ts,
// deleted) reproduced both numbers from a fresh store: 80 at video=12, 85 at
// video=null(8). The search evaluates the config the app would actually
// build (tasks.md §One decision), so a different video count is a different
// board — 80 is correct for the config this driver hands it, not a
// regression against baseline.md's 85.
//
// `[M]` 013 T023, 2026-09-13: two runs both read 80, holding this assertion.
// The 69 and then 66 read earlier this session were both stale reads of
// `[data-suggested-strips]`, not a config change — see the `[M]` note on the
// NAC Youth step above for the mechanism and the fix (`9da51b1b15`).
await choosePreset('NAC Vet/Div1/Junior')
log('NAC Vet/Div1/Junior template applied')

await openPanel('Strips & referees')
const vetVideoStrips = await page.getByRole('spinbutton', { name: 'Number of video strips' }).inputValue()
log('NAC Vet/Div1/Junior video strips before Suggest =', vetVideoStrips)

const vetStrips = await pressSuggest('NAC Vet/Div1/Junior')
log('NAC Vet/Div1/Junior suggested strips =', vetStrips)
await shot('06d-vet-configured')
if (Number(vetStrips) !== 80) {
  throw new Error(`SC-008: NAC Vet/Div1/Junior suggested ${vetStrips} strips, expected 80 at ${vetVideoStrips} video strips (tmp/probe-t014-video.test.ts) — this is measured, not adjustable; report the number rather than changing the assertion`)
}

const vetGen = page.getByRole('button', { name: 'Auto-assign' })
if (await vetGen.isDisabled()) {
  await shot('06d-vet-generate-disabled')
  throw new Error('Auto-assign disabled for NAC Vet/Div1/Junior — read smoke-shots/06d for the blocking findings')
}
await vetGen.click()
await page.waitForTimeout(300)

await page.getByRole('radio', { name: 'Schedule' }).click()
await page.waitForTimeout(200)
const vetRowCount = await page.locator('[data-schedule-row]').count()
log('NAC Vet/Div1/Junior schedule table rows =', vetRowCount)
// SC-008: the largest template places its whole 66-event field at its
// suggested count of 80. `[M]` measured in the running app, 2026-09-06.
if (vetRowCount !== 66) {
  throw new Error(`NAC Vet/Div1/Junior schedule table rendered ${vetRowCount} rows, expected 66`)
}
await shot('06d-vet-schedule')

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
await choosePreset('NAC Cadet/Junior')
log('NAC Cadet/Junior template applied')

const teamStrips = await pressSuggest('NAC Cadet/Junior')
log('NAC Cadet/Junior suggested strips =', teamStrips)

const teamGen = page.getByRole('button', { name: 'Auto-assign' })
if (await teamGen.isDisabled()) {
  await shot('07b-team-generate-disabled')
  throw new Error('Auto-assign disabled for NAC Cadet/Junior — read smoke-shots/07b for the blocking findings')
}
await teamGen.click()
await page.waitForTimeout(300)

await page.getByRole('radio', { name: 'Schedule' }).click()
await page.waitForTimeout(200)
const teamRowCount = await page.locator('[data-schedule-row]').count()
log('NAC Cadet/Junior schedule table rows =', teamRowCount)
// Measured against the running app by running this file's exact sequence
// (Preset combobox → NAC Cadet/Junior → Suggest → Auto-assign → Schedule radio
// → count [data-schedule-row]). This count is measured at this point in the
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
// events fitting is that re-pack landing in this template's favour.
// 2026-09-05 (011 T013): 20 → 24, suggested strips 39 → 144. This is T010's
// busiest-day suggestion rule, not a scheduling change: `applyTemplate` never
// touches `days_available`, which stays at boot's B1 value of 4 for this whole
// driver, so Suggest here sizes for the busiest of 4 day-groups' summed pool
// demand rather than the old rule's largest-single-event count. The bigger
// number the button now writes into the strip field is what closes the
// remaining 4-event shortfall — this is R5/L5 (011) working as specified, an
// increase, so constitution III's halt (a *drop* in scheduled count) does not
// apply.
// `[M]` 2026-09-06 (012 T014): 144 → 48, rows unchanged at 24. T007-T011's
// search-based rule supersedes the busiest-day rule above. Measured at 12
// video strips (this driver's accumulated state, same as the SC-008 step
// above) and still lands on 48 — matching baseline.md §5's fresh-store
// answer exactly, so unlike NAC Vet/Div1/Junior, video strip count does not
// move this template's suggested count.
if (teamRowCount !== 24) {
  throw new Error(`NAC Cadet/Junior schedule table rendered ${teamRowCount} rows, expected 24`)
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
// referees 2 → 1 and video strips 8 → 0 (src/store/typeDefaults.ts). DE mode's
// own summary moved to the Settings panel in T022 and is asserted there, not
// here.
// 013 T018 replaced the old Advanced section's collapsed-into-one-`div`
// summary with the Strips & referees panel's own controls — no region named
// "Advanced" exists any more, so these reads are scoped to the open
// "Inspector panel" aside instead.
await openPanel('Strips & referees')
const stripsAside = page.getByRole('complementary', { name: 'Inspector panel' })
const refsPerPool = () => stripsAside.locator('[data-refs-per-pool]').textContent()
const videoField = stripsAside.getByRole('spinbutton', { name: 'Number of video strips' })

if ((await refsPerPool())?.trim() !== '2') {
  throw new Error(`Referees per pool at a NAC did not read the NAC row of TYPE_DEFAULTS: "${await refsPerPool()}"`)
}

// B1's preset wrote an explicit 12 video strips (applyPreset → setVideoStrips),
// so the count is *not* following the type default yet and the type change
// below would correctly leave it alone. Revert it first (FR-038's control, the
// only way back to the stored null) so it becomes a value that has to move.
await stripsAside.getByRole('button', { name: 'Revert video strips to default' }).click()
await page.waitForTimeout(200)
if ((await videoField.inputValue()) !== '8') {
  throw new Error(`reverting video strips did not fall back to the NAC default of 8: "${await videoField.inputValue()}"`)
}
log('referees per pool at a NAC:', (await refsPerPool())?.trim(), 'video strips:', await videoField.inputValue())

// The type change. The retired top bar's own "Tournament type" control is
// gone (013 T010), and TournamentSetup's dropdown is gone too (013 T016) —
// the Tournament panel's type control is now the "Tournament type" radiogroup
// of pills, and clicking a pill commits immediately (no separate option step).
await openPanel('Tournament')
await page
  .getByRole('radiogroup', { name: 'Tournament type' })
  .getByRole('radio', { name: 'ROC', exact: true })
  .click()
await page.waitForTimeout(400)

// Both readings below live in the Strips & referees panel, which the
// Tournament panel above just replaced — reopen it before reading either.
await openPanel('Strips & referees')

// Everything that follows the tournament type moved to the ROC row. Since the
// per-event record shrank (013 T020) that is every event: referee policy is
// derived in buildConfig.ts and no per-event control remains to depart from it.
if ((await refsPerPool())?.trim() !== '1') {
  throw new Error(`NAC → ROC did not re-resolve referees per pool: "${await refsPerPool()}"`)
}
if ((await videoField.inputValue()) !== '0') {
  throw new Error(`NAC → ROC did not re-resolve video strips: "${await videoField.inputValue()}"`)
}
log('type NAC → ROC: referees per pool and video strips re-resolved')
await shot('08b-advanced-roc')

await browser.close()
log('console errors =', errors.length, errors.slice(0, 3))
if (errors.length) throw new Error('console errors: ' + errors.join(' | '))
log('SMOKE PASS')
