import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CenterView } from '../../../src/components/workbench/CenterView.tsx'
import { useStore } from '../../../src/store/store.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  loadViewState,
  saveViewState,
} from '../../../src/store/viewState.ts'

// 004 T040 — the Matrix ⇄ Schedule choice is a viewer preference, so it
// persists to localStorage and never to the URL (research D10).
//
// viewEquivalence.test.tsx proves the toggle swaps the views and that the
// matrix is the default, and every case that seeds a view proves the stored
// value is *read*. Nothing proved it is *written*: deleting the saveViewState
// call in CenterView left the whole suite green, since a choice held only in
// React state still swaps the views for as long as the component is mounted.

beforeEach(() => {
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
})

describe('the center view choice survives the component (research D10)', () => {
  it('stores the chosen view, and opens on it after a remount', () => {
    render(<CenterView />)
    expect(screen.getByRole('radio', { name: 'Matrix' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))
    expect(loadViewState().viewMode).toBe('schedule')

    // A remount reads it back rather than falling to the matrix default —
    // the write and the read have to name the same field of the same key.
    cleanup()
    render(<CenterView />)
    expect(screen.getByRole('radio', { name: 'Schedule' })).toBeChecked()
    // Nothing is placed here, so the table view is its empty-state card rather
    // than a <table> — the canvas being gone is what says which view opened.
    expect(screen.queryByRole('region', { name: 'Matrix canvas' })).not.toBeInTheDocument()
    expect(screen.getByText('No events placed yet.')).toBeInTheDocument()
  })

  it('leaves the view-state fields the center does not own alone', () => {
    // The canvas owns the window and the row height, the drawer owns its
    // height: a toggle that wrote its own field over a whole default state
    // would silently reset every one of them.
    saveViewState({
      ...DEFAULT_VIEW_STATE,
      timeScroll: 900,
      timeZoom: 3,
      rowScroll: 7,
      drawerHeight: 321,
      scorecardExpanded: true,
    })
    render(<CenterView />)

    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))

    const stored = loadViewState()
    expect(stored.viewMode).toBe('schedule')
    expect(stored.timeScroll).toBe(900)
    expect(stored.timeZoom).toBe(3)
    expect(stored.rowScroll).toBe(7)
    expect(stored.drawerHeight).toBe(321)
    expect(stored.scorecardExpanded).toBe(true)
  })
})
