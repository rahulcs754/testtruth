import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDiff } from '../src/diff.js';
import { MARKER, renderMarkdown } from '../src/markdown.js';
import { summarize } from '../src/score.js';
import type { MutationReport } from '../src/types.js';

// Recorded from a real Stryker run on examples/demo (no Stryker run in tests).
const report = JSON.parse(
  readFileSync(new URL('./fixtures/demo-report.json', import.meta.url), 'utf8'),
) as MutationReport;
const changed = parseDiff(readFileSync(new URL('./fixtures/demo.diff', import.meta.url), 'utf8'));

describe('summarize', () => {
  it('scores mutants on changed lines', () => {
    const s = summarize(report, changed);
    expect(s).toMatchObject({ caught: 3, missed: 12, invalid: 0, score: 20 });
    expect(s.files).toEqual([{ file: 'src/cart.js', caught: 3, missed: 12, score: 20 }]);
    expect(s.missedMutants[0]).toEqual({
      file: 'src/cart.js',
      line: 7,
      mutator: 'ConditionalExpression',
      original: '!coupon',
      replacement: 'true',
      status: 'Survived',
    });
  });

  it('ignores mutants outside the changed lines', () => {
    const onlyShipping = new Map([['src/cart.js', [{ start: 15, end: 15 }]]]);
    expect(summarize(report, onlyShipping)).toMatchObject({ caught: 0, missed: 4, score: 0 });
  });

  it('ignores files that were not changed', () => {
    expect(summarize(report, new Map()).score).toBeNull();
  });

  it('counts timeouts as caught and compile errors as invalid', () => {
    const loc = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
    const s = summarize(
      {
        files: {
          'src/x.ts': {
            mutants: [
              { id: '1', mutatorName: 'A', status: 'Timeout', location: loc },
              { id: '2', mutatorName: 'B', status: 'CompileError', location: loc },
              { id: '3', mutatorName: 'C', status: 'NoCoverage', location: loc, replacement: 'x' },
              { id: '4', mutatorName: 'D', status: 'Ignored', location: loc },
            ],
          },
        },
      },
      new Map([['src/x.ts', [{ start: 1, end: 1 }]]]),
    );
    expect(s).toMatchObject({ caught: 1, missed: 1, invalid: 1, score: 50 });
    expect(s.missedMutants[0]?.status).toBe('NoCoverage');
  });
});

describe('renderMarkdown', () => {
  it('renders the demo report', () => {
    const md = renderMarkdown(summarize(report, changed), { threshold: 60 });
    expect(md.startsWith(MARKER)).toBe(true);
    expect(md).toMatchSnapshot();
  });

  it('says when there is nothing to check', () => {
    const md = renderMarkdown(summarize({ files: {} }, changed), { threshold: 60, skipped: ['src/big.ts'] });
    expect(md).toContain('nothing to check');
    expect(md).toContain('`src/big.ts`');
  });

  it('shows a pass when every mutant is caught', () => {
    const md = renderMarkdown(
      { caught: 4, missed: 0, invalid: 0, score: 100, files: [{ file: 'a|b.ts', caught: 4, missed: 0, score: 100 }], missedMutants: [] },
      { threshold: 60 },
    );
    expect(md).toContain('✅ TestTruth: 100%');
    expect(md).toContain('a\\|b.ts');
    expect(md).toContain('caught every one');
  });
});
