# TestTruth

**Are your tests actually testing anything?** TestTruth is a PR check that adds small bugs to the lines your PR changed (mutation testing) and tells you which ones **no test noticed**.

[![CI](https://github.com/rahulcs754/testtruth/actions/workflows/ci.yml/badge.svg)](https://github.com/rahulcs754/testtruth/actions/workflows/ci.yml)
· [Website](https://rahulcs754.github.io/testtruth/)

## Benefits
- **Proves your tests work.** Coverage says a line ran. TestTruth says a test would fail if that line broke.
- **Catches weak AI-written tests.** `expect(x).toBeDefined()` gives 100% coverage and catches nothing. TestTruth shows it.
- **Fast enough for every PR.** Only changed lines are mutated, so a run takes seconds to a few minutes, not an hour.
- **Easy to act on.** The PR comment lists each missed bug with the file, line and the exact change.
- **No lock-in.** Uses StrykerJS, the standard JS/TS mutation tool. No account, no server, no AI, no data leaves CI.

## What the PR comment looks like
From the [demo](examples/demo): the tests run every line, but only check `toBeDefined()`.

> ### ⚠️ TestTruth: 20% of changed code is truly tested
> 3 of 15 small bugs we added to your changed lines made a test fail. **12 could ship with no failing test.**
>
> | File | Caught | Missed | Score |
> |---|---:|---:|---:|
> | src/cart.js | 3 | 12 | 20% |
>
> **Missed** (add or tighten a test so each of these fails):
> - `src/cart.js:8` EqualityOperator: `subtotal >= coupon.minSpend` → `subtotal > coupon.minSpend` _(tests ran, none failed)_
> - `src/cart.js:9` ArithmeticOperator: `subtotal - coupon.amount` → `subtotal + coupon.amount` _(tests ran, none failed)_
> - `src/cart.js:15` EqualityOperator: `subtotal > 999` → `subtotal >= 999` _(tests ran, none failed)_

## How to use it

### 1. Add StrykerJS to your repo
```bash
npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner   # or @stryker-mutator/jest-runner
```
Add `stryker.config.json` in the repo root:
```json
{
  "testRunner": "vitest",
  "coverageAnalysis": "perTest"
}
```
TestTruth sets `mutate` for you, so leave it out.

### 2. Add the GitHub Action
Create `.github/workflows/testtruth.yml` (also in [examples/workflow](examples/workflow/testtruth.yml)):
```yaml
name: TestTruth
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  testtruth:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # needed to diff against the base branch
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - uses: rahulcs754/testtruth@main
        with:
          threshold: 60
          fail-on-low: false
```

### 3. Open a PR
TestTruth posts one comment and keeps it updated on each push. The same report is in the job summary.

### Action inputs
| Input | Default | What it does |
|---|---|---|
| `base` | `origin/<PR base>` | Ref to diff against |
| `threshold` | `60` | Minimum score, 0-100 |
| `fail-on-low` | `false` | Fail the check when the score is below the threshold |
| `comment` | `true` | Post or update the PR comment |
| `working-directory` | `.` | Package folder, for monorepos |
| `github-token` | `github.token` | Token for the comment |

## Run it locally
```bash
git clone https://github.com/rahulcs754/testtruth && cd testtruth
npm ci && npm run build

# in your project (with Stryker installed):
node /path/to/testtruth/dist/cli.js run --base origin/main --dry-run   # see what will be mutated
node /path/to/testtruth/dist/cli.js run --base origin/main             # run and print the report
```

| Command | What it does |
|---|---|
| `testtruth run` | Diff vs base, run Stryker on changed lines, print the report |
| `testtruth report --report reports/mutation/mutation.json` | Score an existing Stryker report, no new run |

Flags: `--base`, `--config`, `--threshold`, `--fail-on-low`, `--comment`, `--out <file>`, `--dry-run`.

## Config (optional)
`testtruth.json` in your repo root:
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
Tests, stories, `*.config.*`, `*.d.ts`, `dist/` and `node_modules/` are always skipped.

## How it works
1. `git diff --unified=0 <base>...HEAD` gives the changed line ranges.
2. Keep `.ts/.tsx/.js/.jsx` source files, skip tests and config.
3. Run `stryker run --mutate "src/a.ts:10-14,..."` with the JSON reporter.
4. Keep only mutants on changed lines. Score = caught / (caught + missed). Timeouts count as caught; compile errors are not counted.
5. Render Markdown, write the job summary, upsert the PR comment.

**Tip:** if a mutant cannot change behaviour (an "equivalent mutant"), silence it with `// Stryker disable next-line <MutatorName>`.

## Develop
```bash
npm ci
npm test          # unit tests, uses a recorded Stryker report (no real run)
npm run typecheck
npm run build     # bundles dist/cli.js; commit dist/ for the Action
```
Try it on the demo:
```bash
cd examples/demo && npm i && git init -q && git add -A && git commit -qm init
# change src/cart.js, commit, then:
node ../../dist/cli.js run --base HEAD~1
```

## Roadmap
- Optional Claude step: suggest the missing assertion for each missed mutant
- Inline review comments on the exact line
- Cache results per commit (Stryker incremental mode)

## License
MIT
