/**
 * Weapon tokens (013, research D4, data-model §8) — three four-part tokens
 * replacing the thirty-three age-category custom properties 004's canvas
 * painted with, which T026 deleted along with the palette module that named
 * them. Colours live in `src/index.css` (T015a); this module only maps
 * `Weapon` -> token name, so the CSS stays the single source of truth.
 */
import { Weapon } from '../../engine/types.ts'

/** The four custom-property parts each weapon defines. */
export const WeaponTokenPart = {
  FILL: 'fill',
  INK: 'ink',
  EDGE: 'edge',
  HATCH: 'hatch',
} as const
export type WeaponTokenPart = (typeof WeaponTokenPart)[keyof typeof WeaponTokenPart]

/** Weapon -> the slug its tokens are named after. */
export const WEAPON_SLUG: Record<Weapon, 'foil' | 'epee' | 'sabre'> = {
  [Weapon.FOIL]: 'foil',
  [Weapon.EPEE]: 'epee',
  [Weapon.SABRE]: 'sabre',
}

/** Builds the four token names for one weapon's slug. */
function tokensFor(slug: 'foil' | 'epee' | 'sabre'): Record<WeaponTokenPart, string> {
  return {
    [WeaponTokenPart.FILL]: `--weapon-${slug}-fill`,
    [WeaponTokenPart.INK]: `--weapon-${slug}-ink`,
    [WeaponTokenPart.EDGE]: `--weapon-${slug}-edge`,
    [WeaponTokenPart.HATCH]: `--weapon-${slug}-hatch`,
  }
}

/** Weapon + part -> the CSS custom property name holding its colour. */
export const WEAPON_TOKENS: Record<Weapon, Record<WeaponTokenPart, string>> = {
  [Weapon.FOIL]: tokensFor(WEAPON_SLUG[Weapon.FOIL]),
  [Weapon.EPEE]: tokensFor(WEAPON_SLUG[Weapon.EPEE]),
  [Weapon.SABRE]: tokensFor(WEAPON_SLUG[Weapon.SABRE]),
}

/** The CSS custom property name for a weapon's part, e.g. `--weapon-foil-fill`. */
export function weaponToken(weapon: Weapon, part: WeaponTokenPart): string {
  return WEAPON_TOKENS[weapon][part]
}

/** The usable CSS value for a weapon's part, e.g. `var(--weapon-foil-fill)`. */
export function weaponVar(weapon: Weapon, part: WeaponTokenPart): string {
  return `var(${weaponToken(weapon, part)})`
}
