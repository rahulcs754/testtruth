import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inRanges, mergeRanges, parseDiff } from '../src/diff.js';

const fixture = readFileSync(new URL('./fixtures/demo.diff', import.meta.url), 'utf8');

describe('parseDiff', () => {
  it('reads added line ranges and skips deleted files', () => {
    const changed = parseDiff(fixture);
    expect([...changed.keys()]).toEqual(['src/cart.js']);
    expect(changed.get('src/cart.js')).toEqual([
      { start: 3, end: 10 },
      { start: 13, end: 16 },
    ]);
  });

  it('handles single-line hunks, pure deletions and renames', () => {
    const diff = [
      'diff --git a/src/old.ts b/src/new.ts',
      'rename from src/old.ts',
      'rename to src/new.ts',
      '--- a/src/old.ts',
      '+++ b/src/new.ts',
      '@@ -5 +5 @@ x',
      '@@ -9,3 +8,0 @@ only deleted',
      '@@ -20 +20,2 @@',
      'diff --git a/src/gone.ts b/src/gone.ts',
      '--- a/src/gone.ts',
      '+++ b/src/gone.ts',
      '@@ -1,2 +0,0 @@',
    ].join('\n');
    const changed = parseDiff(diff);
    expect(changed.get('src/new.ts')).toEqual([
      { start: 5, end: 5 },
      { start: 20, end: 21 },
    ]);
    expect(changed.has('src/gone.ts')).toBe(false);
  });
});

describe('mergeRanges / inRanges', () => {
  it('merges touching and overlapping ranges', () => {
    expect(
      mergeRanges([
        { start: 10, end: 12 },
        { start: 1, end: 3 },
        { start: 4, end: 4 },
        { start: 11, end: 15 },
      ]),
    ).toEqual([
      { start: 1, end: 4 },
      { start: 10, end: 15 },
    ]);
  });

  it('checks a line against ranges', () => {
    const ranges = [{ start: 3, end: 5 }];
    expect(inRanges(3, ranges)).toBe(true);
    expect(inRanges(5, ranges)).toBe(true);
    expect(inRanges(6, ranges)).toBe(false);
    expect(inRanges(1, undefined)).toBe(false);
  });
});
