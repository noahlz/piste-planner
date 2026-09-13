import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Weapon } from '../../../src/engine/types.ts'
import {
  WeaponTokenPart,
  WEAPON_SLUG,
  WEAPON_TOKENS,
  weaponToken,
  weaponVar,
} from '../../../src/components/canvas/weaponTokens.ts'

// 013 T024 — three weapon tokens replace the 33 --cat-* custom properties
// (research D4, data-model §8). index.css is the single source of truth for
// the colours (added by T015a) — this module only maps Weapon -> token name,
// matching how palette.ts maps Category -> --cat-* token name.

// Vitest (per project convention) always runs from the repo root.
const INDEX_CSS_PATH = resolve(process.cwd(), 'src/index.css')

let cssTokens: Map<string, string>

beforeAll(() => {
  const css = readFileSync(INDEX_CSS_PATH, 'utf-8')
  const rootMatch = css.match(/:root\s*{([^}]*)}/)
  if (!rootMatch) throw new Error('index.css has no :root block')
  const rootBody = rootMatch[1]

  cssTokens = new Map()
  const tokenPattern = /(--weapon-[a-z-]+):\s*([^;]+);/g
  let match: RegExpExecArray | null
  while ((match = tokenPattern.exec(rootBody)) !== null) {
    cssTokens.set(match[1], match[2].trim())
  }
})

/** Normalizes a colour so rgba(44,69,93,.16) equals rgba(44, 69, 93, 0.16). */
function normalizeColor(value: string): string {
  const rgba = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/)
  if (rgba) {
    const [, r, g, b, a] = rgba
    return `rgba(${r},${g},${b},${Number(a)})`
  }
  return value.trim().toLowerCase()
}

const WEAPONS = Object.values(Weapon)
const PARTS = Object.values(WeaponTokenPart)
const CASES = WEAPONS.flatMap((weapon) => PARTS.map((part) => [weapon, part] as const))

describe('WEAPON_SLUG', () => {
  it('maps every weapon to its lowercase slug', () => {
    expect(WEAPON_SLUG[Weapon.FOIL]).toBe('foil')
    expect(WEAPON_SLUG[Weapon.EPEE]).toBe('epee')
    expect(WEAPON_SLUG[Weapon.SABRE]).toBe('sabre')
  })
})

describe('WEAPON_TOKENS', () => {
  it.each(CASES)('names the %s %s token --weapon-{slug}-{part}', (weapon, part) => {
    expect(WEAPON_TOKENS[weapon][part]).toBe(`--weapon-${WEAPON_SLUG[weapon]}-${part}`)
  })

  it('never names a --cat- token', () => {
    for (const [weapon, part] of CASES) {
      expect(WEAPON_TOKENS[weapon][part]).not.toContain('--cat-')
    }
  })
})

describe('weaponToken', () => {
  it.each(CASES)('matches the WEAPON_TOKENS lookup for %s %s', (weapon, part) => {
    expect(weaponToken(weapon, part)).toBe(WEAPON_TOKENS[weapon][part])
  })

  it('never returns a --cat- token', () => {
    for (const [weapon, part] of CASES) {
      expect(weaponToken(weapon, part)).not.toContain('--cat-')
    }
  })
})

describe('weaponVar', () => {
  it('wraps the token name in var(...)', () => {
    expect(weaponVar(Weapon.FOIL, WeaponTokenPart.FILL)).toBe('var(--weapon-foil-fill)')
    expect(weaponVar(Weapon.SABRE, WeaponTokenPart.HATCH)).toBe('var(--weapon-sabre-hatch)')
  })

  it('never returns a --cat- token', () => {
    for (const [weapon, part] of CASES) {
      expect(weaponVar(weapon, part)).not.toContain('--cat-')
    }
  })
})

describe('index.css defines the twelve weapon tokens at the data-model §8 values', () => {
  const EXPECTED: Record<Weapon, Record<WeaponTokenPart, string>> = {
    [Weapon.FOIL]: {
      [WeaponTokenPart.FILL]: '#d7e3ef',
      [WeaponTokenPart.INK]: '#2c455d',
      [WeaponTokenPart.EDGE]: '#8fb0cd',
      [WeaponTokenPart.HATCH]: 'rgba(44,69,93,.16)',
    },
    [Weapon.EPEE]: {
      [WeaponTokenPart.FILL]: '#d9e6da',
      [WeaponTokenPart.INK]: '#2f4a37',
      [WeaponTokenPart.EDGE]: '#93b79a',
      [WeaponTokenPart.HATCH]: 'rgba(47,74,55,.16)',
    },
    [Weapon.SABRE]: {
      [WeaponTokenPart.FILL]: '#f1e0d2',
      [WeaponTokenPart.INK]: '#5a3f26',
      [WeaponTokenPart.EDGE]: '#cfa887',
      [WeaponTokenPart.HATCH]: 'rgba(90,63,38,.16)',
    },
  }

  it.each(CASES)('defines %s %s at the data-model value', (weapon, part) => {
    const token = WEAPON_TOKENS[weapon][part]
    const cssValue = cssTokens.get(token)
    expect(cssValue, `index.css missing ${token}`).toBeDefined()
    expect(normalizeColor(cssValue as string)).toBe(normalizeColor(EXPECTED[weapon][part]))
  })

  it('defines exactly twelve --weapon- tokens, no stray ones', () => {
    expect(cssTokens.size).toBe(12)
  })
})
