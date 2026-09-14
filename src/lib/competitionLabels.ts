import type { CatalogueEntry, VetAgeGroup } from '../engine/types.ts'
import { Category, EventType, Gender, Weapon, VetAgeGroup as VetAgeGroupEnum } from '../engine/types.ts'

const CATEGORY_DISPLAY: Record<Category, string> = {
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

// USA Fencing uses "Senior" for DIV1 team events — the age group is the same,
// but the official name differs between individual ("Div 1") and team ("Senior").
export function categoryDisplay(category: Category, eventType: EventType): string {
  if (category === Category.DIV1 && eventType === EventType.TEAM) return 'Senior'
  return CATEGORY_DISPLAY[category]
}

export const GENDER_DISPLAY: Record<Gender, string> = {
  [Gender.MEN]: "Men's",
  [Gender.WOMEN]: "Women's",
}

export const WEAPON_DISPLAY: Record<Weapon, string> = {
  [Weapon.FOIL]: 'Foil',
  [Weapon.EPEE]: 'Epee',
  [Weapon.SABRE]: 'Saber',
}

const EVENT_TYPE_DISPLAY: Record<EventType, string> = {
  [EventType.INDIVIDUAL]: 'Individual',
  [EventType.TEAM]: 'Team',
}

const VET_AGE_GROUP_DISPLAY: Record<VetAgeGroup, string> = {
  [VetAgeGroupEnum.VET40]: 'V40',
  [VetAgeGroupEnum.VET50]: 'V50',
  [VetAgeGroupEnum.VET60]: 'V60',
  [VetAgeGroupEnum.VET70]: 'V70',
  [VetAgeGroupEnum.VET80]: 'V80',
  [VetAgeGroupEnum.VET_COMBINED]: 'Combined',
}

export function vetAgeGroupDisplay(vetAgeGroup: VetAgeGroup): string {
  return VET_AGE_GROUP_DISPLAY[vetAgeGroup]
}

export function competitionLabel(entry: CatalogueEntry): string {
  const cat = categoryDisplay(entry.category, entry.event_type)
  const vetSuffix = entry.vet_age_group ? ` ${VET_AGE_GROUP_DISPLAY[entry.vet_age_group]}` : ''
  return `${cat}${vetSuffix} ${GENDER_DISPLAY[entry.gender]} ${WEAPON_DISPLAY[entry.weapon]} ${EVENT_TYPE_DISPLAY[entry.event_type]}`
}
