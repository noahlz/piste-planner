# Research: P3 Workbench Shell and Canvas

Decisions that needed their reasoning recorded, per constitution §Planning
Artifacts. Each states what was chosen, why, and what was rejected.

---

## D1 – The canvas is plain SVG, not visx

**Decision**: Draw the matrix as SVG built by the component itself, with a time
scale that is arithmetic (`x = (minutes − windowStart) × pxPerMinute`) and an
hour axis generated from the visible time window. Add no charting dependency.

**Rationale**: The design document names visx and gives the reason the canvas
must window itself – "visx does not virtualize, so the canvas renders only the
visible row window and the visible time window." That reason is also the case
against adopting it. Once the component owns its own windowing, what visx would
contribute is:

| visx package | What it gives | Why it is not needed here |
|---|---|---|
| `@visx/scale` | d3-scale wrappers | The time scale is linear over a window the component already computes. A scale object adds indirection over one multiply and one subtract. |
| `@visx/axis` | Tick generation and rendering | Hour ticks on a minutes-from-midnight axis are a range at a fixed step, coarsened when zoomed out. The engine's time model is already minutes-from-midnight, so there is no date arithmetic to delegate. |
| `@visx/shape`, `@visx/group` | `<rect>` and `<g>` wrappers | No value over the elements themselves. |
| `@visx/tooltip` | `useTooltip`, `TooltipWithBounds` | The real candidate, superseded by D3 – Radix is already a dependency and already portals with collision detection. |

The project currently has no charting or `d3-*` dependency at all. Adopting visx
means four to five packages and their d3 transitives for scale arithmetic the
component performs anyway.

**Alternatives considered**:

- **visx as the design specifies.** Rejected on the analysis above. Reversing
  this decision is one task: add `@visx/scale`, `@visx/axis`, `@visx/group`,
  `@visx/tooltip`, and replace the scale helper and axis component. The
  windowing, encoding, and block geometry work is unaffected either way, which
  is what makes the decision cheap to revisit.
- **HTML and CSS grid with absolutely positioned blocks.** Rejected. At 1,120
  rows the block count is manageable, but hatch fills and the phase edge-bar are
  natural in SVG and awkward in CSS, and sub-pixel time positioning is more
  predictable in a single SVG coordinate space than across nested elements.
- **`<canvas>` with manual hit-testing.** Rejected as premature. It would win on
  raw block count, but it forfeits DOM-based testing – the component tests in
  this feature assert on rendered blocks – and the windowed block count is well
  within what SVG handles.

**Recorded departure**: this revises an approved design decision. It is in
plan.md's Design departure table so it is reviewable rather than buried.

---

## D2 – Windowing is hand-rolled, with no virtualization library

**Decision**: Compute the visible row range and the visible time range directly
from scroll offsets and render only that slice. Add no virtualization library.

**Rationale**: Row heights are uniform within a step – the design fixes compact,
normal, and tall as discrete steps precisely because legibility "falls off a
cliff" between them, and the same property makes the visible range pure index
arithmetic from `scrollTop` and viewport height. A library like `react-window`
or `@tanstack/react-virtual` earns its place when item heights vary or must be
measured, and neither is true here.

Day grouping is the only complication: the canvas is a sequence of day blocks,
each a header band plus `strips_total` rows. A flat row index across all days
with a day-boundary lookup resolves any index to its day and strip in constant
time.

This satisfies constitution IV directly – the visible range is a computation,
not a search, and has no iteration to bound.

**Alternatives considered**:

- **`@tanstack/react-virtual`.** Rejected. Its value is dynamic measurement,
  which uniform stepped rows do not need, and it does not window the horizontal
  time axis, which this canvas also requires. Half the problem would still be
  hand-rolled.
- **Render everything and rely on the browser.** Rejected. 1,120 rows at normal
  height is roughly 25,000px of SVG, and the design already ruled this out as a
  structural concern rather than a later optimization.

---

## D3 – The tooltip is a controlled Radix tooltip on a virtual anchor

**Decision**: One pointer handler on the canvas resolves the hovered block from
coordinates, and a single Radix tooltip – the existing
`src/components/ui/tooltip.tsx` primitive, driven as a controlled component
against a zero-size positioned anchor – renders its contents.

**Rationale**: `radix-ui` is already a dependency and `TooltipPrimitive.Portal`
already escapes the canvas clip, with Radix's collision detection handling the
viewport-edge flipping FR-022 requires. The design's requirement is behavioral –
escape the clip, flip near edges – and Radix satisfies it without a new package.

Binding a Radix tooltip per block would be wrong regardless of the library: it
puts an event listener and a positioning context on every rendered block. One
canvas-level handler resolving position to a block is both cheaper and the only
approach that survives a future move to `<canvas>` rendering.

**Alternatives considered**:

- **`@visx/tooltip`'s `TooltipWithBounds`.** Rejected with D1 – it solves a
  problem an existing dependency already solves.
- **The `title` attribute.** Already rejected by the design: it cannot carry
  structured contents and its timing is not controllable.
- **A Radix tooltip per block.** Rejected on the listener and positioning cost
  above.

---

## D4 – Sixteen category values as four hue families

**Decision**: Group the sixteen encoding values into four hue families with
lightness steps inside each, defined as CSS custom properties in `src/index.css`
alongside the existing brand tokens and consumed by name from the canvas.

The sixteen values and their families:

| Family | Values |
|---|---|
| Youth | Y8, Y10, Y12, Y14 |
| Cadet and Junior | CADET, JUNIOR |
| Senior divisions | DIV1, DIV1A, DIV2, DIV3 |
| Veteran | VET40, VET50, VET60, VET70, VET80, VET_COMBINED |

`Category` has eleven values (`src/engine/types.ts:10`), of which `VETERAN`
expands across the six `VetAgeGroup` bands, giving ten non-veteran values plus
six veteran ones – the sixteen the design predicted.

**Rationale**: A flat categorical palette stops being distinguishable somewhere
around eight to ten hues, and there are sixteen values. Families make the
scanning task hierarchical: find the family by hue, then the member by
lightness. The grouping is not arbitrary – it mirrors the crossover structure
the scheduler already models, so blocks that read as related on the canvas are
the ones the engine treats as related.

Defining the palette as CSS custom properties rather than as literals in
TypeScript keeps it beside the existing `--primary` and `--success` tokens, and
means the theme is adjustable without touching the canvas.

**Ordering within a family**: lightness follows the age or division ordering, so
Y8 through Y14 and DIV1 through DIV3 each read as a progression rather than as
an arbitrary assignment.

**Alternatives considered**:

- **Sixteen distinct hues.** Rejected on the distinguishability limit above.
- **Fill for phase, something else for category.** Rejected by design decision
  9 – fill carries only one variable and category is the scanning axis.
- **Palette literals in `palette.ts`.** Rejected in favour of CSS variables for
  themeability, though `palette.ts` still holds the category-to-token mapping.

---

## D5 – `RefPolicy.AUTO` becomes the per-type referee default

**Decision**: Resolve `RefPolicy.AUTO` against the tournament type in
`buildConfig.ts` – to two referees per pool at NAC, SJCC, and SYC, and one
everywhere else – before the engine is called. `resolveRefsPerPool` in
`src/engine/pools.ts` is not modified.

**Rationale**: This needs no new state, because the state already exists and is
currently dead. `ref_policy: 'AUTO'` is the store default on every event
(`src/store/store.ts:234`), and `src/engine/pools.ts:166` resolves `AUTO` and
`TWO` to the same two referees per pool. Its own comment says so: "TWO and AUTO
both use 2 refs/pool". `AUTO` is an alias with no distinct meaning.

The backlog's per-type referee default is exactly the meaning `AUTO` was
reserved for. So the spec's "unset / follows type default" state is not a new
concept for referees – it is an existing enum member finally doing its job. An
organizer who wants a fixed count still picks `ONE` or `TWO`, and those keep
beating the type default, which is the precedence FR-037 requires.

Resolving in `buildConfig.ts` rather than in the engine is what constitution I
requires: `resolveRefsPerPool` takes a policy and a pool count and knows nothing
about tournaments. Widening its signature to accept a tournament type would push
tournament-level context into pool math. `buildConfig.ts` is the declared bridge
and already does exactly this at line 139, where regional cut overrides are
applied to the freshly built competitions.

**This is a behavior change and constitution III governs it.**

Expected drift, from the preset types in `src/data/tournaments.ts`:

| Preset type | Presets | Referees per pool before | After |
|---|---|---|---|
| NAC | B1, B2, B3, B7, B8 | 2 | 2 – unchanged |
| SYC | B4 | 2 | 2 – unchanged |
| SJCC | B5 | 2 | 2 – unchanged |
| ROC | B6 | 2 | **1** |

One scenario moves. That is what makes this diff explainable rather than a wall
of changed numbers, and the B6 referee figures before and after belong in the
commit message that makes the change.

Scheduled event counts must not move at all – referee demand is reported, not
scheduled against, since ref-availability gating was removed. If any scenario's
scheduled count drops, constitution III halts the task.

**Alternatives considered**:

- **Add a fourth `RefPolicy` member for "type default".** Rejected – it would
  leave `AUTO` dead beside it and force every consumer to handle two
  indistinguishable unset states.
- **Pass the tournament type into `resolveRefsPerPool`.** Rejected on
  constitution I, as above.
- **Write the resolved value into each event's stored config on type change.**
  Rejected – this is the model the spec's clarification eliminated. It would
  make a type change destructive and would put derived data in the store, which
  P2 spent a phase removing.

---

## D6 – DE mode gains an `AUTO` setting in the store only

**Decision**: The store's `CompetitionConfig.de_mode` becomes a three-value
setting – `AUTO`, `SINGLE_STAGE`, `STAGED` – with `AUTO` the default for a newly
added event. `buildConfig.ts` resolves `AUTO` to `STAGED` at NAC and
`SINGLE_STAGE` elsewhere. The engine's `Competition.de_mode` keeps its two
values and is not touched.

**Rationale**: This is D5's shape applied to a field that lacks a ready-made
unset member. The store already declares its own `CompetitionConfig`
(`src/store/store.ts:66`), separate from the engine's `Competition`, so the
setting union can gain a member without any engine type gaining one. The engine
continues to receive a resolved two-value mode and needs no new branch.

**This is the larger of the two drifts and it should be reviewed before the
task is dispatched.** Today `de_mode` defaults to `SINGLE_STAGE` for every event
regardless of type, so this moves five of the eight presets – B1, B2, B3, B7,
and B8 – onto staged DE for the first time. P1's DE referee correction, recorded
in [`specs/001-p1-foundations/research.md` D1](../001-p1-foundations/research.md),
raises staged-DE referee figures roughly fourfold on the NAC scenarios, and that
multiplier has so far only applied to events an organizer explicitly set to
staged. Applying staged DE by default at NAC applies it to all of them.

The referee figures are expected to rise steeply and the rise is explainable, but
constitution III requires the diff be explained rather than accepted, and a drop
in scheduled event count on any scenario halts the task. Both belong in the
commit that makes the change, and the B6 referee figures from D5 belong in the
same run.

**Alternatives considered**:

- **A nullable `de_mode`.** Rejected for consistency – `RefPolicy.AUTO` sets the
  house idiom for "let context decide", and a null beside an `AUTO` on the
  neighbouring field would be two spellings of one concept.
- **Add `AUTO` to the engine's `DeMode`.** Rejected on constitution I – the
  engine would have to carry a value it can only resolve with tournament-level
  context it does not receive.

---

## D7 – Video strip count becomes nullable in the store

**Decision**: `video_strips_total` becomes `number | null` in the store, where
`null` means "follow the tournament type's default". `buildConfig.ts` resolves
`null` to 8 at NAC and 0 elsewhere.

**Rationale**: Unlike referees and DE mode this is a tournament-level field, not
a per-event one, so there is nothing to resolve per competition and no enum to
extend. It needs an unset state because `0` is a legitimate value – a tournament
with no video strips – and cannot double as "not yet chosen".

Which categories require video is unchanged and is not part of this decision.
`DEFAULT_VIDEO_POLICY_BY_CATEGORY` (`src/engine/constants.ts:184`) already marks
Cadet, Junior, and Div1 as `REQUIRED`, and the per-type default supplies only
the strip count.

Every preset in `src/data/tournaments.ts` sets `videoStrips` explicitly, so
loading a preset always produces an explicit value and this default is only
reached by an organizer building from scratch.

**Alternatives considered**:

- **Treat `0` as unset.** Rejected – it makes "no video strips" unexpressible.
- **A separate `video_strips_is_default` flag.** Rejected on the same grounds
  002 rejected a stored override flag: the distinction is derivable, and a flag
  can fall out of sync with the value it describes.

---

## D8 – The gears panel widens `globalOverrides`

**Decision**: Extend the existing `globalOverrides` slice with the four
constants P1 surfaced – `SLOT_MINS`, `DE_BOUT_DURATION` per weapon,
`YOUTH_VET_BOUT_DELTA`, and `DEFAULT_DE_STRIP_FOOTPRINT` – and render the whole
slice, plus the pool round duration table, behind the gears control. Whether a
setting is overridden is derived by comparing it to its default, with no stored
flag.

**Rationale**: Three of these settings already exist. `globalOverrides` holds
`ADMIN_GAP_MINS`, `FLIGHT_BUFFER_MINS`, and `THRESHOLD_MINS`
(`src/store/store.ts:246`), `buildConfig.ts:55` feeds them to the engine, and
`serialization.ts:56` puts them in the share URL – but no component reads the
slice, so they are saved, shared, and unreachable. The gears surface is mostly
an act of connecting what is already wired.

The default-versus-override pattern is settled: `PoolDurationSettings.tsx`
derives it by comparison with an explicit comment that there is no stored flag,
and `DefaultLabel` already renders the distinction. This feature reuses both
rather than inventing a second convention, which is also what keeps the two
surfaces consistent once pool durations move behind the gears.

**Serialization**: `schemaVersion` stays at `2`. New fields are optional on read
and always written on save, matching the leniency 002 established for
`pool_round_duration_table`. A URL saved before this feature simply lacks the
new keys and opens with their defaults, which is the behavior the spec's edge
case requires. Bumping to `3` would make `serialization.ts:88` reject those URLs
outright – stricter than the product needs while unreleased, and it buys
nothing, since no reader branches on the version.

**Alternatives considered**:

- **A separate settings slice.** Rejected – it would split one concept across
  two slices and two serialization keys for no gain.
- **Promoting the rest of `constants.ts` now.** Explicitly out of scope
  (FR-047), and it stays in the backlog for after P5.

---

## D9 – The scorecard baseline is captured at preset load

**Decision**: When a preset loads, compute its metrics once and hold that
snapshot in a store slice that is neither serialized nor recomputed. Every
displayed metric reports its current value and its difference from that
snapshot. When no preset is loaded, metrics render without deltas.

**Rationale**: The design requires the baseline to stay frozen – "every metric
shows a delta against the loaded preset, which stays frozen as the baseline". A
baseline that recomputed with the configuration would always read zero.

It must not serialize. A recipient opening a shared URL is looking at a
tournament, and a sender's baseline would present the sender's edit history as
if it were the recipient's. Deltas resume when the recipient loads a preset.

The no-preset case is the spec's edge case and resolves the same way: no
snapshot means no comparison, so values render alone. This is honest – a delta
against an absent or stale baseline is worse than no delta.

**Alternatives considered**:

- **Serialize the baseline with the tournament.** Rejected on the sharing
  argument above.
- **Baseline against the last auto-schedule.** Rejected – it would move under
  the organizer every time they pressed `Auto-schedule all`, which is exactly
  when they most need a stable reference.

---

## D10 – Viewer preferences live in `localStorage`, never in the URL

**Decision**: The active view, time zoom and scroll position, row-height step,
drawer size, and scorecard expansion persist to `localStorage` under one key,
written and read outside `src/store/serialization.ts`.

**Rationale**: These describe how one person is looking at a tournament, not the
tournament. The design says so for the scorecard specifically – "expanded or
collapsed is remembered across sessions but is not part of the serialized
tournament config" – and the same reasoning covers zoom and view mode. Sharing a
URL should hand over a schedule, not impose a scroll position.

Keeping them outside the serializer makes this structural rather than a rule to
remember: `serializeState` builds an explicit object literal, so a field it does
not name cannot leak into a URL by accident. The project uses no persistence
middleware today, so this is the first `localStorage` use and it stays confined
to one module.

**Alternatives considered**:

- **Zustand's `persist` middleware over the whole store.** Rejected – it would
  persist tournament state to `localStorage` too, giving a second source of
  truth beside the URL, and P2 spent a phase establishing a single one.
- **Keep view state in memory only.** Rejected – row height and view mode are
  preferences an organizer sets once, and losing them per reload is friction the
  design explicitly avoids for the scorecard.

---

## D11 – US1 ships with the schedule table in the center

**Decision**: The shell story delivers the four regions with the existing
schedule table as the center content. The matrix and the view toggle arrive with
US2, and the matrix becomes the default view then.

**Rationale**: It makes the shell independently shippable and independently
testable, which the spec's story structure requires. The alternative – shell and
canvas as one story – produces a story that cannot be demonstrated until both
the largest and the riskiest pieces of the phase are done.

It also sequences the deletions early. `WizardShell`, the four steps,
`KitchenSinkPage`, `layoutMode`, and the toggle all go in US1, so no later story
is written against a codebase with two live layouts.

**Alternatives considered**:

- **Shell and canvas as one story.** Rejected on the above.
- **Build the canvas first, behind the old layouts.** Rejected – it means
  maintaining the canvas against a shell that does not exist yet, and it delays
  the deletions that make everything after it simpler.

---

## D12 – Deleted-layout tests are re-targeted by behavior, not by file

**Decision**: Go through `KitchenSinkPage.test.tsx` (52 tests) and
`WizardShell.test.tsx` (27 tests) case by case. A test asserting behavior that
survives into the workbench is re-targeted at the workbench in the story that
builds that surface. A test asserting wizard navigation, layout switching, or
kitchen-sink composition is deleted. Both files are gone by the end of US1.

**Rationale**: The design budgets "roughly 70 wizard and kitchen-sink tests" for
pruning or re-targeting, and the actual count is 79. Deleting both files wholesale
would discard real coverage of behavior that survives – template application,
strip suggestion, fencer-count editing, share-link round trips. Re-targeting
them wholesale would keep tests for interactions that no longer exist.

Doing it in the story that builds each surface, rather than as a cleanup pass,
is the same rule constitution VI applies to the smoke driver, and for the same
reason: coverage moved late is coverage written against a UI nobody is looking
at any more.

**The smoke driver is the same problem at a larger scale.** Every locator in
`scripts/smoke.mjs` targets deleted UI – the `Single Page` tab, the `Wizard`
tab, `Generate Schedule`, `Save / Load / Share`. Constitution VI forbids
rewriting it from scratch, because its selectors are the accumulated record of
corrections against the real DOM. So each step is re-pointed at the workbench
control that replaces the one it drove, in the task that creates that control,
and the header comment's corrections are preserved where the selector they
describe survives in a new form.

**Alternatives considered**:

- **Delete both files and write fresh workbench tests.** Rejected – it discards
  surviving coverage and the corrections behind it.
- **A single cleanup task at the end of the feature.** Rejected on the argument
  above, and it would leave the suite red or misleading for most of the feature.
