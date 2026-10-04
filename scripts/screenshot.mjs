// Product-owner screenshot of the workbench shell — quickstart §3 / FR-069.
//
// Taken at the end of story 1, before the matrix canvas is rewritten, so the
// shell's real-size look is on record ahead of that change. Re-run whenever
// the shell's layout changes.
//
//   pnpm dev &                 # or any server on SMOKE_BASE
//   node scripts/screenshot.mjs
//
// Env:
//   SMOKE_BASE      app URL (default http://localhost:5173/piste-planner/)
//   SMOKE_CHROME    explicit browser executable, else the ms-playwright cache
//
// Exit 0 printing the two saved paths on the last lines, or exit 1 naming the
// failed wait.

import { chromium } from 'playwright-core'
import { homedir } from 'node:os'
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:5173/piste-planner/'
const SHOTS = new URL('./smoke-shots/', import.meta.url).pathname
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]

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

const log = (...a) => console.log('[screenshot]', ...a)
const errors = []
const browser = await chromium.launch({ executablePath: findChrome() })
const savedPaths = []

for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: size })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(BASE)

  const label = `${size.width}x${size.height}`
  try {
    await page.getByRole('banner', { name: 'Header' }).waitFor()
  } catch {
    throw new Error(`${label}: header "Header" did not mount`)
  }
  try {
    await page.getByRole('region', { name: 'Matrix canvas' }).waitFor()
  } catch {
    throw new Error(`${label}: region "Matrix canvas" did not mount`)
  }
  try {
    await page.locator('[data-event-block]').first().waitFor()
  } catch {
    throw new Error(`${label}: no [data-event-block] rendered`)
  }
  // Let layout settle (fonts, canvas measurement) before capturing.
  await page.waitForTimeout(500)

  const path = `${SHOTS}shell-${label}.png`
  await page.screenshot({ path, fullPage: false })
  savedPaths.push(path)
  log('saved', path)
  await ctx.close()
}

// T044-D: one 1440x900 pass over each surface, in a fresh context.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(BASE)

  const wait = async (what, locator) => {
    try {
      await locator.waitFor({ timeout: 15000 })
    } catch {
      throw new Error(`t044: ${what} did not appear`)
    }
  }
  const snap = async (view) => {
    const path = `${SHOTS}t044-${view}.png`
    await page.screenshot({ path, fullPage: false })
    savedPaths.push(path)
    log('saved', path)
  }

  await wait('region "Matrix canvas"', page.getByRole('region', { name: 'Matrix canvas' }))
  await wait('[data-event-block]', page.locator('[data-event-block]').first())
  await page.waitForTimeout(500)

  // Same aria-pressed guard as smoke.mjs openPanel: click only to change state.
  const rail = page.getByRole('navigation', { name: 'Tool rail' })
  const panel = page.getByRole('complementary', { name: 'Inspector panel' })
  const setPanel = async (name, open) => {
    const button = rail.getByRole('button', { name })
    if (((await button.getAttribute('aria-pressed')) === 'true') !== open) await button.click()
    if (open) await wait(`inspector panel for "${name}"`, panel)
    else {
      try {
        await panel.waitFor({ state: 'hidden', timeout: 15000 })
      } catch {
        throw new Error(`t044: inspector panel did not close for "${name}"`)
      }
    }
    await page.waitForTimeout(400)
  }
  const PANELS = [
    ['tournament', 'Tournament'],
    ['strips', 'Strips & referees'],
    ['events', 'Events'],
    ['findings', 'Findings'],
    ['settings', 'Settings'],
  ]
  for (const [view, name] of PANELS) {
    await setPanel(name, true)
    await snap(view)
    await setPanel(name, false)
  }

  // First block fully inside the viewport.
  const blocks = page.locator('[data-event-block]')
  const count = await blocks.count()
  let target
  for (let i = 0; i < count; i++) {
    const box = await blocks.nth(i).boundingBox()
    if (box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 900) {
      target = blocks.nth(i)
      break
    }
  }
  if (!target) throw new Error('t044: no [data-event-block] visible in the viewport')

  await target.hover()
  await wait('tooltip [data-tooltip-field="name"]', page.locator('[data-tooltip-field="name"]').first())
  await page.waitForTimeout(200)
  await snap('tooltip')

  await target.click()
  await page.mouse.move(720, 880)
  await page.waitForTimeout(400)
  await snap('detail')

  await page.getByRole('radiogroup', { name: 'Center view mode' }).getByRole('radio', { name: 'Schedule' }).click()
  await wait('region "Schedule"', page.getByRole('region', { name: 'Schedule' }))
  await page.waitForTimeout(400)
  await snap('schedule')
  await ctx.close()
}

await browser.close()
log('console errors =', errors.length)
for (const p of savedPaths) console.log(p)
