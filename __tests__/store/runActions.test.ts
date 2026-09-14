/**
 * `runScheduleAll` and pinned placements (013 T033, phase 6 contract §9.3).
 *
 * `scheduleAll` is wrapped with a pass-through spy so these tests can observe
 * the third argument `runScheduleAll` builds and passes through, without
 * duplicating the engine's own pinned-scheduling behavior (that's
 * `__tests__/engine/pinnedScheduling.test.ts`, dispatch A). The real
 * implementation still runs — only the call is recorded.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { DAY_AXIS_SPACING_MINS } from '../../src/store/buildConfig.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { PlacementSource } from '../../src/engine/types.ts'

vi.mock('../../src/engine/scheduler.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/engine/scheduler.ts')>()
  return { ...mod, scheduleAll: vi.fn(mod.scheduleAll) }
})

/**
 * Mirrors phase6-contract.md §1 — `scheduleAll` doesn't take a third argument
 * yet (T034 adds it), so reading it back off the spy's recorded call needs a
 * cast ahead of the export, per §10.
 */
interface PinnedPlacement {
  competition_id: string
  day: number
  start_time: number
  strip_count: number
}

function thirdArgOfCall(callIndex: number): PinnedPlacement[] | undefined {
  const call = vi.mocked(scheduleAll).mock.calls[callIndex] as unknown as [
    unknown,
    unknown,
    PinnedPlacement[] | undefined,
  ]
  return call[2]
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  vi.mocked(scheduleAll).mockClear()
})

describe('runScheduleAll — pinned placements', () => {
  it('passes placements pinned in range as the third argument to scheduleAll', () => {
    applyPreset('B1')
    runScheduleAll()

    const state = useStore.getState()
    const [pinId, placement] = Object.entries(state.placements)[0]
    state.setPinned(pinId, true)

    vi.mocked(scheduleAll).mockClear()
    runScheduleAll()

    expect(scheduleAll).toHaveBeenCalledTimes(1)
    const pinnedArg = thirdArgOfCall(0)
    expect(pinnedArg).toEqual([
      {
        competition_id: pinId,
        day: placement.day,
        start_time: placement.day * DAY_AXIS_SPACING_MINS + placement.start_time,
        strip_count: placement.strip_count,
      },
    ])
  })

  it('leaves out a pin whose day falls outside the current day range, and re-places it unpinned', () => {
    applyPreset('B1')
    runScheduleAll()

    const state = useStore.getState()
    const placementsBefore = state.placements
    const maxDay = Math.max(...Object.values(placementsBefore).map((p) => p.day))
    expect(maxDay).toBeGreaterThan(0)
    const pinId = Object.entries(placementsBefore).find(([, p]) => p.day === maxDay)![0]
    state.setPinned(pinId, true)

    // A count below the pin's day + 1 puts that day out of range (FR-060).
    state.setDays(maxDay)

    vi.mocked(scheduleAll).mockClear()
    const result = runScheduleAll()

    const pinnedArg = thirdArgOfCall(0)
    expect(pinnedArg).toEqual([])

    const after = useStore.getState().placements[pinId]
    expect(after.pinned).toBe(false)
    expect(after.source).toBe('auto')
    expect(after.day).toBeGreaterThanOrEqual(0)
    expect(after.day).toBeLessThan(maxDay)
    expect(result.placed + result.unplaced).toBe(
      Object.keys(useStore.getState().selectedCompetitions).length,
    )
  })

  it('keeps a placement pinned via setPinned (source auto) verbatim after the run', () => {
    applyPreset('B1')
    runScheduleAll()

    const state = useStore.getState()
    const [pinId, originalPlacement] = Object.entries(state.placements)[0]
    expect(originalPlacement.source).toBe('auto')
    state.setPinned(pinId, true)
    const expected = { ...originalPlacement, pinned: true }

    runScheduleAll()

    expect(useStore.getState().placements[pinId]).toEqual(expected)
  })

  it('keeps a placement pinned via updatePlacement (source manual) verbatim after the run', () => {
    applyPreset('B1')
    runScheduleAll()

    const state = useStore.getState()
    const pinId = Object.keys(state.placements)[1]
    state.updatePlacement(pinId, { day: 1, start_time: 600, strip_count: 6 })
    const expected = useStore.getState().placements[pinId]
    expect(expected.source).toBe('manual')
    expect(expected.pinned).toBe(true)

    runScheduleAll()

    expect(useStore.getState().placements[pinId]).toEqual(expected)
  })

  it('marks every non-pinned placement auto and unpinned after the run', () => {
    applyPreset('B1')
    const state = useStore.getState()
    const [pinId] = Object.entries(state.placements)[0] ?? []
    if (pinId) state.setPinned(pinId, true)

    runScheduleAll()

    for (const [id, placement] of Object.entries(useStore.getState().placements)) {
      if (id === pinId) continue
      expect(placement.pinned).toBe(false)
      expect(placement.source).toBe('auto')
    }
  })

  it('excludes pins from the placed/unplaced counts, exactly, and stamps lastAutoRun with the same values', () => {
    applyPreset('B1')
    runScheduleAll()

    const state = useStore.getState()
    const pinIds = Object.keys(state.placements).slice(0, 6)
    for (const id of pinIds) state.setPinned(id, true)

    const result = runScheduleAll()

    const totalCompetitions = Object.keys(useStore.getState().selectedCompetitions).length
    expect(result.placed + result.unplaced).toBe(totalCompetitions - pinIds.length)
    expect(useStore.getState().lastAutoRun).toEqual(expect.objectContaining(result))
  })

  it('drops a pinned placement for an id with no catalogue entry, and does not undercount attempted', () => {
    // No store action reaches this state — selectCompetitions/addCompetition
    // both go through defaultConfigForId, which already refuses an unknown
    // id. `deserializeState` does not: `validateSchema`'s "competitions"
    // check validates shape (fencer_count, flighted) only, never catalogue
    // membership (src/store/serialization.ts, "competitions" block), so a
    // hand-edited or corrupted save can carry an unknown id into
    // `selectedCompetitions` with a pinned placement attached. This
    // reproduces that state directly via setState rather than a full
    // serialize/deserialize round trip.
    applyPreset('B1')
    const before = useStore.getState()
    const totalCompetitions = Object.keys(before.selectedCompetitions).length

    useStore.setState({
      selectedCompetitions: {
        ...before.selectedCompetitions,
        'NO-SUCH-ID': { fencer_count: 10, flighted: false },
      },
      placements: {
        ...before.placements,
        'NO-SUCH-ID': {
          day: 0, start_time: 0, strip_count: 4, strips: null,
          source: PlacementSource.MANUAL, pinned: true,
        },
      },
    })

    vi.mocked(scheduleAll).mockClear()
    const result = runScheduleAll()

    const pinnedArg = thirdArgOfCall(0)
    expect(pinnedArg?.some((p) => p.competition_id === 'NO-SUCH-ID')).toBe(false)
    // buildCompetitions also drops the unknown id (buildConfig.ts), so the
    // real B1 competitions are the only ones attempted — undercounting would
    // read one lower than this.
    expect(result.placed + result.unplaced).toBe(totalCompetitions)
  })

  it('returns 0 placed and 0 unplaced when every event is pinned', () => {
    applyPreset('B1')
    runScheduleAll()

    const state = useStore.getState()
    for (const id of Object.keys(state.placements)) {
      state.setPinned(id, true)
    }

    const result = runScheduleAll()

    expect(result).toEqual({ placed: 0, unplaced: 0 })
    expect(useStore.getState().lastAutoRun).toEqual(
      expect.objectContaining({ placed: 0, unplaced: 0 }),
    )
  })
})
