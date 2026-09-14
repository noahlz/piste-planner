# Drift baseline: 013

Written 2026-09-07 at branch commit `aa7b5082fc`, before any `src/engine/`
edit. Phase 6's review (T035) compares against this table. Rule: no scheduled
count may move on the no-pins path (FR-058), stricter than the ledger's
floors.

## Ledger at the branch point

| Scenario | scheduledCount | errorCount | WARN total | warnCountsByCause | stripRecommendation |
|---|---:|---:|---:|---|---:|
| B1 | 24 | 0 | 0 | – | 48 |
| B2 | 24 | 0 | 8 | RESOURCE_EXHAUSTION 6, SCHEDULE_ACCEPTED_WITH_WARNINGS 2 | 70 |
| B3 | 24 | 0 | 0 | – | 71 |
| B4 | 17 | 13 | 27 | DEADLINE_BREACH 14, RESOURCE_EXHAUSTION 13 | 76 |
| B5 | 12 | 0 | 12 | RESOURCE_EXHAUSTION 12 | 28 |
| B6 | 45 | 9 | 27 | DEADLINE_BREACH 9, RESOURCE_EXHAUSTION 18 | 60 |
| B7 | 18 | 0 | 2 | SCHEDULE_ACCEPTED_WITH_WARNINGS 2 | 64 |
| B8 | 52 | 1 | 7 | DEADLINE_BREACH 1, RESOURCE_EXHAUSTION 5, SCHEDULE_ACCEPTED_WITH_WARNINGS 1 | 69 |

Snapshot `__tests__/engine/__snapshots__/driftLedger.test.ts.snap` SHA-256:
`5483c40c1349944b6ac26659406b39bb84fef9091c2e259c7f0e36920520d0b6`

`__tests__/store/appPathParity.test.ts`: passes (17 tests) at this commit.

## Driver Suggest counts at the branch point

| Call site | Template | Count the comment carries | Comment line |
|---|---|---:|---|
| `scripts/smoke.mjs:367` | ROC Div1A/Vet | 15 | `:406–408` (supersedes 23 recorded at `:398`; `[M]` 012 T014, 2026-09-06, T007-T011's search-based rule, baseline.md §5) |
| `:786` | NAC Youth | 63 | `:811–812` (`[M]` 012 T014, 2026-09-06, in the driver's accumulated session state; baseline.md §5's fresh-store answer is 66) |
| `:863` | NAC Vet/Div1/Junior | 80 | asserted at `:866–867`, explained at `:882–883` (`[M]`, measured in the running app, 2026-09-06) |
| `:912` | NAC Cadet/Junior | 48 | `:955–960` (supersedes 144 at `:946`, itself superseding 39; `[M]` 012 T014, 2026-09-06, T007-T011's search-based rule supersedes the busiest-day rule, matches baseline.md §5's fresh-store answer of 48) |

NAC Youth is expected to read 66 after phase 2 deletes the Admin gap override
step (research D14); T023 records the observed value.

## After phase 6

Measured 2026-09-14 by T035, a second reader who did not write T034, at commit
`29f95362f9` on branch `013-phase6-pins`. Values read out of
`__tests__/engine/__snapshots__/driftLedger.test.ts.snap` after running the
ledger and the parity suite in the worktree.

| Scenario | scheduledCount | errorCount | WARN total | warnCountsByCause | stripRecommendation |
|---|---:|---:|---:|---|---:|
| B1 | 24 | 0 | 0 | – | 48 |
| B2 | 24 | 0 | 8 | RESOURCE_EXHAUSTION 6, SCHEDULE_ACCEPTED_WITH_WARNINGS 2 | 70 |
| B3 | 24 | 0 | 0 | – | 71 |
| B4 | 17 | 13 | 27 | DEADLINE_BREACH 14, RESOURCE_EXHAUSTION 13 | 76 |
| B5 | 12 | 0 | 12 | RESOURCE_EXHAUSTION 12 | 28 |
| B6 | 45 | 9 | 27 | DEADLINE_BREACH 9, RESOURCE_EXHAUSTION 18 | 60 |
| B7 | 18 | 0 | 2 | SCHEDULE_ACCEPTED_WITH_WARNINGS 2 | 64 |
| B8 | 52 | 1 | 7 | DEADLINE_BREACH 1, RESOURCE_EXHAUSTION 5, SCHEDULE_ACCEPTED_WITH_WARNINGS 1 | 69 |

Snapshot SHA-256: `5483c40c1349944b6ac26659406b39bb84fef9091c2e259c7f0e36920520d0b6`
— equal to the branch-point SHA above. `git diff --stat 71180db6e7 --
__tests__/engine/__snapshots__/` is empty.

`__tests__/store/appPathParity.test.ts`: passes (17 tests). Ledger and parity
together, 35 tests, all pass.

Nothing moved.
