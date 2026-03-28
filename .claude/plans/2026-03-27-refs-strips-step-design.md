# Refs & Strips Wizard Step — Design Spec

**Date:** 2026-03-27

## Summary

Move strip inputs out of Tournament Setup (Step 1) into a combined "Refs & Strips" step (Step 3) after Fencers. Add a strip count suggestion feature that recommends enough strips to run all pools of the largest competition in a single flight.

## Wizard Step Order (After)

| Step | Label        | Contents                                              |
|------|-------------|-------------------------------------------------------|
| 0    | Tournament  | Type, days, day schedule                              |
| 1    | Fencers     | Fencer counts, competition overrides                  |
| 2    | Refs & Strips | Strips card + Referees card (see below)             |
| 3    | Analysis    | Validation + analysis output                          |
| 4    | Schedule    | Schedule view                                         |

This reduces the wizard from the current 5-step layout (Tournament, Fencers, Referees, Analysis, Schedule) to a tighter 5-step layout with combined Refs & Strips.

## Refs & Strips Step Layout

### Strips Card

- **# of Strips** — NumberInput with **Suggest** button in card header (no tooltip — self-explanatory)
- **# with Video** — NumberInput (manual only; video strips are a venue constraint). Client-side constraint: must be ≤ strips total. Clamp or show inline error if violated.
- **Include Finals Strip** — checkbox; when checked, adds +1 to suggested/entered strip count and sets `de_finals_strip_id` on competitions

### Referees Card

Same as current RefereeSetup:

- Table: Day | Foil/Epee Refs | Sabre Refs | Sabre Fill-in (per day)
- **Suggest** button in card header
- **Pod Captain Override** dropdown below table

## Strip Suggestion Algorithm

**Input:** All selected competitions with fencer counts, number of days available.

**Logic:**
1. For each selected competition, compute pool structure via `computePoolStructure(fencer_count, use_single_pool_override)` to get `n_pools`
2. Find the competition with the largest `n_pools` value (this is the peak demand)
3. Suggested strips = that `n_pools` value (enough to run all pools simultaneously in one flight)
4. If "Include Finals Strip" is checked, add +1

**Tooltip text:** "Suggests enough strips to run all pools of the largest competition in a single flight."

## Video Strips

Manual input only. Video replay is only used for DE table bouts, and the number of video-equipped strips is fixed by venue hardware — not derivable from competition structure.

**Client-side constraint:** Video strip count must be ≤ total strip count. Enforce by clamping the `max` prop on the NumberInput to `strips_total`.

## Include Finals Strip

- Checkbox on the Strips card
- When enabled: adds +1 to the strip suggestion and sets `de_finals_strip_id` on competitions in `buildConfig.ts`
- Maps to existing engine fields: `de_finals_strip_id`, `de_finals_strip_requirement`, `de_finals_strips`

## Store Changes

- Remove `strips_total` and `video_strips_total` inputs from TournamentSetup component (keep in store — just move the UI)
- Add `include_finals_strip: boolean` to store state
- Add `setIncludeFinalsStrip` action
- Add `suggestStrips()` store action (calls the new suggestion function)
- New file `src/store/stripSuggestion.ts` — pure function mirroring `refSuggestion.ts` pattern

## Component Changes

- **TournamentSetup.tsx** — Remove strips and video strips inputs
- **WizardStep3.tsx** — Rename from RefereeSetup-only to combined Refs & Strips (renders new StripSetup + existing RefereeSetup)
- **New: StripSetup.tsx** — Strip count, video count, finals strip checkbox, Suggest button
- **RefereeSetup.tsx** — No changes (already works standalone)
- **WizardShell.tsx** — Update `STEP_LABELS` from `['Tournament', 'Fencers', 'Referees', 'Analysis', 'Schedule']` to `['Tournament', 'Fencers', 'Refs & Strips', 'Analysis', 'Schedule']`

## UI Polish: Numeric Inputs & Selects

### Tournament Length → Select

Change the Tournament Length input in TournamentSetup from `<Input type="number">` to a `<Select>` with fixed options: 2, 3, 4. Remove its tooltip (self-explanatory).

### Tooltip Cleanup

Remove tooltips from self-explanatory fields (# of Strips, Tournament Length, # with Video). Keep tooltips only where domain knowledge is needed (e.g., Pod Captain Override, Sabre Fill-in, Suggest buttons).

### NumberInput Stepper Component

Create a reusable `src/components/ui/number-input.tsx` component with:

- Compact fixed width (fits 3-4 digits)
- Minus / Plus stepper buttons flanking the value
- `min`, `max`, `value`, `onChange` props
- Uses existing shadcn `Button` (ghost/outline, small) and `Input` primitives

Replace all `<Input type="number">` across wizard steps with this component:

- **TournamentSetup** — (tournament length becomes Select; strips/video move out)
- **FencerCounts** — fencer count per competition
- **StripSetup** — strip count, video strip count
- **RefereeSetup** — foil/epee refs, sabre refs per day

## What's NOT Changing

- Engine types and functions — no changes needed
- Referee suggestion algorithm — unchanged
- Store shape for `strips_total`, `video_strips_total`, `dayRefs` — unchanged
- `buildConfig.ts` bridge — only change is wiring `include_finals_strip` to `de_finals_strip_id`
