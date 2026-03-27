import { useStore } from '../../store/store.ts'
import type { ValidationError } from '../../engine/types.ts'

const SEVERITY_ORDER = { ERROR: 0, WARN: 1, INFO: 2 } as const

const SEVERITY_STYLES: Record<string, string> = {
  ERROR: 'text-error-text bg-error border-red-200',
  WARN: 'text-warning-text bg-warning border-amber-200',
  INFO: 'text-info-text bg-info border-blue-200',
}

function groupBySeverity(errors: ValidationError[]): ValidationError[] {
  return [...errors].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  )
}

export function AnalysisOutput() {
  const validationErrors = useStore((s) => s.validationErrors)
  const warnings = useStore((s) => s.warnings)
  const suggestions = useStore((s) => s.suggestions)
  const suggestionStates = useStore((s) => s.flightingSuggestionStates)
  const acceptSuggestion = useStore((s) => s.acceptFlightingSuggestion)
  const rejectSuggestion = useStore((s) => s.rejectFlightingSuggestion)

  const hasContent =
    validationErrors.length > 0 || warnings.length > 0 || suggestions.length > 0

  if (!hasContent) {
    return (
      <div className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
        <h2 className="text-lg font-semibold text-muted">Analysis Output</h2>
        <p className="text-sm text-muted">Run Validate to see results.</p>
      </div>
    )
  }

  const sortedErrors = groupBySeverity(validationErrors)

  return (
    <div className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-header">Analysis Output</h2>

      {sortedErrors.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-header">Validation</h3>
          <ul className="space-y-1">
            {sortedErrors.map((e, i) => (
              <li
                key={`${e.field}-${i}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${SEVERITY_STYLES[e.severity] ?? ''}`}
              >
                <span className="font-medium">[{e.severity}]</span> {e.field}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-header">Warnings</h3>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li
                key={`${w.competition_id}-${w.cause}-${i}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${SEVERITY_STYLES[w.severity] ?? ''}`}
              >
                <span className="font-medium">[{w.severity}]</span>{' '}
                {w.competition_id && <span className="font-mono">{w.competition_id}</span>}{' '}
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-header">
            Flighting Suggestions
          </h3>
          <ul className="space-y-2">
            {suggestions.map((s, i) => {
              const state = suggestionStates[i] ?? 'pending'
              return (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="flex-1 text-body">{s}</span>
                  {state === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => acceptSuggestion(i)}
                        className="rounded-md bg-success px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-success-hover focus:ring-2 focus:ring-success focus:outline-none"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectSuggestion(i)}
                        className="rounded-md bg-danger px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-danger-hover focus:ring-2 focus:ring-danger focus:outline-none"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        state === 'accepted'
                          ? 'bg-success/10 text-success'
                          : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {state === 'accepted' ? 'Accepted' : 'Rejected'}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
