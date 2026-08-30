---
name: "live-smoke"
description: "Run the live browser smoke test against the running app. Use when a feature needs verification in the real UI rather than in unit tests — checking that a schedule renders, a derived view follows an edit, or a shared URL round-trips. Also use when asked to run, drive, or screenshot the app."
argument-hint: "Optional: a specific assertion or flow to check"
compatibility: "Requires playwright-core and a chromium build in the ms-playwright cache"
user-invocable: true
disable-model-invocation: false
---

# Live Smoke

`scripts/smoke.mjs` drives the running app in a real browser. It is the only
check that exercises what a user touches — the unit suite verifies the engine
and components in isolation and will happily agree with itself while the app is
broken.

## Run it in a subagent

**Dispatch this to a subagent, not the orchestrator.** Locator failures come in
runs of four or five, each one a full round trip, and in an orchestrator at
300k context that is the most expensive verification in the feature. In a
subagent each iteration pays the subagent's small context and only the verdict
returns.

Model: Sonnet. Locator repair is not complicated work.

## Procedure

1. Start the dev server if nothing is serving `SMOKE_BASE`:
   `pnpm dev` in the background, wait for the port.
2. `timeout 180 node scripts/smoke.mjs`
3. Read the last line. `SMOKE PASS` means every assertion held. Any other
   ending names the step that failed.
4. On failure, decide which of two things happened:
   - **The app is wrong.** Report it. This is the outcome worth having.
   - **The locator is wrong.** Fix it in `scripts/smoke.mjs` and rerun.
     Never fix a locator by writing a new scratch driver — that discards
     every selector lesson already encoded here.
5. Screenshots land in `scripts/smoke-shots/`. Read one only when a failure
   needs visual diagnosis, and prefer the viewport shot: `SMOKE_FULLPAGE=1`
   produces images thousands of pixels tall that are expensive to pull into
   context.

## Env

| Var | Default |
|---|---|
| `SMOKE_BASE` | `http://localhost:5173/piste-planner/` |
| `SMOKE_CHROME` | newest chromium in the ms-playwright cache |
| `SMOKE_FULLPAGE` | unset (viewport shots) |

## Keeping it alive

The driver asserts against the current UI, so a feature that reshapes the UI
updates it in the same task that reshapes it — the same rule behavior changes
follow for their tests. P3 deletes the wizard and the layout toggle; its
wizard block goes then, and the assertions above it move to the new shell.

Do not let it rot into a file that is rewritten from scratch each feature. The
selectors in it are the record of five separate corrections against the real
DOM.
