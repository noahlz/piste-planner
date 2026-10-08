import { formatClockMins } from '../engine/types.ts'

export function formatMinutes(mins: number | null): string {
  if (mins === null) return '—'
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Zero-padded 24-hour clock (FR-041): 480 → "08:00", 847 → "14:07". Past midnight
 * it wraps like the engine's `formatClockMins`, so 1510 → "01:10" and every
 * surface that names a late finish agrees (018 T3).
 */
export function formatClock(minutesFromMidnight: number): string {
  return formatClockMins(minutesFromMidnight)
}

// 6:00 AM (360) through 11:00 PM (1380) in 30-minute increments
export const TIME_OPTIONS: number[] = Array.from({ length: 35 }, (_, i) => 360 + i * 30)
