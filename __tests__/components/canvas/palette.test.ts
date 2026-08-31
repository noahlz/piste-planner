import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Category, VetAgeGroup, Weapon } from '../../../src/engine/types.ts'
import {
  CATEGORY_TOKENS,
  CATEGORY_FAMILIES,
  CategoryFamily,
  resolveCanvasCategory,
  categoryFill,
  weaponMark,
} from '../../../src/components/canvas/palette.ts'
import type { CanvasCategory } from '../../../src/components/canvas/palette.ts'

// ──────────────────────────────────────────────
// Fixtures: the sixteen canvas category values, read from the engine types
// at runtime rather than typed out by hand, so a future Category or
// VetAgeGroup member is picked up automatically instead of silently skipped.
// ──────────────────────────────────────────────

const NON_VETERAN_CATEGORIES = Object.values(Category).filter(
  (c) => c !== Category.VETERAN,
) as CanvasCategory[]
const VET_AGE_GROUPS = Object.values(VetAgeGroup) as CanvasCategory[]
const ALL_CANVAS_CATEGORIES: CanvasCategory[] = [...NON_VETERAN_CATEGORIES, ...VET_AGE_GROUPS]

const FAMILY_MEMBERS: Record<string, CanvasCategory[]> = {
  Youth: [Category.Y8, Category.Y10, Category.Y12, Category.Y14],
  'Cadet and Junior': [Category.CADET, Category.JUNIOR],
  'Senior divisions': [Category.DIV1, Category.DIV1A, Category.DIV2, Category.DIV3],
  Veteran: [
    VetAgeGroup.VET40,
    VetAgeGroup.VET50,
    VetAgeGroup.VET60,
    VetAgeGroup.VET70,
    VetAgeGroup.VET80,
    VetAgeGroup.VET_COMBINED,
  ],
}

// ──────────────────────────────────────────────
// index.css is the single source of truth for the colours (D4) — jsdom
// never processes it, so read and parse the `--cat-*` custom properties
// out of the :root block directly from disk.
// ──────────────────────────────────────────────

// Vitest (per project convention) always runs from the repo root, so
// index.css resolves from process.cwd() rather than import.meta.url — the
// latter is not a plain file:// URL under Vite's test transform.
const INDEX_CSS_PATH = resolve(process.cwd(), 'src/index.css')

let cssTokens: Map<string, string>

beforeAll(() => {
  const css = readFileSync(INDEX_CSS_PATH, 'utf-8')
  const rootMatch = css.match(/:root\s*{([^}]*)}/)
  if (!rootMatch) throw new Error('index.css has no :root block')
  const rootBody = rootMatch[1]

  cssTokens = new Map()
  const tokenPattern = /(--cat-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g
  let match: RegExpExecArray | null
  while ((match = tokenPattern.exec(rootBody)) !== null) {
    cssTokens.set(match[1], match[2])
  }
})

/** Reads the hex colour for a canvas category via CATEGORY_TOKENS -> index.css. */
function hexFor(cat: CanvasCategory): string {
  const token = CATEGORY_TOKENS[cat]
  const hex = cssTokens.get(token)
  if (!hex) throw new Error(`token ${token} for ${cat} not found in index.css`)
  return hex
}

/** Standard hex -> HSL conversion (h in degrees [0,360), s and l in percent). */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

/** Shortest angular distance between two hues on the 360-degree wheel. */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

// ──────────────────────────────────────────────
// Completeness
// ──────────────────────────────────────────────

describe('the sixteen canvas category values', () => {
  it('has exactly 16 members', () => {
    expect(ALL_CANVAS_CATEGORIES).toHaveLength(16)
  })

  it('gives every value an entry in CATEGORY_TOKENS', () => {
    for (const cat of ALL_CANVAS_CATEGORIES) {
      expect(CATEGORY_TOKENS[cat], `CATEGORY_TOKENS missing ${cat}`).toBeDefined()
    }
  })

  it('defines every CATEGORY_TOKENS token in index.css', () => {
    for (const cat of ALL_CANVAS_CATEGORIES) {
      const token = CATEGORY_TOKENS[cat]
      expect(cssTokens.has(token), `index.css missing ${token} (for ${cat})`).toBe(true)
    }
  })

  it('claims every --cat-* token in index.css with some category (no stray tokens)', () => {
    const claimedTokens = new Set(ALL_CANVAS_CATEGORIES.map((cat) => CATEGORY_TOKENS[cat]))
    for (const token of cssTokens.keys()) {
      expect(claimedTokens.has(token), `${token} in index.css is not mapped by any category`).toBe(
        true,
      )
    }
  })

  it('assigns 16 distinct hex fills', () => {
    const hexValues = ALL_CANVAS_CATEGORIES.map(hexFor)
    expect(new Set(hexValues).size).toBe(16)
  })
})

// ──────────────────────────────────────────────
// Families occupy separated, tight hue bands
// ──────────────────────────────────────────────

describe('category families occupy separated hue bands', () => {
  const familyHues: Record<string, number[]> = {}

  beforeAll(() => {
    for (const [family, members] of Object.entries(FAMILY_MEMBERS)) {
      familyHues[family] = members.map((cat) => hexToHsl(hexFor(cat)).h)
    }
  })

  it('keeps every member of a family within a tight hue band (<= 5 degrees)', () => {
    for (const [family, hues] of Object.entries(familyHues)) {
      const spread = Math.max(...hues) - Math.min(...hues)
      expect(spread, `${family} hue spread ${spread} too wide`).toBeLessThanOrEqual(5)
    }
  })

  it('places Youth in the blue range (~195-225)', () => {
    const [hue] = familyHues.Youth
    expect(hue).toBeGreaterThan(195)
    expect(hue).toBeLessThan(225)
  })

  it('places Cadet and Junior in the green range (~135-165)', () => {
    const [hue] = familyHues['Cadet and Junior']
    expect(hue).toBeGreaterThan(135)
    expect(hue).toBeLessThan(165)
  })

  it('places Senior divisions in the purple range (~265-295)', () => {
    const [hue] = familyHues['Senior divisions']
    expect(hue).toBeGreaterThan(265)
    expect(hue).toBeLessThan(295)
  })

  it('places Veteran in the orange range (~17-47)', () => {
    const [hue] = familyHues.Veteran
    expect(hue).toBeGreaterThan(17)
    expect(hue).toBeLessThan(47)
  })

  it('separates every pair of family hue bands by at least 40 degrees', () => {
    const families = Object.keys(familyHues)
    for (let i = 0; i < families.length; i++) {
      for (let j = i + 1; j < families.length; j++) {
        const a = familyHues[families[i]][0]
        const b = familyHues[families[j]][0]
        const distance = hueDistance(a, b)
        expect(
          distance,
          `${families[i]} and ${families[j]} hues too close: ${a} vs ${b}`,
        ).toBeGreaterThanOrEqual(40)
      }
    }
  })
})

// ──────────────────────────────────────────────
// Lightness is a monotonic progression within each family, same direction
// ──────────────────────────────────────────────

describe('lightness progresses monotonically within each family', () => {
  it('increases strictly from Y8 through Y14', () => {
    const [y8, y10, y12, y14] = FAMILY_MEMBERS.Youth.map((c) => hexToHsl(hexFor(c)).l)
    expect(y8).toBeLessThan(y10)
    expect(y10).toBeLessThan(y12)
    expect(y12).toBeLessThan(y14)
  })

  it('increases strictly from CADET to JUNIOR', () => {
    const [cadet, junior] = FAMILY_MEMBERS['Cadet and Junior'].map((c) => hexToHsl(hexFor(c)).l)
    expect(cadet).toBeLessThan(junior)
  })

  it('increases strictly from DIV1 through DIV3', () => {
    const [div1, div1a, div2, div3] = FAMILY_MEMBERS['Senior divisions'].map(
      (c) => hexToHsl(hexFor(c)).l,
    )
    expect(div1).toBeLessThan(div1a)
    expect(div1a).toBeLessThan(div2)
    expect(div2).toBeLessThan(div3)
  })

  it('increases strictly from VET40 through VET_COMBINED', () => {
    const [v40, v50, v60, v70, v80, vc] = FAMILY_MEMBERS.Veteran.map((c) => hexToHsl(hexFor(c)).l)
    expect(v40).toBeLessThan(v50)
    expect(v50).toBeLessThan(v60)
    expect(v60).toBeLessThan(v70)
    expect(v70).toBeLessThan(v80)
    expect(v80).toBeLessThan(vc)
  })

  it('runs every family in the same direction (first member always lighter/darker than last, consistently)', () => {
    const directions = Object.values(FAMILY_MEMBERS).map((members) => {
      const first = hexToHsl(hexFor(members[0])).l
      const last = hexToHsl(hexFor(members[members.length - 1])).l
      return last > first
    })
    expect(directions.every((d) => d === directions[0])).toBe(true)
  })
})

// ──────────────────────────────────────────────
// CATEGORY_FAMILIES matches the four families above
// ──────────────────────────────────────────────

describe('CATEGORY_FAMILIES', () => {
  it('assigns every member the family research D4 groups it under', () => {
    expect(FAMILY_MEMBERS.Youth.every((c) => CATEGORY_FAMILIES[c] === CategoryFamily.YOUTH)).toBe(
      true,
    )
    expect(
      FAMILY_MEMBERS['Cadet and Junior'].every(
        (c) => CATEGORY_FAMILIES[c] === CategoryFamily.CADET_JUNIOR,
      ),
    ).toBe(true)
    expect(
      FAMILY_MEMBERS['Senior divisions'].every(
        (c) => CATEGORY_FAMILIES[c] === CategoryFamily.SENIOR_DIVISIONS,
      ),
    ).toBe(true)
    expect(
      FAMILY_MEMBERS.Veteran.every((c) => CATEGORY_FAMILIES[c] === CategoryFamily.VETERAN),
    ).toBe(true)
  })
})

// ──────────────────────────────────────────────
// resolveCanvasCategory
// ──────────────────────────────────────────────

describe('resolveCanvasCategory', () => {
  it('resolves VETERAN with a band to that band', () => {
    expect(resolveCanvasCategory(Category.VETERAN, VetAgeGroup.VET60)).toBe(VetAgeGroup.VET60)
  })

  it('resolves a non-veteran category to itself', () => {
    expect(resolveCanvasCategory(Category.DIV1A, null)).toBe(Category.DIV1A)
  })

  it('falls back to VET_COMBINED when VETERAN has no band', () => {
    expect(resolveCanvasCategory(Category.VETERAN, null)).toBe(VetAgeGroup.VET_COMBINED)
  })
})

// ──────────────────────────────────────────────
// categoryFill
// ──────────────────────────────────────────────

describe('categoryFill', () => {
  it('returns the CSS var() expression for a category token', () => {
    expect(categoryFill(Category.Y8)).toBe(`var(${CATEGORY_TOKENS[Category.Y8]})`)
  })
})

// ──────────────────────────────────────────────
// weaponMark
// ──────────────────────────────────────────────

describe('weaponMark', () => {
  it('maps every weapon to a mark', () => {
    for (const weapon of Object.values(Weapon)) {
      expect(weaponMark(weapon)).toBeDefined()
    }
  })

  it('maps FOIL, EPEE, SABRE to F, E, S respectively', () => {
    expect(weaponMark(Weapon.FOIL)).toBe('F')
    expect(weaponMark(Weapon.EPEE)).toBe('E')
    expect(weaponMark(Weapon.SABRE)).toBe('S')
  })

  it('gives every weapon a distinct single uppercase letter', () => {
    const marks = Object.values(Weapon).map(weaponMark)
    expect(new Set(marks).size).toBe(marks.length)
    for (const mark of marks) {
      expect(mark).toMatch(/^[A-Z]$/)
    }
  })
})
