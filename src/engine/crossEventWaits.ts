/**
 * Cross-event waits – METHODOLOGY.md §Cross-Event Dependency Edges (021 T6a,
 * owner rulings O1 and O8).
 *
 * A wait makes one event's first phase (its waiter) not ready before another
 * event's anchor (its predecessor) + a gap: a younger Vet band waits on the
 * next-older band's first pool start, and a team waits on its individual
 * counterpart's last phase end. The concurrent scheduler keeps a waiter out of
 * its ready queue while any predecessor is pending, and these pure helpers
 * re-point a wait past a predecessor that failed for good, decide the floor
 * once every predecessor is placed, check that the waits form no cycle, and
 * check after the loop that no held event was left behind.
 */

/** What a wait is measured from on its predecessor. */
export const WaitAnchor = {
  /** The start of the predecessor's first pool phase (`POOLS` or `FLIGHT_A`). */
  FIRST_POOL_START: 'FIRST_POOL_START',
  /** The end of the predecessor's last phase. */
  TERMINAL_END: 'TERMINAL_END',
} as const
export type WaitAnchor = (typeof WaitAnchor)[keyof typeof WaitAnchor]

/** The waiter's first phase is not ready before the predecessor's anchor + gap. */
export interface CrossEventWait {
  waiter_id: string
  predecessor_id: string
  anchor: WaitAnchor
  gap: number
}

/**
 * Where a wait's predecessor stands. A predecessor that failed for good has no
 * state here: `passOverFailed` has already re-pointed or dropped its wait.
 */
export const PredecessorState = {
  /** The anchor is not placed yet, and the predecessor can still be placed. */
  PENDING: 'PENDING',
  /** The anchor is placed, at `time`. */
  PLACED: 'PLACED',
} as const
export type PredecessorState = (typeof PredecessorState)[keyof typeof PredecessorState]

export type PredecessorStatus =
  | { state: typeof PredecessorState.PENDING }
  | { state: typeof PredecessorState.PLACED; time: number }

/**
 * Held while any predecessor is pending. Otherwise the floor is the latest
 * anchor + gap over the placed predecessors, or null when no wait is left – the
 * waiter is then ready as if it had no predecessor. `binding` names the
 * predecessors whose anchor + gap equals the floor.
 */
export type WaitResolution =
  | { held: true }
  | { held: false; floor: number | null; binding: string[] }

export function resolveWaits(
  waits: readonly CrossEventWait[],
  statusOf: (wait: CrossEventWait) => PredecessorStatus,
): WaitResolution {
  let floor: number | null = null
  let binding: string[] = []
  for (const wait of waits) {
    const status = statusOf(wait)
    if (status.state === PredecessorState.PENDING) return { held: true }
    const candidate = status.time + wait.gap
    if (floor === null || candidate > floor) {
      floor = candidate
      binding = [wait.predecessor_id]
    } else if (candidate === floor) {
      binding.push(wait.predecessor_id)
    }
  }
  return { held: false, floor, binding }
}

/**
 * The wait a waiter owes once predecessors may have failed for good (O8): the
 * waiting event is ready as if the failed event did not exist. A Vet band's
 * first-pool-start wait then falls to the failed band's own first-pool-start
 * wait – the next-older band on the day – keeping the waiter and gap, and so on
 * up the chain. The wait lapses (null) when the chain runs out, and a
 * terminal-end wait (a team on its individual) lapses at once.
 *
 * Each step moves to another predecessor, so a walk longer than the waits
 * themselves has gone round a cycle, and it throws (constitution IV).
 */
export function passOverFailed(
  wait: CrossEventWait,
  waits: readonly CrossEventWait[],
  failed: (id: string) => boolean,
): CrossEventWait | null {
  let predecessorId = wait.predecessor_id
  for (let step = 0; step <= waits.length; step++) {
    if (!failed(predecessorId)) return { ...wait, predecessor_id: predecessorId }
    if (wait.anchor !== WaitAnchor.FIRST_POOL_START) return null
    const above = waits.find(w => w.waiter_id === predecessorId && w.anchor === WaitAnchor.FIRST_POOL_START)
    if (above === undefined) return null
    predecessorId = above.predecessor_id
  }
  throw new Error(`crossEventWaits: passing ${wait.waiter_id}'s wait over failed predecessors went round a cycle`)
}

/**
 * Throws when the waits form a cycle, whose waiters would all be held forever.
 * Kahn's algorithm: each pass removes one event with no unresolved
 * predecessor, so it runs at most once per event named (constitution IV).
 */
export function assertAcyclicWaits(waits: readonly CrossEventWait[]): void {
  const pendingPredecessors = new Map<string, number>()
  const waitersOf = new Map<string, string[]>()
  for (const w of waits) {
    pendingPredecessors.set(w.waiter_id, (pendingPredecessors.get(w.waiter_id) ?? 0) + 1)
    if (!pendingPredecessors.has(w.predecessor_id)) pendingPredecessors.set(w.predecessor_id, 0)
    waitersOf.set(w.predecessor_id, [...(waitersOf.get(w.predecessor_id) ?? []), w.waiter_id])
  }

  const free = [...pendingPredecessors].filter(([, n]) => n === 0).map(([id]) => id)
  let removed = 0
  while (free.length > 0) {
    const id = free.pop()!
    removed++
    for (const waiter of waitersOf.get(id) ?? []) {
      const left = pendingPredecessors.get(waiter)! - 1
      pendingPredecessors.set(waiter, left)
      if (left === 0) free.push(waiter)
    }
  }

  if (removed < pendingPredecessors.size) {
    const stuck = [...pendingPredecessors].filter(([, n]) => n > 0).map(([id]) => id).sort()
    throw new Error(`crossEventWaits: the waits form a cycle among ${stuck.join(', ')}`)
  }
}

/**
 * The post-loop bound: every event the loop owned is placed or permanently
 * failed. A held event whose release never came would otherwise vanish as
 * "unplaced" with no finding, so this throws, naming each unresolved event and
 * the predecessors it waits on.
 */
export function assertEveryEventResolved(
  outcomes: readonly { id: string; resolved: boolean }[],
  waits: readonly CrossEventWait[],
): void {
  const unresolved = outcomes.filter(o => !o.resolved)
  if (unresolved.length === 0) return
  const described = unresolved.map(o => {
    const on = waits.filter(w => w.waiter_id === o.id).map(w => w.predecessor_id)
    return on.length > 0 ? `${o.id} (waits on ${on.join(', ')})` : o.id
  })
  throw new Error(`concurrentScheduler: events neither placed nor failed after the loop: ${described.join('; ')}`)
}
