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

await browser.close()
log('console errors =', errors.length)
for (const p of savedPaths) console.log(p)
