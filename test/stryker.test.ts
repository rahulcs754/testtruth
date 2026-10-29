import { describe, expect, it } from 'vitest';
import { buildMutateArg, strykerArgs } from '../src/stryker.js';

describe('stryker args', () => {
  it('builds the --mutate line ranges', () => {
    const files = new Map([
      ['src/a.ts', [{ start: 3, end: 5 }, { start: 9, end: 9 }]],
      ['src/b.tsx', [{ start: 1, end: 2 }]],
    ]);
    expect(buildMutateArg(files)).toBe('src/a.ts:3-5,src/a.ts:9-9,src/b.tsx:1-2');
    expect(strykerArgs(files)).toEqual([
      'run',
      '--mutate',
      'src/a.ts:3-5,src/a.ts:9-9,src/b.tsx:1-2',
      '--reporters',
      'json,clear-text',
    ]);
  });
});
