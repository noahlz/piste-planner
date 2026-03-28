import { useStore } from '../../store/store.ts'
import type { ValidationError } from '../../engine/types.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, AlertTriangle, Info, Check, X } from 'lucide-react'

const SEVERITY_ORDER = { ERROR: 0, WARN: 1, INFO: 2 } as const

const SEVERITY_CLASSES: Record<string, string> = {
  ERROR: 'border-red-200 bg-error text-error-text',
  WARN: 'border-amber-200 bg-warning text-warning-text',
  INFO: 'border-blue-200 bg-info text-info-text',
}

const SEVERITY_ICON = {
  ERROR: AlertCircle,
  WARN: AlertTriangle,
  INFO: Info,
} as const

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
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground">Analysis Output</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Run Validate to see results.</p>
        </CardContent>
      </Card>
    )
  }

  const sortedErrors = groupBySeverity(validationErrors)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-card-foreground">Analysis Output</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedErrors.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-card-foreground">Validation</h3>
            <div className="space-y-1">
              {sortedErrors.map((e, i) => {
                const Icon = SEVERITY_ICON[e.severity] ?? Info
                return (
                  <Alert
                    key={`${e.field}-${i}`}
                    className={SEVERITY_CLASSES[e.severity] ?? ''}
                  >
                    <Icon className="h-4 w-4" />
                    <AlertDescription>
                      <span className="font-medium">{e.field}:</span> {e.message}
                    </AlertDescription>
                  </Alert>
                )
              })}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-card-foreground">Warnings</h3>
            <div className="space-y-1">
              {warnings.map((w, i) => {
                const Icon = SEVERITY_ICON[w.severity] ?? Info
                return (
                  <Alert
                    key={`${w.competition_id}-${w.cause}-${i}`}
                    className={SEVERITY_CLASSES[w.severity] ?? ''}
                  >
                    <Icon className="h-4 w-4" />
                    <AlertDescription>
                      {w.competition_id && (
                        <span className="font-mono">{w.competition_id}</span>
                      )}{' '}
                      {w.message}
                    </AlertDescription>
                  </Alert>
                )
              })}
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-card-foreground">
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
                    <span className="flex-1 text-foreground">{s}</span>
                    {state === 'pending' ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="success"
                          onClick={() => acceptSuggestion(i)}
                        >
                          <Check className="h-3 w-3" />
                          Accept
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectSuggestion(i)}
                        >
                          <X className="h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Badge
                        variant={state === 'accepted' ? 'secondary' : 'destructive'}
                      >
                        {state === 'accepted' ? 'Accepted' : 'Rejected'}
                      </Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
