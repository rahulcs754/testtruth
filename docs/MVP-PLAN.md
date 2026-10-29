# TestTruth: MVP plan

**One line:** A PR check that mutation-tests only the changed lines and shows which changes no test would catch.

## How it works
1. **Diff:** `git diff --unified=0 <base>...HEAD` gives changed files and line ranges.
2. **Filter:** keep source files (`.ts .tsx .js .jsx .mjs .cjs`). Skip tests, stories, configs, `.d.ts`, and anything in `exclude`.
3. **Mutate:** run StrykerJS with `--mutate "src/a.ts:10-14,src/b.tsx:3-3"` and the JSON reporter. The repo's own `stryker.config.*` is used for the test runner.
4. **Score:** read `reports/mutation/mutation.json`. Keep only mutants on changed lines. Score = (killed + timeout) / (killed + timeout + survived + no coverage).
5. **Report:** a Markdown summary: score, a table per file, and each surviving mutant as "line 14: `a > b` changed to `a >= b`, no test failed".
6. **PR:** in GitHub Actions, post or update one sticky comment on the PR. Exit 1 when the score is below `threshold` and `failOnLow` is on.

## Example comment
> ### 🧪 TestTruth: 67% of changed code is truly tested
> 4 of 6 mutants were caught. 2 changes could break with no failing test.
>
> | File | Caught | Missed | Score |
> |---|---|---|---|
> | src/cart.ts | 4 | 2 | 67% |
>
> **Missed**
> - `src/cart.ts:14` EqualityOperator: `total > 0` → `total >= 0`
> - `src/cart.ts:21` BlockStatement: `{ return discount; }` → `{}`

## Config (optional, `testtruth.json` in the target repo)
```json
{
  "base": "origin/main",
  "threshold": 60,
  "failOnLow": false,
  "include": ["src/**"],
  "exclude": ["src/generated/**"],
  "maxFiles": 30
}
```

## Stack
Node 22, TypeScript strict, ESM. No runtime deps (Node built-ins + `fetch`). StrykerJS runs in the target repo through `npx`. vitest for tests, tsup to bundle the Action. No AI in the MVP.

## Build order (~2 weeks)
1. Diff parser + file filter + tests
2. Stryker runner (build args, run, find the report)
3. Report reader + score on changed lines + Markdown renderer + tests with a recorded report
4. CLI (`testtruth run`, `testtruth report`)
5. GitHub Action: sticky PR comment, job summary, threshold
6. Demo repo with a weak AI-style test, README GIF, GitHub Pages page

## Later
- Optional Claude step: suggest the missing assertion for each surviving mutant
- Cache results per commit (Stryker incremental mode)
- Inline review comments on the exact line
- Python (mutmut) and Java (PIT) adapters
