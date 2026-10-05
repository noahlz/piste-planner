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

// 013 T024 — three weapon tokens replace the per-category custom properties
// (research D4, data-model §8). index.css is the single source of truth for
// the colours (added by T015a) — this module only maps Weapon -> token name,
// the way the retired per-category palette module mapped Category -> token name.

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
})

describe('weaponToken', () => {
  it.each(CASES)('matches the WEAPON_TOKENS lookup for %s %s', (weapon, part) => {
    expect(weaponToken(weapon, part)).toBe(WEAPON_TOKENS[weapon][part])
  })
})

describe('weaponVar', () => {
  it('returns the exact var(...) string for every weapon and part', () => {
    const actual = Object.fromEntries(
      CASES.map(([weapon, part]) => [`${weapon}/${part}`, weaponVar(weapon, part)]),
    )
    const expected = Object.fromEntries(
      [
        [Weapon.FOIL, WeaponTokenPart.FILL, 'var(--weapon-foil-fill)'],
        [Weapon.FOIL, WeaponTokenPart.INK, 'var(--weapon-foil-ink)'],
        [Weapon.FOIL, WeaponTokenPart.EDGE, 'var(--weapon-foil-edge)'],
        [Weapon.FOIL, WeaponTokenPart.HATCH, 'var(--weapon-foil-hatch)'],
        [Weapon.EPEE, WeaponTokenPart.FILL, 'var(--weapon-epee-fill)'],
        [Weapon.EPEE, WeaponTokenPart.INK, 'var(--weapon-epee-ink)'],
        [Weapon.EPEE, WeaponTokenPart.EDGE, 'var(--weapon-epee-edge)'],
        [Weapon.EPEE, WeaponTokenPart.HATCH, 'var(--weapon-epee-hatch)'],
        [Weapon.SABRE, WeaponTokenPart.FILL, 'var(--weapon-sabre-fill)'],
        [Weapon.SABRE, WeaponTokenPart.INK, 'var(--weapon-sabre-ink)'],
        [Weapon.SABRE, WeaponTokenPart.EDGE, 'var(--weapon-sabre-edge)'],
        [Weapon.SABRE, WeaponTokenPart.HATCH, 'var(--weapon-sabre-hatch)'],
      ].map(([w, p, v]) => [`${w}/${p}`, v]),
    )
    expect(actual).toEqual(expected)
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
