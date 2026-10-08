/**
 * The last run, kept in memory (017 spec §1). `runScheduleAll` keeps what the
 * scheduler built – each phase's times and the strip indices it claimed – so
 * the canvas can draw the engine's own board instead of re-deriving one.
 *
 * Times here are on each event's own day clock (minutes from that day's
 * midnight), not the scheduler's `day × DAY_AXIS_SPACING_MINS` axis, so a kept
 * phase reads like a derived one.
 *
 * Nothing in this module reads the store. The store holds a `KeptRun` and the
 * drawn model decides whether it still applies by comparing `configKey`.
 */

import { DAY_AXIS_SPACING_MINS } from '../engine/types.ts'
import type {
  Competition,
  Phase,
  PinnedPlacement,
  ScheduleResult,
  StripAllocation,
  TournamentConfig,
} from '../engine/types.ts'
import { placementFromResult } from '../engine/derive.ts'
import { phaseKey, phaseSpans } from '../engine/unseated.ts'

/** One phase of a kept event. `strips` is empty for a phase the run timed but could not seat. */
export interface KeptPhase {
  phase: Phase
  startMinutes: number
  endMinutes: number
  stripCount: number
  strips: readonly number[]
}

export interface KeptEvent {
  /** The placement that made this record true. A different one means the event was moved since. */
  placementKey: { day: number; start_time: number; strip_count: number }
  /** The scheduler's result for the event, on the clock axis. */
  result: ScheduleResult
  phases: KeptPhase[]
}

export interface KeptRun {
  /** `configKeyOf` of the inputs the run read. */
  configKey: string
  /** The pins the run was given, on the scheduler axis, so a link can replay it (R6). */
  pins: PinnedPlacement[]
  events: Record<string, KeptEvent>
}

/** Deeper than any engine input nests, so only a cycle or a foreign object reaches it. */
const MAX_KEY_DEPTH = 16

/**
 * One value in the key's text form. Numbers carry a prefix so `Infinity`,
 * `-Infinity`, `NaN` and `null` stay four different keys (`JSON.stringify`
 * writes all four as `null`), and the number 1 stays different from the
 * string "1".
 */
function encode(value: unknown, depth: number): string {
  if (depth > MAX_KEY_DEPTH) throw new Error('configKeyOf: input nests deeper than any engine input')
  if (value === null) return 'null'
  switch (typeof value) {
    case 'number': return `n${value}`
    case 'string': return JSON.stringify(value)
    case 'boolean': return value ? 'true' : 'false'
    case 'undefined': return 'undefined'
    case 'object': break
    default: throw new Error(`configKeyOf: cannot key a ${typeof value}`)
  }
  if (Array.isArray(value)) return `[${value.map(item => encode(item, depth + 1)).join(',')}]`
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    throw new Error('configKeyOf: cannot key an object that is not a plain object')
  }
  // Sorted by key so the text does not depend on the order fields were written
  // in. An undefined field is left out, as `JSON.stringify` leaves it out.
  const fields = Object.keys(value)
    .filter(key => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${encode((value as Record<string, unknown>)[key], depth + 1)}`)
  return `{${fields.join(',')}}`
}

/**
 * The text two runs share only when the engine would read identical inputs
 * (017 spec §2): the whole config and every Competition, compared by string
 * equality and never by hand-picked fields, so a new input invalidates a kept
 * run without anyone remembering to list it. Arrays keep their order, since a
 * deselect and reselect that reorders competitions can change the schedule.
 */
export function configKeyOf(config: TournamentConfig, competitions: Competition[]): string {
  return encode({ config, competitions }, 0)
}

/** Every `ScheduleResult` field that holds a time on the scheduler's axis. */
const TIME_FIELDS = [
  'pool_start', 'pool_end',
  'flight_a_start', 'flight_a_end',
  'flight_b_start', 'flight_b_end',
  'de_start', 'de_end',
  'de_prelims_start', 'de_prelims_end',
  'de_round_of_16_start', 'de_round_of_16_end',
  'de_total_end',
] as const satisfies readonly (keyof ScheduleResult)[]

/** A copy of the result with every time less `assigned_day × DAY_AXIS_SPACING_MINS`, a null time staying null. */
export function resultOnClockAxis(result: ScheduleResult): ScheduleResult {
  const offset = result.assigned_day * DAY_AXIS_SPACING_MINS
  const shifted: ScheduleResult = { ...result }
  for (const field of TIME_FIELDS) {
    const time = result[field]
    shifted[field] = time === null ? null : time - offset
  }
  return shifted
}

/**
 * Records a `scheduleAll` run: for each event with a pool start, its result on
 * the clock axis, the phases the engine timed (`phaseSpans`, so a zero-length
 * phase is not one) and the strip indices each claimed.
 *
 * A pinned event's `placementKey` is its pin, not its result: pre-claim caps
 * the result's strip count at `min(desired, pin.strip_count)`, so a pin asking
 * for more strips than the event can use would otherwise fail its own key the
 * moment the run ended. `setPlacementsFromAuto` keeps the pin as the
 * placement, so the pin is what the key must equal.
 */
export function keepRun(
  run: { schedule: Record<string, ScheduleResult>; strip_allocations: StripAllocation[][] },
  config: TournamentConfig,
  competitions: Competition[],
  pins: readonly PinnedPlacement[],
): KeptRun {
  const claimed = new Map<string, Set<number>>()
  run.strip_allocations.forEach((strip, index) => {
    for (const allocation of strip) {
      const key = phaseKey(allocation.event_id, allocation.phase)
      const indices = claimed.get(key)
      if (indices) indices.add(index)
      else claimed.set(key, new Set([index]))
    }
  })

  const pinById = new Map(pins.map(pin => [pin.competition_id, pin]))
  const events: Record<string, KeptEvent> = {}
  for (const [id, result] of Object.entries(run.schedule)) {
    const fromResult = placementFromResult(result)
    if (fromResult === null) continue

    const clock = resultOnClockAxis(result)
    const pin = pinById.get(id)
    events[id] = {
      placementKey: pin
        ? {
            day: pin.day,
            start_time: pin.start_time - pin.day * DAY_AXIS_SPACING_MINS,
            strip_count: pin.strip_count,
          }
        : { day: fromResult.day, start_time: fromResult.start_time, strip_count: fromResult.strip_count },
      result: clock,
      phases: phaseSpans(clock).map(span => ({
        phase: span.phase,
        startMinutes: span.start,
        endMinutes: span.end,
        stripCount: span.stripCount,
        strips: [...(claimed.get(phaseKey(id, span.phase)) ?? [])].sort((a, b) => a - b),
      })),
    }
  }

  return { configKey: configKeyOf(config, competitions), pins: [...pins], events }
}
