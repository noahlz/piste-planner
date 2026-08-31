import { useState, type ReactNode } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TournamentSetup } from '../sections/TournamentSetup.tsx'
import { StripSetup } from '../sections/StripSetup.tsx'
import { CompetitionMatrix } from '../sections/CompetitionMatrix.tsx'
import { FencerCounts } from '../sections/FencerCounts.tsx'
import { CompetitionOverrides } from '../sections/CompetitionOverrides.tsx'
import { PoolDurationSettings } from '../sections/PoolDurationSettings.tsx'

interface RailPanelProps {
  heading: string
  defaultOpen?: boolean
  children: ReactNode
}

/** One collapsible panel. The trigger's accessible name is the heading,
 *  present in the DOM whether the panel is open or closed — Radix only
 *  unmounts the content (S2-contract.md §Rail panels). */
function RailPanel({ heading, defaultOpen = false, children }: RailPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-foreground/5"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          />
          {heading}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/**
 * The left rail: five collapsible panels over existing section components,
 * mounted unmodified (FR-004, S2-contract.md §Rail panels). Scrolls
 * independently of the center.
 */
export function Rail() {
  return (
    <aside aria-label="Left rail" className="w-80 shrink-0 overflow-y-auto border-r bg-background">
      <RailPanel heading="Tournament" defaultOpen>
        <TournamentSetup />
      </RailPanel>
      <RailPanel heading="Strips" defaultOpen>
        <StripSetup />
      </RailPanel>
      <RailPanel heading="Events" defaultOpen>
        <div className="space-y-3">
          <CompetitionMatrix />
          <FencerCounts />
        </div>
      </RailPanel>
      <RailPanel heading="Per-event overrides">
        <CompetitionOverrides />
      </RailPanel>
      <RailPanel heading="Pool durations">
        <PoolDurationSettings />
      </RailPanel>
    </aside>
  )
}
