export function formatMinutes(mins: number | null): string {
  if (mins === null) return '—'
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

/** Zero-padded 24-hour clock (FR-041): 480 → "08:00", 847 → "14:07". */
export function formatClock(minutesFromMidnight: number): string {
  const hours = Math.floor(minutesFromMidnight / 60)
  const minutes = minutesFromMidnight % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

// 6:00 AM (360) through 11:00 PM (1380) in 30-minute increments
export const TIME_OPTIONS: number[] = Array.from({ length: 35 }, (_, i) => 360 + i * 30)
