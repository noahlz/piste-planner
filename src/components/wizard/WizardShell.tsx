import { useStore } from '../../store/store.ts'
import { WizardStep1 } from './WizardStep1.tsx'
import { WizardStep2 } from './WizardStep2.tsx'
import { WizardStep3 } from './WizardStep3.tsx'
import { WizardStep4 } from './WizardStep4.tsx'
import { ScheduleView } from '../ScheduleView.tsx'

const STEP_LABELS = ['Tournament', 'Fencers', 'Referees', 'Analysis', 'Schedule'] as const

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <nav className="flex items-center gap-1">
      {STEP_LABELS.map((label, i) => {
        const isCurrent = i === currentStep
        const isCompleted = i < currentStep

        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className={`mx-1.5 h-0.5 w-8 rounded-full ${
                  i <= currentStep ? 'bg-accent' : 'bg-slate-200'
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isCurrent
                    ? 'bg-accent text-white shadow-sm'
                    : isCompleted
                      ? 'bg-green-600 text-white'
                      : 'border-2 border-slate-300 text-muted'
                }`}
              >
                {isCompleted ? (
                  // Checkmark for completed steps
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs ${
                  isCurrent
                    ? 'font-semibold text-accent'
                    : isCompleted
                      ? 'font-medium text-green-700'
                      : 'text-muted'
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

export function WizardShell() {
  const wizardStep = useStore((s) => s.wizardStep)
  const setStep = useStore((s) => s.setStep)
  const validationErrors = useStore((s) => s.validationErrors)

  const hasHardErrors = validationErrors.some((e) => e.severity === 'ERROR')

  // Forward is blocked on step 3 (Analysis) when hard validation errors exist
  const forwardDisabled = wizardStep === 3 && hasHardErrors

  function handleBack() {
    if (wizardStep > 0) setStep(wizardStep - 1)
  }

  function handleForward() {
    if (forwardDisabled) return
    if (wizardStep < 4) setStep(wizardStep + 1)
  }

  const stepContent = [
    <WizardStep1 key="step1" />,
    <WizardStep2 key="step2" />,
    <WizardStep3 key="step3" />,
    <WizardStep4 key="step4" />,
    <ScheduleView key="schedule" />,
  ]

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex justify-center">
        <StepIndicator currentStep={wizardStep} />
      </div>

      <div className="min-h-[300px]">{stepContent[wizardStep]}</div>

      <div className="mt-8 flex justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={wizardStep === 0}
          className="rounded-md border border-slate-200 bg-card px-5 py-2 text-sm font-medium text-body transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>

        {wizardStep < 4 && (
          <button
            type="button"
            onClick={handleForward}
            disabled={forwardDisabled}
            className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {wizardStep === 3 ? 'View Schedule' : 'Next'}
          </button>
        )}
      </div>
    </div>
  )
}
