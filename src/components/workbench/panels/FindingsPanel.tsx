import { ArrowRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '../../../store/store.ts'
import { FindingSeverity, selectFindings, type Finding } from '../../../store/derived.ts'

/**
 * Badge fill per severity (013 T032, contract §3, standing rule 13). Blocking
 * reuses the existing `--error`/`--error-text` pair and Note the existing
 * `--info`/`--info-text` pair; the contract names only those two plus
 * Unplaced explicitly and leaves Warning open. Warning shares Unplaced's
 * `--finding-badge` pair here: both are underlying WARN rows (contract §1's
 * `FindingSeverity` doc comment — Unplaced is "a Warning with a flag"), the
 * mockup draws every finding card in the one warm style regardless of
 * severity, and Unplaced's own "needs N strips" wording is what tells the two
 * apart, not a second badge colour.
 */
const BADGE_CLASSES: Record<FindingSeverity, string> = {
  [FindingSeverity.BLOCKING]: 'bg-error text-error-text',
  [FindingSeverity.WARNING]: 'bg-finding-badge text-finding-badge-text',
  [FindingSeverity.UNPLACED]: 'bg-finding-badge text-finding-badge-text',
  [FindingSeverity.NOTE]: 'bg-info text-info-text',
}

/**
 * The Findings inspector panel (013 T032, ui-contract.md §Findings, contract
 * §3, FR-022–FR-027, FR-060). Replaces the retired analysis-output section: rather than two
 * grouped lists over raw validation errors and bottleneck warnings, one
 * `selectFindings` row per list item, whatever its source and severity
 * (contract §1) — Blocking, Unplaced, Warning and Note in that order.
 *
 * "Show on grid" jumps the canvas to the row's target (`jumpToCompetition`,
 * store contract §2.1); "Dismiss finding" waves off a Warning or Unplaced row
 * (`dismissFinding`, contract §2.2 — a no-op on any other severity, so the
 * button is not even offered for those).
 */
export function FindingsPanel() {
  const findings = useStore(selectFindings)
  const jumpToCompetition = useStore((s) => s.jumpToCompetition)
  const dismissFinding = useStore((s) => s.dismissFinding)

  return (
    <div className="flex flex-col gap-2.5">
      <ul className="flex flex-col gap-2.5">
        {findings.map((row) => (
          <FindingRow key={row.id} row={row} onJump={jumpToCompetition} onDismiss={dismissFinding} />
        ))}
      </ul>
      {findings.length === 0 && (
        <p className="text-[12.5px] leading-normal text-neutral-600">
          Nothing to report for the current inputs.
        </p>
      )}
    </div>
  )
}

function FindingRow({
  row,
  onJump,
  onDismiss,
}: {
  row: Finding
  onJump: (id: string) => void
  onDismiss: (id: string) => void
}) {
  const dismissable =
    row.severity === FindingSeverity.WARNING || row.severity === FindingSeverity.UNPLACED
  const hasControls = row.target !== null || dismissable

  return (
    <li
      data-finding-id={row.id}
      data-severity={row.severity}
      className="rounded-[12px] border-[1.5px] border-finding-border bg-finding-bg px-3 py-[11px]"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          data-badge
          className={cn(
            'rounded-full px-[9px] py-[2px] text-[11.5px] font-semibold tracking-[.05em] uppercase',
            BADGE_CLASSES[row.severity],
          )}
        >
          {row.severity}
        </span>
        <span data-where className="truncate font-mono text-[10.5px] font-semibold text-neutral-600">
          {row.where}
        </span>
      </div>

      <p data-message className="mt-1.5 text-[12.5px] leading-[1.5] text-foreground">
        {row.message}
      </p>

      {hasControls && (
        <div className="mt-2 flex items-center gap-3">
          {row.target !== null && (
            <button
              type="button"
              onClick={() => onJump(row.target!)}
              className="flex items-center gap-1.5 text-[11.5px] font-semibold text-finding-link"
            >
              Show on grid
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
          {dismissable && (
            <button
              type="button"
              aria-label="Dismiss finding"
              title="Dismiss finding"
              onClick={() => onDismiss(row.id)}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-200 hover:text-foreground"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </li>
  )
}
