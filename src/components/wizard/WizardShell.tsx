import { useRef, useState, useEffect } from 'react'
import { useStore } from '../../store/store.ts'
import { Button } from '@/components/ui/button'
import { Check, ChevronLeft, ChevronRight, ChevronsDown } from 'lucide-react'
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
                  i <= currentStep ? 'bg-primary' : 'bg-slate-200'
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : isCompleted
                      ? 'bg-success text-success-foreground'
                      : 'border-2 border-muted-foreground/30 text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs ${
                  isCurrent
                    ? 'font-semibold text-primary'
                    : isCompleted
                      ? 'font-medium text-success'
                      : 'text-muted-foreground'
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

function ScrollableStepContent({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    const container = scrollRef.current
    if (!sentinel || !container) return

    // Reset scroll position when step content changes
    container.scrollTop = 0

    const observer = new IntersectionObserver(
      ([entry]) => setShowMore(!entry.isIntersecting),
      { root: container, threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [children])

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="max-h-[60vh] overflow-y-auto"
      >
        {children}
        {/* Sentinel at the bottom — when not visible, the "more" badge appears */}
        <div ref={sentinelRef} className="h-1" />
      </div>
      {showMore && (
        <div className="flex justify-center pb-1 pt-1">
          <span className="flex items-center gap-1 text-xs font-medium text-primary">
            More
            <ChevronsDown className="h-3 w-3" />
          </span>
        </div>
      )}
    </div>
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
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex justify-center">
        <StepIndicator currentStep={wizardStep} />
      </div>

      <ScrollableStepContent>{stepContent[wizardStep]}</ScrollableStepContent>

      <div className="mt-5 flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={wizardStep === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        {wizardStep < 4 && (
          <Button
            onClick={handleForward}
            disabled={forwardDisabled}
          >
            {wizardStep === 3 ? 'View Schedule' : 'Next'}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
