import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/store.ts'
import { selectConfigKey, selectDueKey, selectRerunDue } from '../../store/derived.ts'
import { runScheduleAll } from '../../store/runActions.ts'

/** How long the engine inputs must stay still before a due re-run fires (020 R2). */
export const RERUN_DEBOUNCE_MS = 300

/** How long a due re-run may keep the board waiting before "Updating…" shows (020 R1). */
export const RERUN_INDICATOR_DELAY_MS = 500

/** Whether the store still owes the run that was armed for `armedKey`. */
function stillOwed(armedKey: string): boolean {
  const state = useStore.getState()
  return selectRerunDue(state) && selectConfigKey(state) === armedKey
}

/**
 * Re-runs Auto-assign by itself once the engine inputs settle (020). The rule
 * is the store's (`selectRerunDue`); this hook only owns the timers. Called
 * once, from `CenterView`, so re-runs happen while the center is mounted.
 *
 * - **Debounce.** While due, each key change restarts one
 *   `RERUN_DEBOUNCE_MS` timer armed for that key. When it fires, the rule and
 *   the key are checked again against `getState()`, and `runScheduleAll` runs
 *   once only if both still hold.
 * - **Reveal clock (R1).** When due turns on, or the hook mounts while due,
 *   one `RERUN_INDICATOR_DELAY_MS` timer starts that key changes do not
 *   restart. `updating` is due and revealed, so it falls on the render due
 *   falls, with no extra write.
 * - **Late fire.** A debounce that fires `RERUN_INDICATOR_DELAY_MS` or more
 *   after due began, with "Updating…" not yet showing, reveals it first and
 *   waits past a frame (`requestAnimationFrame`, then `setTimeout(0)`) before
 *   it re-checks and runs, so the indicator can paint before the synchronous
 *   run. Best-effort: nothing proves the paint.
 *
 * Bounds (constitution IV): at most three timers live at once (the debounce,
 * the reveal, and the late-fire wait, a frame then a `setTimeout(0)`), every run is
 * preceded by a fresh rule check, and a run records its key before the engine
 * starts, so runs never outnumber the distinct keys the organizer reached.
 *
 * Lint shape (react-hooks v7): `Date.now()` only in effects, refs read only in
 * effects and timer callbacks, and `revealed` written only in a timer callback
 * or an effect cleanup.
 */
export function useAutoRerun(): { due: boolean; updating: boolean } {
  const dueKey = useStore(selectDueKey)
  const due = dueKey !== null
  const [revealed, setRevealed] = useState(false)
  const updating = due && revealed

  /** When this due episode began, for the late-fire check. Null while not due. */
  const dueSinceRef = useRef<number | null>(null)
  /** Whether "Updating…" is showing, as the timer callbacks need it. */
  const updatingRef = useRef(false)

  useEffect(() => {
    updatingRef.current = updating
  }, [updating])

  // Keyed on `due` alone: a key change inside the episode does not restart it.
  useEffect(() => {
    if (!due) return
    dueSinceRef.current = Date.now()
    const reveal = setTimeout(() => setRevealed(true), RERUN_INDICATOR_DELAY_MS)
    return () => {
      clearTimeout(reveal)
      dueSinceRef.current = null
      setRevealed(false)
    }
  }, [due])

  useEffect(() => {
    if (dueKey === null) return
    const armedKey = dueKey
    let frame: number | null = null
    let yieldTimer: ReturnType<typeof setTimeout> | null = null

    const debounce = setTimeout(() => {
      if (!stillOwed(armedKey)) return
      const since = dueSinceRef.current
      const late = since !== null && Date.now() - since >= RERUN_INDICATOR_DELAY_MS
      if (!late || updatingRef.current) {
        runScheduleAll()
        return
      }
      setRevealed(true)
      frame = requestAnimationFrame(() => {
        frame = null
        yieldTimer = setTimeout(() => {
          yieldTimer = null
          if (stillOwed(armedKey)) runScheduleAll()
        }, 0)
      })
    }, RERUN_DEBOUNCE_MS)

    return () => {
      clearTimeout(debounce)
      if (frame !== null) cancelAnimationFrame(frame)
      if (yieldTimer !== null) clearTimeout(yieldTimer)
    }
  }, [dueKey])

  return { due, updating }
}
