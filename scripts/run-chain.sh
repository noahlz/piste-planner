#!/usr/bin/env bash
#
# Runs the first sessions of feature 004-p3-workbench-shell as a chain, each in
# a fresh context.
#
#   ./scripts/run-chain.sh              # runs S1 S2  (the default)
#   ./scripts/run-chain.sh S1           # just the first link
#   ./scripts/run-chain.sh S1 S2 S3     # add S3 — see the caution below
#
# Each link is a separate `claude -p` process, so each starts with an empty
# context and picks up state from three places, in decreasing order of trust:
#
#   1. the worktree branch — commits are the real record
#   2. the gate this script runs itself after every link
#   3. sessions/handoff.md — the narrative each link writes for the next
#
# A link's own "I finished" is never taken on faith. It reports a JSON verdict,
# and then this script independently runs typecheck, lint, and the full suite
# before letting the next link start.
#
# CAUTION on S3: it deletes two layouts and decides, for 79 individual tests,
# which are re-targeted and which are dropped. That is judgment at volume and
# the failure mode is silent — coverage disappears and everything still looks
# green. Running it unattended is a real risk. Prefer driving S3 yourself.
#
# Sessions beyond S3 are NOT chainable. S7 carries the constitution III drift
# gate, which requires explaining why referee figures moved on six of eight
# scenarios rather than accepting it, and an unattended session will accept.
# quickstart.md also puts SC-002 and SC-004 on a human observer.

set -uo pipefail

FEATURE=004-p3-workbench-shell
BRANCH="$FEATURE"
WT=".claude/worktrees/$FEATURE"
SPEC="specs/$FEATURE"
BUDGET_USD=30

# acceptEdits lets file edits through but still prompts for Bash calls outside
# the allowlist in .claude/settings.local.json — a prompt no one can answer in
# print mode. If a link stalls or dies on a permission prompt, raise this to
# dontAsk. bypassPermissions skips every check; only reach for it knowingly.
PERM_MODE=acceptEdits

SESSIONS=("$@")
[ ${#SESSIONS[@]} -eq 0 ] && SESSIONS=(S1 S2)

ROOT=$(git rev-parse --show-toplevel) || { echo "not a git repository"; exit 1; }
cd "$ROOT"

command -v jq >/dev/null || { echo "jq is required"; exit 1; }
mkdir -p tmp

# ── Preflight ────────────────────────────────────────────────────────────────
# The spec artifacts are untracked on main. A worktree checked out from main
# would not carry them, so they are copied in before the first link and T001
# commits them onto the branch.

if [ -d "$WT" ]; then
  echo "→ worktree $WT already exists, reusing it"
else
  echo "→ creating worktree $WT on branch $BRANCH"
  git worktree add -b "$BRANCH" "$WT" main || exit 1

  echo "→ copying untracked feature artifacts into the worktree"
  mkdir -p "$WT/$SPEC" "$WT/tmp"
  cp -R "$SPEC/." "$WT/$SPEC/"
  cp docs/design/backlog.md                      "$WT/docs/design/backlog.md"
  cp docs/design/competition-planner-workbench.md "$WT/docs/design/competition-planner-workbench.md"
  cp scripts/run-chain.sh                        "$WT/scripts/run-chain.sh"
fi

# ── Verdict extraction ───────────────────────────────────────────────────────
# --json-schema should make .result an object. Older shapes hand back a string
# holding JSON, or prose with a fenced block. Try each rather than assuming.

extract() {   # extract <file> <field>
  jq -r --arg f "$2" '
    (.result | if type == "object" then .[$f] else empty end) //
    (.result | if type == "string" then (fromjson? | .[$f]) else empty end) //
    (.result | if type == "string"
               then (capture("(?s)```json\\s*(?<j>\\{.*?\\})\\s*```").j | fromjson? | .[$f])
               else empty end) //
    empty
  ' "$1" 2>/dev/null
}

gate() {
  ( cd "$WT" \
    && timeout 180 pnpm exec tsc -b   > tmp/tsc.log  2>&1 \
    && timeout 120 pnpm --silent lint > tmp/lint.log 2>&1 \
    && timeout 120 pnpm --silent test > tmp/test.log 2>&1 )
}

# ── The chain ────────────────────────────────────────────────────────────────

for s in "${SESSIONS[@]}"; do
  prompt="$WT/$SPEC/sessions/$s.md"
  out="tmp/$s.json"

  [ -f "$prompt" ] || { echo "✗ no prompt file at $prompt"; exit 1; }

  echo
  echo "════════════════════════════════════════════════════"
  echo "  $s   ($(date '+%H:%M:%S'))"
  echo "════════════════════════════════════════════════════"

  ( cd "$WT" && claude -p "$(cat "$ROOT/$prompt")" \
      -n "$FEATURE-$s" \
      --permission-mode "$PERM_MODE" \
      --max-budget-usd "$BUDGET_USD" \
      --output-format json \
      --json-schema '{
        "type": "object",
        "properties": {
          "status":     {"enum": ["ok", "halted"]},
          "reason":     {"type": "string"},
          "tasks_done": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["status", "reason", "tasks_done"]
      }' \
  ) > "$ROOT/$out"
  rc=$?

  if [ $rc -ne 0 ]; then
    echo "✗ $s: claude exited $rc — see $out"
    exit 1
  fi

  status=$(extract "$out" status)
  reason=$(extract "$out" reason)
  done_tasks=$(jq -r '
      ((.result | if type == "object" then .tasks_done else empty end) //
       (.result | if type == "string" then (fromjson? | .tasks_done) else empty end) //
       (.result | if type == "string"
                  then (capture("(?s)```json\\s*(?<j>\\{.*?\\})\\s*```").j
                        | fromjson? | .tasks_done)
                  else empty end) //
       []) | join(", ")' "$out" 2>/dev/null)

  if [ -z "$status" ]; then
    echo "✗ $s: no verdict found in $out — inspect it by hand before continuing"
    exit 1
  fi

  echo "  verdict : $status"
  echo "  reason  : $reason"
  echo "  tasks   : ${done_tasks:-none reported}"

  if [ "$status" != "ok" ]; then
    echo "✗ $s halted. Read $WT/$SPEC/sessions/handoff.md, then continue by hand."
    exit 1
  fi

  echo "  → running the gate independently…"
  if gate; then
    echo "  ✓ gate green"
  else
    echo "✗ $s left the gate red. Logs in $WT/tmp/{tsc,lint,test}.log"
    exit 1
  fi

  # A link that claims success without committing has nothing to hand on.
  ( cd "$WT" && git diff --quiet && git diff --cached --quiet ) \
    || echo "  ! uncommitted changes remain in the worktree — check before the next link"
done

echo
echo "════════════════════════════════════════════════════"
echo "  chain complete: ${SESSIONS[*]}"
echo "════════════════════════════════════════════════════"
( cd "$WT" && git log --oneline main..HEAD | cat )

# ── Push the feature branch ──────────────────────────────────────────────────
# The constitution forbids an *agent* running git push, and the session prompts
# in sessions/*.md still do. This script is not an agent — it is the user's own
# hand, invoked deliberately, and 003's branch reached origin the same way.
#
# The guard below is the part that matters: this can only ever push the feature
# branch. It refuses main, master, and any branch the worktree was not created
# for, so a stray checkout inside the worktree cannot turn this into a push to
# the landing branch. Merging into main is still yours alone.

echo
current=$( cd "$WT" && git rev-parse --abbrev-ref HEAD )

if [ "$current" != "$BRANCH" ]; then
  echo "! worktree is on '$current', not '$BRANCH' — refusing to push"
elif [ "$current" = "main" ] || [ "$current" = "master" ]; then
  echo "! refusing to push a landing branch"
else
  echo "→ pushing $BRANCH to origin"
  if ( cd "$WT" && git push -u origin "$BRANCH" ); then
    echo "  ✓ pushed"
  else
    echo "  ✗ push failed — the branch is intact locally, push it by hand"
  fi
fi

echo
echo "Handoff record: $WT/$SPEC/sessions/handoff.md"
echo "Nothing has been merged. Landing the branch is yours:"
echo "  git merge --no-ff --no-commit $BRANCH   then /commit-with-costs"
