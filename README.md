# TestTruth

**Are your tests actually testing anything?** TestTruth is a PR check that changes your new code on purpose (mutation testing) and tells you which changes **no test noticed**.

> Status: planning. See [docs/MVP-PLAN.md](docs/MVP-PLAN.md).

## Why
- AI tools write a lot of tests now. Coverage looks great, but many tests would still pass if the code was wrong.
- Coverage only says a line ran. Mutation testing says a test would fail if that line broke.
- Full mutation runs are slow. TestTruth only mutates the lines your PR changed, so it takes minutes.

## What it will do
- Read the PR diff and pick the changed lines in `.ts/.tsx/.js/.jsx` files
- Run [StrykerJS](https://stryker-mutator.io) on only those lines
- Post one PR comment: score, and each "missed" change with the line
- Optionally fail the check when the score is below your threshold
