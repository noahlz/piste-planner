import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { loadViewState, saveViewState } from '../../store/viewState.ts'
import { AnalysisOutput } from '../sections/AnalysisOutput.tsx'

const MIN_HEIGHT = 96
const MAX_HEIGHT = 640
const RESIZE_STEP = 24

function clampHeight(height: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height))
}

/**
 * The resizable bottom drawer, holding the findings list (FR-006,
 * S2-contract.md §Drawer). The scorecard is US3's — omitted here.
 *
 * Height starts from the persisted view state and is bounded to
 * [MIN_HEIGHT, MAX_HEIGHT] on every change, keyboard or pointer, so the
 * resize handle can never grow the drawer without limit (constitution IV).
 */
export function Drawer() {
  const [height, setHeight] = useState<number>(() => loadViewState().drawerHeight)
  const dragStart = useRef<{ pointerY: number; height: number } | null>(null)

  function persistHeight(next: number): void {
    saveViewState({ ...loadViewState(), drawerHeight: next })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = clampHeight(height + RESIZE_STEP)
      setHeight(next)
      persistHeight(next)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = clampHeight(height - RESIZE_STEP)
      setHeight(next)
      persistHeight(next)
    }
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>): void {
    dragStart.current = { pointerY: e.clientY, height }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>): void {
    if (!dragStart.current) return
    // The handle sits above the drawer, so moving the pointer up (a
    // negative clientY delta) should grow the drawer.
    const delta = dragStart.current.pointerY - e.clientY
    setHeight(clampHeight(dragStart.current.height + delta))
  }

  function handlePointerUp(): void {
    if (!dragStart.current) return
    dragStart.current = null
    persistHeight(height)
  }

  return (
    <section
      aria-label="Drawer"
      className="flex shrink-0 flex-col border-t bg-background"
      style={{ height }}
    >
      <div
        role="separator"
        aria-label="Resize drawer"
        aria-orientation="horizontal"
        tabIndex={0}
        className="h-1.5 shrink-0 cursor-row-resize bg-border hover:bg-foreground/20"
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className="flex-1 overflow-y-auto p-3">
        <AnalysisOutput />
      </div>
    </section>
  )
}
