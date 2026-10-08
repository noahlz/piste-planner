import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { selectTemplateDaysHint } from '../../src/store/templateHint.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { applyLoadedState } from '../../src/store/exportActions.ts'
import { TEMPLATES, templateMinDays } from '../../src/engine/catalogue.ts'
import { TournamentType } from '../../src/engine/types.ts'

// 019 R3: the Tournament panel's built-in hint, shown only when the board's days
// are below the loaded template's minimum for the board's type. The guards each
// hold every condition except one and assert that the one is really absent.

const CADET_JUNIOR = 'NAC Cadet/Junior'

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

const hint = (): string | null => selectTemplateDaysHint(useStore.getState())

/** `template` applied on a `type` board, then lowered to `days` by hand (the Days pills). */
function lowered(template: string, type: TournamentType, days: number): void {
  const s = useStore.getState()
  s.setTournamentType(type)
  s.applyTemplate(template)
  s.setDays(days)
}

describe('selectTemplateDaysHint', () => {
  it('names the template, its day count and the board type when days are lowered below the minimum', () => {
    lowered(CADET_JUNIOR, TournamentType.NAC, 3)

    expect(hint()).toContain('NAC Cadet/Junior needs 4 days on a NAC board.')
  })

  it('names 3 days for NAC Vet/Div1/Junior on a 2-day RYC board', () => {
    lowered('NAC Vet/Div1/Junior', TournamentType.RYC, 2)

    expect(hint()).toContain('NAC Vet/Div1/Junior needs 3 days on a RYC board.')
  })

  it.each([
    [
      'NAC Cadet/Junior',
      TournamentType.NAC,
      3,
      'NAC Cadet/Junior needs 4 days on a NAC board. Cadet and Junior events of one weapon and gender may never ' +
        'share a day, and neither may a team event and an individual event of the same age group. ' +
        'With fewer days some of them share a day, and the Findings panel flags each pair after Auto-assign.',
    ],
    [
      'NAC Vet/Div1/Junior',
      TournamentType.RYC,
      2,
      'NAC Vet/Div1/Junior needs 3 days on a RYC board. Veteran age-group events of one weapon and gender run on ' +
        'one day, and neither the Veteran Combined nor the Veteran team event may join them or each other. ' +
        'With fewer days some of them share a day, and the Findings panel flags each pair after Auto-assign.',
    ],
    [
      'NAC Youth',
      TournamentType.NAC,
      1,
      'NAC Youth needs 2 days on a NAC board. Some of its events may never share a day. ' +
        'With fewer days some of them share a day, and the Findings panel flags each pair after Auto-assign.',
    ],
  ])('says exactly this for %s on %s at %i days', (template, type, days, text) => {
    lowered(template, type, days)

    expect(hint()).toBe(text)
  })

  it('follows the tournament type: none on RYC at 3 days, shown once the type is NAC', () => {
    lowered(CADET_JUNIOR, TournamentType.RYC, 3)
    expect(hint()).toBeNull()

    useStore.getState().setTournamentType(TournamentType.NAC)

    expect(hint()).toContain('needs 4 days on a NAC board')
  })

  it('follows the tournament type back: shown on NAC at 3 days, gone once the type is RYC', () => {
    lowered(CADET_JUNIOR, TournamentType.NAC, 3)
    expect(hint()).not.toBeNull()

    useStore.getState().setTournamentType(TournamentType.RYC)

    expect(hint()).toBeNull()
  })

  describe('guards – every condition holds except one', () => {
    it('shows no hint when the loaded id is a preset, not a template', () => {
      const s = useStore.getState()
      s.applyTemplate(CADET_JUNIOR)
      applyPreset('B1')
      s.setDays(3)
      // B1 holds only a few of the template's events, so put them all back: the
      // id is then the only condition missing.
      useStore.getState().selectCompetitions(TEMPLATES[CADET_JUNIOR])

      const after = useStore.getState()
      expect(after.loadedPresetId).toBe('B1')
      expect(after.tournament_type).toBe(TournamentType.NAC)
      expect(after.days_available).toBeLessThan(templateMinDays(CADET_JUNIOR, TournamentType.NAC))
      expect(TEMPLATES[CADET_JUNIOR].every((id) => Object.hasOwn(after.selectedCompetitions, id))).toBe(true)
      expect(hint()).toBeNull()
    })

    it('shows no hint for an id that names nothing, not even an inherited property', () => {
      lowered(CADET_JUNIOR, TournamentType.NAC, 3)
      useStore.setState({ loadedPresetId: 'toString' })

      expect(hint()).toBeNull()
    })

    it('shows no hint after a file load whose events are not the template\'s', () => {
      const s = useStore.getState()
      s.applyTemplate('RYC Weekend')
      const otherEvents = useStore.getState().selectedCompetitions
      useStore.setState(useStore.getInitialState(), true)
      useStore.getState().applyTemplate(CADET_JUNIOR)

      applyLoadedState(
        {
          selectedCompetitions: otherEvents,
          days_available: 3,
          dayConfigs: useStore.getState().dayConfigs.slice(0, 3),
        },
        null,
      )

      const after = useStore.getState()
      expect(after.loadedPresetId).toBe(CADET_JUNIOR)
      expect(after.tournament_type).toBe(TournamentType.NAC)
      expect(after.days_available).toBeLessThan(templateMinDays(CADET_JUNIOR, TournamentType.NAC))
      expect(TEMPLATES[CADET_JUNIOR].every((id) => Object.hasOwn(after.selectedCompetitions, id))).toBe(false)
      expect(hint()).toBeNull()
    })

    it('shows no hint once one event of the template is removed', () => {
      lowered(CADET_JUNIOR, TournamentType.NAC, 3)
      useStore.getState().removeCompetition(TEMPLATES[CADET_JUNIOR][0])

      const after = useStore.getState()
      expect(after.loadedPresetId).toBe(CADET_JUNIOR)
      expect(after.days_available).toBeLessThan(templateMinDays(CADET_JUNIOR, TournamentType.NAC))
      expect(TEMPLATES[CADET_JUNIOR].every((id) => Object.hasOwn(after.selectedCompetitions, id))).toBe(false)
      expect(hint()).toBeNull()
    })

    it('shows no hint at the template\'s own minimum of 4 days', () => {
      useStore.getState().applyTemplate(CADET_JUNIOR)

      const after = useStore.getState()
      expect(after.loadedPresetId).toBe(CADET_JUNIOR)
      expect(after.days_available).toBe(templateMinDays(CADET_JUNIOR, TournamentType.NAC))
      expect(TEMPLATES[CADET_JUNIOR].every((id) => Object.hasOwn(after.selectedCompetitions, id))).toBe(true)
      expect(hint()).toBeNull()
    })
  })
})
