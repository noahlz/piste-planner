export function formatMinutes(mins: number | null): string {
  if (mins === null) return '—'
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}
