// 013 T028: red tests for the selection surface phase 4 adds to UiSlice
// (phase4-contract.md §1) — `selectedCompetitionId` and `selectCompetition`,
// neither of which exists on the store yet. Also pins that the field stays
// out of the serialized tournament payload (it describes what the detail
// strip is showing, not tournament state) and that the existing `setPinned`
// leaves `source` untouched, which T029 builds DetailStrip's Pin action on.
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { serializeState } from '../../src/store/serialization.ts'
import { PlacementSource } from '../../src/engine/types.ts'
import type { Placement } from '../../src/engine/types.ts'

const CADET_MF = 'D1-M-FOIL-IND'

function makePlacement(overrides: Partial<Placement> = {}): Placement {
  return {
    day: 0,
    start_time: 480,
    strip_count: 4,
    strips: null,
    source: PlacementSource.AUTO,
    pinned: false,
    ...overrides,
  }
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('selectedCompetitionId', () => {
  it('defaults to null on a fresh store', () => {
    expect(useStore.getState().selectedCompetitionId).toBeNull()
  })

  it('selectCompetition(id) sets it', () => {
    useStore.getState().selectCompetition(CADET_MF)
    expect(useStore.getState().selectedCompetitionId).toBe(CADET_MF)
  })

  it('selectCompetition(null) clears it', () => {
    useStore.getState().selectCompetition(CADET_MF)
    useStore.getState().selectCompetition(null)
    expect(useStore.getState().selectedCompetitionId).toBeNull()
  })

  it('does not appear in serializeState\'s payload', () => {
    useStore.getState().selectCompetition(CADET_MF)
    const json = serializeState(useStore.getState())
    expect(json).not.toContain('"selectedCompetitionId"')
  })
})

describe('setPinned leaves source untouched (decision 6)', () => {
  it('flips pinned without changing a manual placement\'s source', () => {
    // setPlacementsFromAuto forces every entry to auto/unpinned regardless of
    // input (store.ts:372-380), so a manual, pinned starting placement is
    // written directly onto the state rather than through that action.
    useStore.setState({
      placements: { A: makePlacement({ source: PlacementSource.MANUAL, pinned: true }) },
    })

    useStore.getState().setPinned('A', false)

    expect(useStore.getState().placements.A).toEqual(
      makePlacement({ source: PlacementSource.MANUAL, pinned: false }),
    )
  })
})
