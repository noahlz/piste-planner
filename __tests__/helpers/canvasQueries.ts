/** The empty pinned set, for canvases that should draw no pin badges. */
export const NO_PINS: ReadonlySet<string> = new Set()

/**
 * Every `data-pinned` value on the canvas blocks of one event. Scoped to
 * `[data-event-block]` the way `Canvas.tsx` is, because `UnplacedDock` also
 * carries `data-event-id`.
 */
export function pinBadges(id: string): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(`[data-event-block][data-event-id="${id}"]`),
  ).map((el) => el.dataset.pinned ?? '')
}
