import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Category, VetAgeGroup, Weapon } from '../../../src/engine/types.ts'
import {
  CATEGORY_TOKENS,
  CATEGORY_INK_TOKENS,
  CATEGORY_FAMILIES,
  CategoryFamily,
  resolveCanvasCategory,
  categoryFill,
  categoryInk,
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

/** Reads the hex value of one token out of index.css. */
function hexOf(token: string, cat: CanvasCategory): string {
  const hex = cssTokens.get(token)
  if (!hex) throw new Error(`token ${token} for ${cat} not found in index.css`)
  return hex
}

/** Reads the hex fill for a canvas category via CATEGORY_TOKENS -> index.css. */
function hexFor(cat: CanvasCategory): string {
  return hexOf(CATEGORY_TOKENS[cat], cat)
}

/** Reads the hex label ink via CATEGORY_INK_TOKENS -> index.css. */
function inkFor(cat: CanvasCategory): string {
  return hexOf(CATEGORY_INK_TOKENS[cat], cat)
}

/**
 * WCAG 2.1 relative luminance, computed here rather than taken from the
 * palette so the assertion is independent of anything src/ believes.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(hex: string): number {
  const channel = (offset: number): number => {
    const srgb = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG 2.1 contrast ratio, (lighter + 0.05) / (darker + 0.05). */
function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
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

  it('gives every value an ink defined in index.css beside its fill', () => {
    for (const cat of ALL_CANVAS_CATEGORIES) {
      const token = CATEGORY_INK_TOKENS[cat]
      expect(token, `CATEGORY_INK_TOKENS missing ${cat}`).toBeDefined()
      expect(cssTokens.has(token), `index.css missing ${token} (for ${cat})`).toBe(true)
    }
  })

  it('claims every --cat-* token in index.css as a fill or an ink (no stray tokens)', () => {
    // Two families under one prefix: a token is claimed only if some category
    // names it, as its fill or as the ink that goes on that fill. Anything
    // else in index.css is orphaned and still fails here.
    const claimedTokens = new Set([
      ...ALL_CANVAS_CATEGORIES.map((cat) => CATEGORY_TOKENS[cat]),
      ...ALL_CANVAS_CATEGORIES.map((cat) => CATEGORY_INK_TOKENS[cat]),
    ])
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
// Every label is legible on the block it sits on
// ──────────────────────────────────────────────

describe('fill and ink pairs clear WCAG AA', () => {
  // The measured ratio of each pair, recomputed from index.css on every run.
  // --cat-div1 (#9b6bb3) is the tightest: no ink beats 5.44:1 on it, because
  // pure black does not.
  const EXPECTED_RATIOS: Record<string, number> = {
    Y8: 5.9,
    Y10: 6.05,
    Y12: 6.08,
    Y14: 6.01,
    CADET: 6.08,
    JUNIOR: 6.2,
    DIV1: 4.97,
    DIV1A: 6.09,
    DIV2: 6.08,
    DIV3: 6.03,
    VET40: 6.07,
    VET50: 6.02,
    VET60: 6.05,
    VET70: 6.18,
    VET80: 6.06,
    VET_COMBINED: 6.12,
  }

  it.each(ALL_CANVAS_CATEGORIES)('%s reads at 4.5:1 or better on its own fill', (cat) => {
    const ratio = contrastRatio(hexFor(cat), inkFor(cat))
    expect(
      ratio,
      `${cat}: ink ${inkFor(cat)} on fill ${hexFor(cat)} is only ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each(ALL_CANVAS_CATEGORIES)('%s holds the ratio index.css was tuned for', (cat) => {
    // Pinned per pair, not as a floor: a fill or an ink edited without
    // re-measuring moves this even when the pair still clears 4.5:1.
    expect(contrastRatio(hexFor(cat), inkFor(cat))).toBeCloseTo(EXPECTED_RATIOS[cat], 1)
  })

  it('needs the per-category inks: neither theme foreground clears AA on every fill', () => {
    // The reason CATEGORY_INK_TOKENS exists. --foreground manages 1.85:1 on
    // --cat-div1 and --card-foreground, the darkest token in the file, 3.57:1.
    const failing = ALL_CANVAS_CATEGORIES.filter(
      (cat) => contrastRatio(hexFor(cat), '#475569') < 4.5,
    )
    expect(failing.length).toBeGreaterThan(0)
    expect(contrastRatio('#9b6bb3', '#1e293b')).toBeLessThan(4.5)
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
  // Literal token names, not CATEGORY_TOKENS lookups: reading the mapping the
  // implementation reads would hold however the mapping was rewired.
  it('returns the CSS var() expression for a category token', () => {
    expect(categoryFill(Category.Y8)).toBe('var(--cat-y8)')
  })

  it('names a vet band by its token, which its key does not spell', () => {
    expect(categoryFill(VetAgeGroup.VET_COMBINED)).toBe('var(--cat-vet-combined)')
  })
})

// ──────────────────────────────────────────────
// categoryInk
// ──────────────────────────────────────────────

describe('categoryInk', () => {
  it('returns the CSS var() expression for a category ink token', () => {
    expect(categoryInk(Category.Y8)).toBe('var(--cat-y8-fg)')
  })

  it('names a vet band ink by its token, which its key does not spell', () => {
    expect(categoryInk(VetAgeGroup.VET_COMBINED)).toBe('var(--cat-vet-combined-fg)')
  })

  it('never returns a category its own fill', () => {
    for (const cat of ALL_CANVAS_CATEGORIES) {
      expect(categoryInk(cat)).not.toBe(categoryFill(cat))
    }
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
