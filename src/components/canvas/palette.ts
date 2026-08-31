// Canvas category palette (research D4). The sixteen values the canvas
// encodes: the ten non-VETERAN Category members plus the six VetAgeGroup
// bands VETERAN expands into. Colours themselves live in src/index.css as
// CSS custom properties — this module maps categories to token names, never
// to hex literals, so the CSS stays the single source of truth.
import { Category, VetAgeGroup, Weapon } from '../../engine/types.ts'

/**
 * The sixteen values the canvas encodes as a fill colour. Derived from the
 * engine's Category and VetAgeGroup unions by exclusion rather than
 * hand-listed, so a future addition to either fails `tsc` here (via the
 * exhaustive Records below) instead of silently losing its colour.
 */
export type CanvasCategory = Exclude<Category, typeof Category.VETERAN> | VetAgeGroup

/** The four hue families research D4 groups the sixteen values into. */
export const CategoryFamily = {
  YOUTH: 'YOUTH',
  CADET_JUNIOR: 'CADET_JUNIOR',
  SENIOR_DIVISIONS: 'SENIOR_DIVISIONS',
  VETERAN: 'VETERAN',
} as const
export type CategoryFamily = (typeof CategoryFamily)[keyof typeof CategoryFamily]

/**
 * Category/VetAgeGroup -> CSS custom property name (not the colour itself —
 * see categoryFill for the usable var() string). Each value's colour is
 * defined in src/index.css beside the existing brand tokens.
 */
export const CATEGORY_TOKENS: Record<CanvasCategory, string> = {
  [Category.Y8]: '--cat-y8',
  [Category.Y10]: '--cat-y10',
  [Category.Y12]: '--cat-y12',
  [Category.Y14]: '--cat-y14',
  [Category.CADET]: '--cat-cadet',
  [Category.JUNIOR]: '--cat-junior',
  [Category.DIV1]: '--cat-div1',
  [Category.DIV1A]: '--cat-div1a',
  [Category.DIV2]: '--cat-div2',
  [Category.DIV3]: '--cat-div3',
  [VetAgeGroup.VET40]: '--cat-vet40',
  [VetAgeGroup.VET50]: '--cat-vet50',
  [VetAgeGroup.VET60]: '--cat-vet60',
  [VetAgeGroup.VET70]: '--cat-vet70',
  [VetAgeGroup.VET80]: '--cat-vet80',
  [VetAgeGroup.VET_COMBINED]: '--cat-vet-combined',
}

/** Which of the four hue families each canvas category belongs to. */
export const CATEGORY_FAMILIES: Record<CanvasCategory, CategoryFamily> = {
  [Category.Y8]: CategoryFamily.YOUTH,
  [Category.Y10]: CategoryFamily.YOUTH,
  [Category.Y12]: CategoryFamily.YOUTH,
  [Category.Y14]: CategoryFamily.YOUTH,
  [Category.CADET]: CategoryFamily.CADET_JUNIOR,
  [Category.JUNIOR]: CategoryFamily.CADET_JUNIOR,
  [Category.DIV1]: CategoryFamily.SENIOR_DIVISIONS,
  [Category.DIV1A]: CategoryFamily.SENIOR_DIVISIONS,
  [Category.DIV2]: CategoryFamily.SENIOR_DIVISIONS,
  [Category.DIV3]: CategoryFamily.SENIOR_DIVISIONS,
  [VetAgeGroup.VET40]: CategoryFamily.VETERAN,
  [VetAgeGroup.VET50]: CategoryFamily.VETERAN,
  [VetAgeGroup.VET60]: CategoryFamily.VETERAN,
  [VetAgeGroup.VET70]: CategoryFamily.VETERAN,
  [VetAgeGroup.VET80]: CategoryFamily.VETERAN,
  [VetAgeGroup.VET_COMBINED]: CategoryFamily.VETERAN,
}

/**
 * Resolves a competition's (category, vet_age_group) pair to the
 * CanvasCategory that carries its fill colour. VETERAN expands into its
 * band; every other category is already a CanvasCategory. A VETERAN
 * competition with no band recorded (Competition.vet_age_group is
 * VetAgeGroup | null) falls back to VET_COMBINED — the "any/all veteran
 * ages" band is the closest reading of "veteran, age unspecified".
 */
export function resolveCanvasCategory(
  category: Category,
  vetAgeGroup: VetAgeGroup | null,
): CanvasCategory {
  if (category === Category.VETERAN) {
    return vetAgeGroup ?? VetAgeGroup.VET_COMBINED
  }
  return category as CanvasCategory
}

/** The usable CSS fill value for a canvas category, e.g. `var(--cat-y8)`. */
export function categoryFill(category: CanvasCategory): string {
  return `var(${CATEGORY_TOKENS[category]})`
}

/**
 * The matrix marks weapons with a letter, not an icon (superseding tasks.md
 * T033 and spec.md FR-016 — decided 2026-08-30, see specs/004-p3-workbench-shell
 * session notes). Exhaustive switch so a future Weapon member fails `tsc`
 * here rather than falling through silently.
 */
export function weaponMark(weapon: Weapon): 'F' | 'E' | 'S' {
  switch (weapon) {
    case Weapon.FOIL:
      return 'F'
    case Weapon.EPEE:
      return 'E'
    case Weapon.SABRE:
      return 'S'
  }
}
