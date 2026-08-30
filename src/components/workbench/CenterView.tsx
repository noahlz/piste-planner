import { ScheduleOutput } from '../sections/ScheduleOutput.tsx'

/**
 * The center region's landmark, mounting the schedule table with no props —
 * it reads the live derived schedule directly. The debounced commit, the
 * CENTER_SETTLE_MS export, and the dimmed-invalid overlay are T017/T018
 * (S2-contract.md §Center view and the dimmed-invalid rule) and land in a
 * later session.
 */
export function CenterView() {
  return (
    <main aria-label="Center view" className="flex-1 overflow-auto p-4">
      <ScheduleOutput />
    </main>
  )
}
