/**
 * A `ResizeObserver` stub for jsdom, which implements none. `observe()`
 * invokes the callback once with a fixed content rect, exercising whatever
 * real measurement path a component takes (Canvas's plot width, Radix's
 * popper sizing) rather than routing around it.
 *
 * Shared by `Canvas.test.tsx`, `CanvasTooltip.test.tsx` and
 * `recompute.test.tsx` (013 T024–T026 review follow-up) — the three had each
 * hand-duplicated the same class with only their content-rect dimensions
 * differing.
 */
function makeStubResizeObserver(width: number, height: number) {
  return class StubResizeObserver {
    callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe(): void {
      this.callback(
        [{ contentRect: { width, height } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }

    unobserve(): void {}
    disconnect(): void {}
  }
}

/**
 * Installs the stub at `globalThis.ResizeObserver` and returns a restore
 * function — call it from `afterEach` to put the original (usually
 * `undefined` under jsdom) back.
 */
export function installStubResizeObserver(width: number, height: number): () => void {
  const original = globalThis.ResizeObserver
  globalThis.ResizeObserver = makeStubResizeObserver(width, height) as unknown as typeof ResizeObserver
  return () => {
    globalThis.ResizeObserver = original
  }
}

/**
 * A `ResizeObserver` that never invokes its callback — jsdom offering no
 * measurement at all, rather than a delayed one. `Canvas.tsx`'s fit-fallback
 * case (research D3, `FIT_FALLBACK_STEP`) is the one test that wants this
 * instead of the width/height stub above.
 */
export class NeverFiringResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
