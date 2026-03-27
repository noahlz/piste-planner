import type { CatalogueEntry } from '../engine/types.ts'
import { Category, EventType, Gender, Weapon } from '../engine/types.ts'

export const CATEGORY_DISPLAY: Record<Category, string> = {
  [Category.Y8]: 'Y8',
  [Category.Y10]: 'Y10',
  [Category.Y12]: 'Y12',
  [Category.Y14]: 'Y14',
  [Category.CADET]: 'Cadet',
  [Category.JUNIOR]: 'Junior',
  [Category.VETERAN]: 'Veteran',
  [Category.DIV1]: 'Div 1',
  [Category.DIV1A]: 'Div 1A',
  [Category.DIV2]: 'Div 2',
  [Category.DIV3]: 'Div 3',
}

export const GENDER_DISPLAY: Record<Gender, string> = {
  [Gender.MEN]: "Men's",
  [Gender.WOMEN]: "Women's",
}

export const WEAPON_DISPLAY: Record<Weapon, string> = {
  [Weapon.FOIL]: 'Foil',
  [Weapon.EPEE]: 'Epee',
  [Weapon.SABRE]: 'Sabre',
}

const EVENT_TYPE_DISPLAY: Record<EventType, string> = {
  [EventType.INDIVIDUAL]: 'Individual',
  [EventType.TEAM]: 'Team',
}

export function competitionLabel(entry: CatalogueEntry): string {
  return `${CATEGORY_DISPLAY[entry.category]} ${GENDER_DISPLAY[entry.gender]} ${WEAPON_DISPLAY[entry.weapon]} ${EVENT_TYPE_DISPLAY[entry.event_type]}`
}
