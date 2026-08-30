# Research: Consolidate Domain Logic and Coverage Before the Layout Deletion

Decisions taken during planning, with what was rejected and why. Referenced from
[plan.md](./plan.md) and [spec.md](./spec.md).

---

## D1 — A survivor mounts the smallest surviving component, not a page

**Decision**: A re-targeted case mounts the single `src/components/sections/`
component that exhibits the behavior it asserts. It mounts a page only when the
behavior is genuinely cross-section, and in that case the test file composes its
own minimal host rather than importing one.

**Rationale**: `src/components/sections/` holds twelve components. Feature 004's
T020 deletes exactly two of them — `TemplateSelector.tsx` and
`ActionButtons.tsx`. The other ten survive and are re-homed into the workbench
rail, drawer, and top bar. So for most surviving cases there is already a
component that is not going anywhere and that exhibits the behavior on its own:

| Behavior cluster | Mount target | Survives 004 |
|---|---|---|
| Save to file, load from file, share link, dropped-placement notice, oversize warning | `SaveLoadShare` | yes — re-homed to top bar |
| Validation / Warnings headings, flighting Accept and Reject | `AnalysisOutput` | yes — re-homed to drawer |
| Schedule rows from placements, empty state, referee figures deriving from placements, day-past-`days_available` flagging | `ScheduleOutput` | yes — becomes the Schedule view |
| Strips, fencer counts, competition overrides, tournament setup fields | `StripSetup`, `FencerCounts`, `CompetitionOverrides`, `TournamentSetup` | yes — all four re-homed to rail |

This is what turns FR-008 from an aspiration into a mechanical check. If
survivors kept mounting `KitchenSinkPage`, the requirement that no test
references it could not be met without inventing a replacement host — and the
only replacement available is the workbench, which does not exist until 004's
S2. Mounting the section directly sidesteps the ordering problem entirely.

**Alternatives considered**:

- *Keep mounting `KitchenSinkPage` and let 004's T023 re-point.* This is what
  the spec permits as a fallback and what 004 originally assumed. Rejected as
  the default because it leaves T020 a deletion that breaks tests, which is
  exactly the coupling this feature exists to remove. It remains the escape
  hatch for a genuinely cross-section case.
- *Write the survivors directly against the workbench components.* Impossible
  here — they do not exist until 004's S2, and this feature must land first.
- *Demote every survivor to a store-level test.* Rejected. Several of these
  cases assert accessible output — a `role="alert"` on a load error, a
  `role="status"` on the dropped-placement notice — and a store test cannot see
  those. Coverage of an announcement is not coverage of the state behind it.

**Consequence for the deleted two**: `TemplateSelector` and `ActionButtons` have
no surviving mount target. Cases that assert only their rendering are deletions.
Cases that assert what they *trigger* — `applyTemplate`, `runScheduleAll` — are
re-targeted at the store action, which already exists and already survives.

---

## D2 — The triage record is a tracked artifact, not a commit message

**Decision**: `specs/005-consolidate-domain-logic/triage-record.md`, one row per
case, created during execution and committed. Columns: source file, case name,
decision, destination or reason.

**Rationale**: The failure this feature exists to prevent is silent. A reviewer
asking "did we lose coverage?" needs to answer it by reading one file, not by
reconstructing intent from a dozen commit messages across a branch. A table also
makes FR-005's sum-to-78 check mechanical — the rows are countable.

Commit messages still carry the reasoning for the deletions in that commit. The
record is the index; the commits are where a decision sits next to the diff it
produced. Constitution §Planning Artifacts: one home per fact, and the record's
home is the table.

**Alternatives considered**:

- *Commit messages alone.* Rejected: unreadable as a whole, and there is no way
  to check the tally without walking the log.
- *A section appended to the handoff.* Rejected: the handoff is narrative and
  per-session, and this record outlives the session that writes it. 004's S3
  reads it to know what is already decided.
- *Inline comments in the new test files.* Rejected: a deleted case leaves no
  file to comment in, and deletions are the half that matters.

---

## D3 — View-state hardening: copy on return, guard the write, range-check the numbers

**Decision**: Three changes to `src/store/viewState.ts`.

1. **Every return is a fresh object.** `loadViewState()` returns
   `{ ...DEFAULT_VIEW_STATE }` on each fallback path rather than the module
   constant, and `DEFAULT_VIEW_STATE` is additionally frozen so a future
   accidental write fails loudly in strict mode instead of silently.
2. **`saveViewState()` swallows storage failures** in a `try`/`catch`, matching
   the tolerance `loadViewState()` already has for `getItem` throwing.
3. **Numeric fields are range-checked**, not merely type-checked:

   | Field | Rule | Why |
   |---|---|---|
   | `timeZoom` | finite, `> 0` | minutes per pixel; zero or negative makes the canvas scale divide by zero or invert |
   | `timeScroll` | finite, `>= 0` | minutes from midnight; negative scrolls before the day starts |
   | `rowScroll` | finite integer, `>= 0` | a flat row index |
   | `drawerHeight` | finite, `>= 0` | pixels |

   A value failing any rule falls back wholesale to defaults, matching the
   module's existing behavior for malformed and wrongly-typed values.

**Rationale**: The shared-reference defect is the one that matters. `viewState`
is about to be read by a store slice, a canvas, a drawer, and a scorecard.
Zustand's `set` normally produces new objects, so the defect is latent rather
than active — which is precisely why it would be found late, as an unrelated
test failing in another file. A spread is sufficient because `ViewState` is flat
and holds only primitives.

The range rules are narrow on purpose. Only the constraints that follow from
what the field *is* are encoded — no upper bounds, no "reasonable" maxima. An
upper bound is a product decision nobody has made, and inventing one here would
put a number in the validator that no requirement supports.

**Alternatives considered**:

- *`structuredClone`.* Correct but unnecessary for a flat object of primitives,
  and it is the kind of choice that gets copied into places where its cost
  matters.
- *`Object.freeze` alone, without copying.* Rejected: it converts a silent
  corruption into a thrown error at the mutation site, which is better, but it
  breaks any consumer that legitimately spreads-and-modifies. Copying is the fix;
  freezing is the belt.
- *Per-field merge over defaults instead of wholesale fallback.* Rejected — this
  is the module's existing documented behavior, deliberately chosen in 004's
  T004, and changing it is a behavior change this feature has no mandate for.
- *Clamp out-of-range values into range rather than falling back.* Rejected:
  clamping invents a value the user never set and hides that stored state was
  wrong. Falling back is honest and already the module's idiom.

---

## D4 — The triage covers 78 cases, not the 74 in the two obvious files

**Decision**: Include the four `layoutMode` and `setLayoutMode` cases at
`__tests__/store/store.test.ts:134–148`.

**Rationale**: They assert a store slice that 004's T020 deletes along with the
layout toggle. No task in 004 owns them — its T021 and T022 name only the two
component test files. Left alone they outlive the deletion and then fail, and
they would fail inside S3, the session already carrying the most judgment. They
are pure deletions, and finding them is cheap now and expensive later.

**Alternatives considered**:

- *Leave them for 004's T020 to notice.* Rejected: T020 is specified as a
  deletion of source files. A source deletion that also has to hunt for orphaned
  store tests is the coupling FR-008 removes.
- *File them as a note for S3 rather than fixing them.* Rejected: writing down
  a four-line deletion costs more than doing it.

**Consequence**: every count in this feature is 78, and the verified per-file
counts are 47 (`KitchenSinkPage.test.tsx`), 27 (`WizardShell.test.tsx`), and 4
(`store.test.ts`). These were confirmed by `grep -c` and independently by
vitest's own per-file report, not carried over from planning.

---

## D5 — The 52/79 correction rides in 004's session prompts, not its tasks.md

**Decision**: FR-012 is satisfied by editing
`specs/004-p3-workbench-shell/sessions/S2.md` and `S3.md`, and
`scripts/run-chain.sh`'s header comment. Feature 004's `tasks.md`, `plan.md`,
`research.md`, and `spec.md` are left as they are.

**Rationale**: `~/.claude/hooks/halt-on-speckit-replan.sh` blocks any non-checkbox
edit to a `specs/*/{tasks,plan,spec}.md` whose `tasks.md` already has a checked
box. 004 has T001–T005 checked, so an agent correcting a number in its
`tasks.md` is halted and forced into a handoff — for a two-token fix. The hook is
right to do that; the constitution's rule is that mid-implementation revision of
a plan is re-planning.

The counts only ever mattered as an instruction to S3. Once S3's prompt says the
triage is already done and points at `triage-record.md`, the stale figures in
004's planning artifacts are inert. Correcting a number nothing reads is not
worth triggering a halt.

**Alternatives considered**:

- *Correct 004's `tasks.md` and `plan.md` anyway.* Rejected: it is the
  definition of the re-plan the hook and the constitution both name, and the
  user owns those artifacts.
- *Ask the user to make the edits by hand.* Available and not rejected — it is
  simply not required, and offering it as the only path would leave the feature
  blocked on a manual step for no behavioral gain.
- *Disable the hook for one edit.* Rejected outright.

---

## D6 — The six wizard and kitchen-sink source files are not deleted here

**Decision**: `src/components/KitchenSinkPage.tsx` and
`src/components/wizard/` (five files) stay. They are 004's T020.

**Rationale**: `src/App.tsx:60` is
`{layoutMode === 'wizard' ? <WizardShell /> : <KitchenSinkPage />}` and there is
no third branch. Those two components are the entire application until 004's
T011–T019 build the workbench shell. Deleting them here leaves a header
rendering over nothing.

The requirement that produced the question is satisfied a different way: after
this feature no test references them, so T020 becomes a source-only removal
rather than one that discovers broken imports. That is FR-008 and SC-004.

**Alternatives considered**:

- *Rename them to neutral names now.* Rejected: churn on files with a scheduled
  deletion, and it would break `scripts/smoke.mjs`'s locators twice instead of
  once — the driver still drives the `Single Page` and `Wizard` tabs until 004's
  T023 re-points it.
- *Pull 004's T011–T019 forward so the deletion can happen here.* That is 004's
  S2 in its entirety. Rejected as a scope inversion: it would make this
  interstitial feature larger than the one it is unblocking.
- *Delete the wizard only, keeping the kitchen sink as the sole layout.* Tempting
  — it removes five of the six names and `App.tsx`'s toggle with them. Rejected
  because it changes what a user sees, which pulls principle VI's live-smoke
  requirement into a feature whose smoke driver targets the very tab it would
  remove. It is a real option for a later session and is left on the table
  rather than taken here.
