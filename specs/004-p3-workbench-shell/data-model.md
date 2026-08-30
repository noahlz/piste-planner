# Data Model: P3 Workbench Shell and Canvas

Shapes this feature adds or changes. Reasoning lives in
[research.md](./research.md); this file records the resulting structure.

Nothing here is engine state. `src/engine/` gains no types, no fields, and no
new values in existing unions (constitution I).

---

## Store slice changes

### Tournament slice

| Field | Before | After | Why |
|---|---|---|---|
| `video_strips_total` | `number`, default `0` | `number \| null`, default `null` | `null` means "follow the tournament type's default". `0` stays available as the real value it is – a tournament with no video strips (research D7). |
| `layoutMode` | `'wizard' \| 'kitchen-sink'` | **deleted** | Both layouts are gone (FR-001). `setLayoutMode` goes with it. |

### Competition slice

| Field | Before | After | Why |
|---|---|---|---|
| `CompetitionConfig.de_mode` | `DeMode` – two values, default `SINGLE_STAGE` | `DeModeSetting` – `AUTO`, `SINGLE_STAGE`, `STAGED`, default `AUTO` | The store's config type is already distinct from the engine's `Competition`, so the setting gains a member while the engine's `DeMode` does not (research D6). |
| `CompetitionConfig.ref_policy` | `RefPolicy`, default `AUTO` | **unchanged** | `AUTO` already exists and is already the default. It stops being a dead alias for `TWO` and starts meaning "follow the type default" (research D5). |
| `globalOverrides` | `ADMIN_GAP_MINS`, `FLIGHT_BUFFER_MINS`, `THRESHOLD_MINS` | those three plus `SLOT_MINS`, `DE_BOUT_DURATION` per weapon, `YOUTH_VET_BOUT_DELTA`, `DEFAULT_DE_STRIP_FOOTPRINT` | The gears surface renders the whole slice. The first three are already stored, already serialized, and currently unreachable (research D8). |

### New: view state

Viewer preferences. Persisted to `localStorage` under one key and deliberately
absent from `serializeState` (research D10).

| Field | Meaning |
|---|---|
| `viewMode` | Which center view is active – matrix or schedule. |
| `rowHeightStep` | Compact, normal, or tall. A three-value union, not a number. |
| `timeZoom` | Minutes per pixel on the time axis. |
| `timeScroll` | Left edge of the visible time window, in minutes from midnight. |
| `rowScroll` | Top of the visible row window, as a flat row index. |
| `drawerHeight` | The bottom drawer's size. |
| `scorecardExpanded` | Whether the scorecard shows its full metric set. |

### New: scorecard baseline

The frozen metrics of the preset as loaded. Held in the store, never serialized,
never recomputed while a preset stays loaded (research D9). Absent when no
preset is loaded, in which case metrics render without deltas.

Holds one value per metric the scorecard reports: per-day and per-tournament
finish times, peak referee demand split total and sabre, strip utilization,
day-balance spread, and finding counts by severity.

---

## Per-type default table

A lookup from `TournamentType` to the three defaults, living in a new
`src/store/typeDefaults.ts`. Read by `buildConfig.ts` when resolving, and by the
Advanced panel when displaying.

| Tournament type | Referees per pool | Video strips | DE mode |
|---|---|---|---|
| NAC | 2 | 8 | Staged |
| SJCC | 2 | 0 | Single-stage |
| SYC | 2 | 0 | Single-stage |
| ROC | 1 | 0 | Single-stage |
| RYC | 1 | 0 | Single-stage |
| RJCC | 1 | 0 | Single-stage |

Which categories require video is **not** part of this table.
`DEFAULT_VIDEO_POLICY_BY_CATEGORY` (`src/engine/constants.ts:184`) already
decides that and is unchanged – the table supplies only the strip count.

---

## Resolution rules

All three defaults resolve in `src/store/buildConfig.ts`, joining the regional
cut override already at line 139. None is ever written back to the store, so a
tournament type change cannot destroy an organizer's setting (FR-036).

| Setting | Stored value | Resolves to |
|---|---|---|
| Referees | `AUTO` | the type's referee count |
| Referees | `ONE` or `TWO` | itself – the organizer beats the default |
| DE mode | `AUTO` | the type's DE mode |
| DE mode | `SINGLE_STAGE` or `STAGED` | itself |
| Video strips | `null` | the type's video strip count |
| Video strips | any number, `0` included | itself |

**Precedence runs the other way for handbook policy.** The regional cut override
at `buildConfig.ts:139` overwrites the organizer's own cut setting, because it
is a rule the USA Fencing handbook imposes rather than a convenience. The three
settings above lose to an explicit value; regional cuts win over one (FR-040).

---

## Settings override state

Whether a setting departs from its default is **derived by comparison**, never
stored. This is the pattern `specs/002-configurable-pool-durations/` established
and `PoolDurationSettings.tsx` implements, and the gears surface reuses both it
and the existing `DefaultLabel` component rather than introducing a second
convention (research D8).

A consequence worth stating: a setting explicitly set to the value its default
happens to have is indistinguishable from an unset one, and both track the
default if the default later changes. That is the intended behavior for the
gears settings, where the value is the whole meaning.

It is **not** the intended behavior for the three per-type defaults, which is
why those use an explicit `AUTO` or `null` rather than comparison – an event set
to `TWO` at a NAC must stay at two referees if the type changes to ROC, and
comparison could not tell it apart from an unset event.

---

## Serialization

`schemaVersion` stays at `2`. New fields are optional on read and always written
on save, matching the leniency 002 established for `pool_round_duration_table`
(research D8).

| Key | Change |
|---|---|
| `tournament.video_strips_total` | now nullable |
| `competitions.selectedCompetitions[].de_mode` | now accepts `AUTO` |
| `competitions.globalOverrides` | four more settings, all optional on read |
| view state | **not serialized** – `serializeState` builds an explicit object literal, so an unnamed field cannot leak into a URL |
| scorecard baseline | **not serialized** – a sender's baseline would misrepresent the recipient's edits as their own |

A URL saved before this feature lacks the new keys and opens with their
defaults.

---

## Canvas encoding

Derived entirely from the competition and its placement. Nothing here is stored;
block geometry is computed on read from the engine's existing duration math
(FR-013).

| Channel | Variable | Values |
|---|---|---|
| Block fill | Age category | 16, as four hue families (below) |
| Left edge-bar and hatch | Phase | Solid for pools, hatched for DE |
| Icon | Weapon | Foil, épée, sabre – drawn by the app, since lucide has none |
| Label prefix | Gender | From the competition |

### Category families

Four hue families with lightness steps inside each, defined as CSS custom
properties in `src/index.css` beside the existing brand tokens (research D4).
Lightness follows the age or division ordering, so each family reads as a
progression.

| Family | Values |
|---|---|
| Youth | Y8, Y10, Y12, Y14 |
| Cadet and Junior | CADET, JUNIOR |
| Senior divisions | DIV1, DIV1A, DIV2, DIV3 |
| Veteran | VET40, VET50, VET60, VET70, VET80, VET_COMBINED |

`Category` has eleven members and `VETERAN` expands across the six
`VetAgeGroup` bands, giving the sixteen values the design predicted.

---

## Canvas geometry

Not state – recomputed from view state and derived placements on every render.
Recorded here because the windowing rules are what keep constitution IV
satisfied.

| Quantity | How it is obtained |
|---|---|
| Visible row range | From `rowScroll` and viewport height over uniform row heights. Direct arithmetic, no search, no iteration (research D2). |
| Visible time range | From `timeScroll`, `timeZoom`, and viewport width. |
| A row's day and strip | A flat row index across all day groups, resolved through a day-boundary lookup in constant time. |
| A block's x and width | `(minutes − windowStart) × pxPerMinute`, from the placement's start time and the engine's derived duration. |
| A block's y and height | From its strip range and the current row height step. |
| The hovered block | Resolved from pointer coordinates by one canvas-level handler, not by per-block listeners (research D3). |
