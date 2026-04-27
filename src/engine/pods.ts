import type { GlobalState, TournamentConfig, Pod, Phase } from './types.ts'
import { findAvailableStripsInWindow, allocateInterval } from './resources.ts'

// ──────────────────────────────────────────────
// Pod allocation primitive
// ──────────────────────────────────────────────

/**
 * Result of allocatePods. On success, returns the list of Pods (one per
 * pod_id). On a no-window miss, returns null and writes nothing — callers can
 * retry with a different start_time or fall back to flat allocation.
 */
export type AllocatePodsResult = { pods: Pod[] } | null

/**
 * Lowercases a Phase value for use in pod IDs. Phase values are ALL_CAPS
 * snake_case (e.g. `DE_ROUND_OF_16`) and the slug just lowercases them so the
 * resulting pod ID stays readable and stable across calls.
 */
function phaseSlug(phase: Phase): string {
  return phase.toLowerCase()
}

/**
 * Allocates one or more pods for a STAGED-DE phase.
 *
 * A pod is a logical group of up to `pod_size` strips that runs a DE round
 * together with one head referee. The function computes
 *   pod_count = ceil(total_strip_count / pod_size)
 * and groups the strips returned by findAvailableStripsInWindow into that many
 * pods. The first `pod_count - 1` pods are full (`pod_size` strips each) while
 * the last pod gets the remainder (1 to pod_size strips). Finals (1 strip,
 * pod_size=4) yields one partial pod of 1 strip.
 *
 * Signature note: the spec at plan lines 73-82 listed `pod_count` and
 * `pod_size` as separate inputs. We chose `total_strip_count` and `pod_size`
 * here because the partial-last-pod semantics fall out naturally — callers ask
 * for "N strips grouped into pods of K" rather than expressing partial pods
 * with fractional counts.
 *
 * Pod ID scheme: `${event_id}-${phaseSlug(phase)}-pod${i}` where i is 0-based.
 * Example: `evt123-de_round_of_16-pod0`. IDs are unique within a single call
 * and stable across calls with the same (event_id, phase) inputs.
 *
 * Behavior:
 * - If `total_strip_count <= 0` or `pod_size <= 0`, returns null without
 *   touching state.
 * - Calls findAvailableStripsInWindow once with `total_strip_count` strips and
 *   the given window. If `fit !== 'ok'`, returns null without writing
 *   anything.
 * - On a hit, splits the returned indices into pods of `pod_size` and calls
 *   allocateInterval per-pod so each StripAllocation entry carries the pod_id.
 *
 * Pure: state is mutated via allocateInterval but no global state is read or
 * written outside `state`. Bounded iteration (one loop over the pods).
 */
export function allocatePods(
  state: GlobalState,
  config: TournamentConfig,
  event_id: string,
  phase: Phase,
  total_strip_count: number,
  pod_size: number,
  start_time: number,
  duration: number,
  video_required: boolean,
): AllocatePodsResult {
  if (total_strip_count <= 0 || pod_size <= 0) return null

  const win = findAvailableStripsInWindow(
    state,
    config,
    total_strip_count,
    start_time,
    duration,
    video_required,
  )
  if (win.fit !== 'ok') return null

  const end_time = start_time + duration
  const pod_count = Math.ceil(total_strip_count / pod_size)
  const slug = phaseSlug(phase)
  const pods: Pod[] = []

  for (let i = 0; i < pod_count; i++) {
    const offset = i * pod_size
    const remaining = total_strip_count - offset
    const size = Math.min(pod_size, remaining)
    const pod_strip_indices = win.strip_indices.slice(offset, offset + size)
    const pod_id = `${event_id}-${slug}-pod${i}`
    allocateInterval(state, event_id, phase, pod_strip_indices, start_time, end_time, pod_id)
    pods.push({ id: pod_id, strip_indices: pod_strip_indices })
  }

  return { pods }
}
