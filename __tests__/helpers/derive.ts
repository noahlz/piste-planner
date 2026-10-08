import { deriveEventSchedule, estimateEventFootprint } from '../../src/engine/derive.ts'
import type { DerivedEventSchedule, EventFootprint } from '../../src/engine/derive.ts'

/**
 * `deriveEventSchedule` for an event whose count the test made sizeable. The
 * engine answers `null` for a count it cannot size (018 T4); a test that meant
 * to size its event fails here, naming the count, instead of on a later
 * property read.
 */
export function deriveSized(...args: Parameters<typeof deriveEventSchedule>): DerivedEventSchedule {
  const derived = deriveEventSchedule(...args)
  if (derived === null) {
    throw new Error(`deriveEventSchedule gave no result for ${args[1].id} (fencer_count ${args[1].fencer_count})`)
  }
  return derived
}

/** `estimateEventFootprint` for a sizeable event, failing loudly on `null` as `deriveSized` does. */
export function footprintSized(...args: Parameters<typeof estimateEventFootprint>): EventFootprint {
  const footprint = estimateEventFootprint(...args)
  if (footprint === null) {
    throw new Error(`estimateEventFootprint gave no result for ${args[0].id} (fencer_count ${args[0].fencer_count})`)
  }
  return footprint
}
