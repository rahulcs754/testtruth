import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { gitChangedLines } from './diff.js';
import { selectFiles } from './files.js';
import { prContext, upsertComment } from './github.js';
import { renderMarkdown } from './markdown.js';
import { buildMutateArg, readReport, runStryker } from './stryker.js';
import { summarize } from './score.js';
import type { Config, MutationReport } from './types.js';

const HELP = `testtruth: mutation-test only the lines your PR changed

Usage:
  testtruth run     Run Stryker on changed lines and print the report
  testtruth report  Score an existing Stryker report (skip the run)

Options:
  --base <ref>          Compare against this ref (default: origin/<PR base> or origin/main)
  --config <path>       Config file (default: testtruth.json)
  --threshold <0-100>   Minimum score (overrides config)
  --fail-on-low         Exit 1 when the score is below the threshold
  --comment             Post or update a PR comment (needs GITHUB_TOKEN, in Actions)
  --out <path>          Also write the Markdown report to this file
  --report <path>       (report) Stryker JSON report to read
  --dry-run             (run) Print what would be mutated, do not run Stryker
  -h, --help            Show this help
`;

function defaultBase(config: Config): string {
  if (config.base) return config.base;
  const prBase = process.env.GITHUB_BASE_REF;
  return prBase ? `origin/${prBase}` : 'origin/main';
}

function warn(message: string): void {
  // Shows as an annotation in GitHub Actions, plain text elsewhere.
  console.error(process.env.GITHUB_ACTIONS ? `::warning title=TestTruth::${message}` : `testtruth: ${message}`);
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      base: { type: 'string' },
      config: { type: 'string', default: 'testtruth.json' },
      threshold: { type: 'string' },
      'fail-on-low': { type: 'boolean' },
      comment: { type: 'boolean' },
      out: { type: 'string' },
      report: { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const command = positionals[0];
  if (values.help || (command !== 'run' && command !== 'report')) {
    console.log(HELP);
    return values.help ? 0 : 2;
  }

  const config = loadConfig(resolve(values.config));
  if (values.threshold !== undefined) {
    const t = Number(values.threshold);
    if (!Number.isFinite(t) || t < 0 || t > 100) throw new Error('--threshold must be 0-100');
    config.threshold = t;
  }
  if (values['fail-on-low']) config.failOnLow = true;

  const base = values.base ?? defaultBase(config);
  const { selected, skipped } = selectFiles(gitChangedLines(base), config);

  let report: MutationReport;
  if (command === 'report') {
    if (!values.report) throw new Error('report needs --report <path>');
    report = readReport(resolve(values.report));
  } else if (selected.size === 0) {
    report = { files: {} };
  } else if (values['dry-run']) {
    console.log(`Would mutate (vs ${base}):\n${buildMutateArg(selected).split(',').join('\n')}`);
    return 0;
  } else {
    console.error(`testtruth: mutating ${selected.size} changed file(s) vs ${base}`);
    report = runStryker(selected);
  }

  const summary = summarize(report, selected);
  const markdown = renderMarkdown(summary, { threshold: config.threshold, skipped });
  console.log(markdown);

  if (values.out) writeFileSync(values.out, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

  if (values.comment) {
    const pr = prContext();
    const token = process.env.GITHUB_TOKEN;
    if (!pr) warn('--comment is set but this is not a pull_request run; skipping the comment.');
    else if (!token) warn('--comment needs GITHUB_TOKEN; skipping the comment.');
    else {
      try {
        const how = await upsertComment(token, pr, markdown);
        console.error(`testtruth: PR comment ${how}`);
      } catch (err) {
        warn(`could not post the PR comment: ${(err as Error).message}`);
      }
    }
  }

  if (config.failOnLow && summary.score !== null && summary.score < config.threshold) {
    console.error(`testtruth: score ${summary.score}% is below the threshold ${config.threshold}%`);
    return 1;
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    // Our own errors never fail the PR; they show as a warning instead.
    warn((err as Error).message ?? String(err));
    process.exit(0);
  },
);
