// 013 T028: red tests for the selection surface phase 4 adds to UiSlice
// (phase4-contract.md §1) — `selectedCompetitionId` and `selectCompetition`,
// neither of which exists on the store yet. Also pins that the field stays
// out of the serialized tournament payload (it describes what the detail
// strip is showing, not tournament state) and that the existing `setPinned`
// leaves `source` untouched, which T029 builds DetailStrip's Pin action on.
//
// 013 T030 adds `jumpNonce`/`jumpToCompetition` (phase5-contract.md §2.1),
// the Findings panel's "Show on grid" jump — neither exists on the store yet
// either.
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { serializeState } from '../../src/store/serialization.ts'
import { PlacementSource } from '../../src/engine/types.ts'
import type { Placement } from '../../src/engine/types.ts'

/**
 * `jumpNonce`/`jumpToCompetition` are not yet on the store (013 T030 adds
 * them; phase5-contract.md §2.1). This cast is a deliberate, typed reference
 * to a slice that does not exist yet — the same pattern
 * __tests__/components/canvas/Canvas.test.tsx's `FutureState` uses for
 * `selectedCompetitionId`/`selectCompetition` before T029 landed those.
 */
interface JumpSlice {
  jumpNonce: number
  jumpToCompetition: (id: string) => void
}
type FutureState = StoreState & JumpSlice
function futureState(): FutureState {
  return useStore.getState() as unknown as FutureState
}

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

describe('jumpToCompetition (013 T030, contract §2.1)', () => {
  it('jumpNonce defaults to 0', () => {
    expect(futureState().jumpNonce).toBe(0)
  })

  it('jumpToCompetition(id) sets selectedCompetitionId and increments jumpNonce', () => {
    futureState().jumpToCompetition(CADET_MF)

    expect(useStore.getState().selectedCompetitionId).toBe(CADET_MF)
    expect(futureState().jumpNonce).toBe(1)
  })

  it('a second call increments jumpNonce again', () => {
    futureState().jumpToCompetition(CADET_MF)
    futureState().jumpToCompetition(CADET_MF)

    expect(futureState().jumpNonce).toBe(2)
  })

  it('does not appear in serializeState\'s payload', () => {
    futureState().jumpToCompetition(CADET_MF)
    const json = serializeState(useStore.getState())

    expect(json).not.toContain('"jumpNonce"')
    expect(json).not.toContain('"selectedCompetitionId"')
  })
})
