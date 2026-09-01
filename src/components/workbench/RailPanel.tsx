import { useId, useState, type ReactNode } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RailPanelProps {
  heading: string
  defaultOpen?: boolean
  /**
   * Dim text rendered under the heading, between the trigger and the content
   * and therefore *outside* `CollapsibleContent` — Radix unmounts the content
   * on close, and the Advanced panel's applied defaults have to stay readable
   * while the panel is collapsed (FR-035). Omitted by the five panels that have
   * nothing to say while shut.
   */
  summary?: ReactNode
  children: ReactNode
}

/**
 * One collapsible panel. The trigger's accessible name is the heading,
 * present in the DOM whether the panel is open or closed — Radix only
 * unmounts the content (S2-contract.md §Rail panels).
 *
 * Lives in its own module rather than inside `Rail.tsx` so `AdvancedPanel` can
 * import it without the two files importing each other (T068 finding 7, which
 * removed the byte-for-byte copy of this trigger that `AdvancedPanel` carried
 * while the summary slot did not exist).
 */
export function RailPanel({ heading, defaultOpen = false, summary, children }: RailPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  // Per instance, so two panels with summaries cannot collide on one id.
  const summaryId = useId()
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          // A summary that is only in the DOM is reachable in browse mode and
          // silent on tab — the trigger announces "<heading>, collapsed" and
          // none of what it summarises. `aria-describedby` is the tie; it feeds
          // the description, leaving the accessible name the heading.
          // `undefined` and not the id when there is no summary, so the
          // attribute never points at an element that was not rendered.
          aria-describedby={summary === undefined ? undefined : summaryId}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-foreground/5"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          />
          {heading}
        </button>
      </CollapsibleTrigger>
      {summary !== undefined && (
        <div
          id={summaryId}
          className="flex flex-col gap-0.5 pb-2 pl-8 pr-3 text-xs text-muted-foreground"
        >
          {summary}
        </div>
      )}
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}
