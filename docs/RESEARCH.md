# Research notes (Oct 2026)

From round 3 idea research (team workflow tools for QA and developers).

## The problem
- AI coding tools now write a lot of the tests. Coverage goes up, but many of these tests assert very little (`expect(result).toBeDefined()`, snapshot of whatever came out).
- Line coverage only says code **ran**. It does not say a test would **fail** if the code was wrong.
- Mutation testing answers that question: change the code a little (`>` to `>=`, `true` to `false`, remove a call) and see if a test fails. If no test fails, that line is not really tested.
- Teams skip mutation testing because a full run is slow (tens of minutes to hours) and the report is too big to read.

## Nearby tools
- **StrykerJS**: the standard mutation testing tool for JS/TS. Has `mutate` line ranges and an incremental mode, but no "only my PR" flow and no PR comment.
- **Stryker Dashboard**: hosts full reports and badges. Whole-repo score, not per-PR.
- **Codecov / Coveralls**: PR comments on line coverage. Coverage, not test strength.
- **Qodo / Copilot test generation**: write more tests, do not check if tests catch bugs.

**Gap:** a cheap PR check that mutates only the changed lines and says, in plain words, "these 3 changes could be broken and no test would notice".

## Why diff-only works
- A typical PR changes 20-200 lines. Mutating only those gives 10-80 mutants, so the run takes a few minutes, not an hour.
- The result is about the author's own change, so it is actionable in review.

## Risks
- Speed still depends on the test suite. Mitigate: Stryker `perTest` coverage analysis, a mutant cap, and a timeout.
- Some mutants are "equivalent" (code changed but behaviour did not). Mitigate: show them as hints, allow `// Stryker disable next-line` comments, keep the default threshold soft (warn, not fail).
- Needs a test runner plugin per stack. MVP: vitest and jest.
