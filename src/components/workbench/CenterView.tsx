import { useEffect, useState } from 'react'
import { useStore } from '../../store/store.ts'
import { selectDerivedFindings, selectDerivedSchedule } from '../../store/derived.ts'
import { ScheduleOutput } from '../sections/ScheduleOutput.tsx'
import { AlertCircle } from 'lucide-react'

/** How long an edit must settle before the center relayouts (FR-008). */
export const CENTER_SETTLE_MS = 150

/**
 * The center region: the committed schedule, plus the dimmed-invalid overlay.
 *
 * Two rules run here at once (S2-contract.md §Center view and the
 * dimmed-invalid rule), and they compose:
 *
 * 1. Two-tier recompute (FR-008). Findings and metrics follow the store per
 *    keystroke — the drawer reads it directly and is not debounced — while the
 *    center renders a *committed* copy that a `CENTER_SETTLE_MS` timer
 *    replaces once an edit stops arriving. A debounce, deliberately, and not
 *    `useDeferredValue`: React flushes a deferred value inside `act()`, which
 *    would make the test proving the center did *not* relayout vacuous.
 * 2. Dimmed invalid (FR-009). While any derived finding is ERROR the commit is
 *    suppressed outright, so the center goes on showing whatever it last
 *    committed — the last valid layout once an edit has broken a config that
 *    was valid, or the invalid derivation itself on a cold boot into an
 *    already-invalid config (e.g. a shared URL), since there is no valid
 *    layout yet to fall back to. Dimmed, never blanked, either way, under any
 *    sequence of edits. The dim itself tracks the *live* findings, so it
 *    lands on the keystroke that broke the config rather than a settle later.
 */
export function CenterView() {
  const live = useStore(selectDerivedSchedule)
  const { validationErrors } = useStore(selectDerivedFindings)

  const blocking = validationErrors.filter((e) => e.severity === 'ERROR')
  const hasBlocking = blocking.length > 0

  const [committed, setCommitted] = useState(live)

  useEffect(() => {
    // An invalid config commits nothing at all — rule 2 above. The last valid
    // layout stays on screen until the config is valid again and settles.
    if (hasBlocking) return

    const timer = setTimeout(() => setCommitted(live), CENTER_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [live, hasBlocking])

  return (
    <main aria-label="Center view" className="relative flex-1 overflow-auto p-4">
      <div
        data-dimmed={hasBlocking ? 'true' : 'false'}
        className={hasBlocking ? 'opacity-40 pointer-events-none' : ''}
      >
        <ScheduleOutput schedule={committed} />
      </div>

      {hasBlocking && (
        <section
          aria-label="Blocking findings"
          aria-live="assertive"
          aria-atomic="true"
          className="absolute inset-x-4 top-4 rounded-md border border-red-200 bg-error p-4 text-error-text shadow-lg"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="h-4 w-4" />
            Configuration is invalid
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {blocking.map((e, i) => (
              <li key={`${e.field}-${i}`}>
                {e.field}: {e.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
