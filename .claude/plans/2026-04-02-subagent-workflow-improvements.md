# Subagent Workflow Improvements

Observations from the 2026-04-01 methodology-code-alignment implementation session.

---

### 1. Integrate tests with each code task

Write tests alongside each code fix instead of batching all tests into a final task. The test implementer had to understand 16 code changes at once. Integrated testing gives better coverage and catches issues earlier.

**Trade-off:** More subagent invocations per task (implementer writes tests → reviewer checks both code and tests).

### 2. Skip spec reviews for mechanical changes

Pure find-replace renames and comment-only edits don't benefit from spec review. Reserve spec reviews for logic changes. Use `grep` to verify mechanical renames instead.

### 3. Run code quality reviews for structural changes

Small targeted fixes to existing functions can skip code quality review. Larger structural changes (e.g., fencer defaults table restructure from flat keys to weapon×gender keys) should get a code quality review.

### 4. Cap batch size at 3-4 steps per subagent

Task 5 (5 steps) was at the upper limit. 2-4 steps per subagent is the sweet spot. A failure in a large batch makes debugging harder.

### 5. Review modified test assertions, not just new tests

When implementer subagents update existing test expectations to match new behavior, those changes should also be reviewed. The test-quality reviewer only saw newly-added tests, not modified assertions in existing tests.

### 6. Restart TS language server after broad renames

The IDE LSP never caught up with `saber_refs → three_weapon_refs` rename. Every subsequent task triggered false-positive diagnostics requiring manual `tsc --noEmit` verification. Restarting the TS language server after large renames would eliminate this overhead.
