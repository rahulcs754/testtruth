import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ChangedLines, MutationReport } from './types.js';

export const REPORT_PATH = 'reports/mutation/mutation.json';

/** `src/a.ts:3-5,src/a.ts:9-9,src/b.tsx:1-2`: Stryker's line-range syntax. */
export function buildMutateArg(files: ChangedLines): string {
  const parts: string[] = [];
  for (const [file, ranges] of files) {
    for (const r of ranges) parts.push(`${file}:${r.start}-${r.end}`);
  }
  return parts.join(',');
}

export function strykerArgs(files: ChangedLines): string[] {
  return ['run', '--mutate', buildMutateArg(files), '--reporters', 'json,clear-text'];
}

export function findStryker(cwd: string): string | undefined {
  const bin = join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'stryker.cmd' : 'stryker');
  return existsSync(bin) ? bin : undefined;
}

/**
 * Run Stryker in the target repo on the given lines and return its JSON report.
 * Uses the repo's own stryker.config.* for the test runner and other options.
 */
export function runStryker(files: ChangedLines, cwd = process.cwd()): MutationReport {
  const bin = findStryker(cwd);
  if (!bin) {
    throw new Error(
      'StrykerJS is not installed in this repo. Run: npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner (or jest-runner)',
    );
  }
  const reportFile = join(cwd, REPORT_PATH);
  // Never read a report left over from an older run.
  rmSync(reportFile, { force: true });

  const result = spawnSync(bin, strykerArgs(files), {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;

  // Stryker exits non-zero when its own `thresholds.break` is hit; the report is still valid.
  if (!existsSync(reportFile)) {
    throw new Error(`Stryker did not write ${REPORT_PATH} (exit code ${result.status}). See the log above.`);
  }
  return readReport(reportFile);
}

export function readReport(path: string): MutationReport {
  const report = JSON.parse(readFileSync(path, 'utf8')) as MutationReport;
  if (!report || typeof report.files !== 'object') throw new Error(`${path} is not a Stryker mutation report`);
  return report;
}
