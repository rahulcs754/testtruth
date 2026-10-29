# CLAUDE.md

## Project
TestTruth: a CLI + GitHub Action that runs mutation testing (StrykerJS) only on the lines changed in a PR, and comments which changes no test would catch. Plan: docs/MVP-PLAN.md. Research: docs/RESEARCH.md.

## Stack
Node 22, TypeScript strict, ESM. No runtime dependencies: Node built-ins and `fetch` only. vitest for tests, tsup to bundle `dist/`. No AI in the MVP.

## Layout
- `src/diff.ts`: parse `git diff --unified=0` into changed line ranges.
- `src/files.ts`: decide which files can be mutated.
- `src/stryker.ts`: build Stryker args and run it in the target repo.
- `src/score.ts`: read the Stryker JSON report, keep mutants on changed lines, count.
- `src/markdown.ts`: render the PR comment.
- `src/github.ts`: post or update the sticky PR comment.
- `src/cli.ts`: entry point.

## Rules
- Pure logic (diff, files, score, markdown) has no I/O, so it is easy to test.
- Only count mutants on changed lines. Never report a whole-repo score as the PR score.
- If there is nothing to mutate, say so and exit 0. Never fail a PR because of our own error; print it and exit 0 unless `failOnLow` and the score is low.
- `GITHUB_TOKEN` comes from env only. Never log it.
- Tests use recorded Stryker reports in `test/fixtures/`, no network, no real Stryker run.
- `dist/` is committed for the Action. Run `npm run build` after changing `src/`.

## Commands
- `npm test`, `npm run typecheck`, `npm run build`

## Owner
Senior React/Next.js dev, India. Wants short, simple English and a clean portfolio-grade repo.
