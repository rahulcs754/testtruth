import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { globToRegExp, selectFiles } from '../src/files.js';
import type { ChangedLines } from '../src/types.js';

const r = [{ start: 1, end: 2 }];

function changed(...files: string[]): ChangedLines {
  return new Map(files.map((f) => [f, r]));
}

describe('globToRegExp', () => {
  it('supports **, * and ?', () => {
    expect(globToRegExp('src/**').test('src/a/b.ts')).toBe(true);
    expect(globToRegExp('**/*.test.*').test('a.test.ts')).toBe(true);
    expect(globToRegExp('**/*.test.*').test('src/x/a.test.tsx')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false);
    expect(globToRegExp('a?.ts').test('ab.ts')).toBe(true);
  });
});

describe('selectFiles', () => {
  it('keeps source files and drops tests, stories, configs and non-code', () => {
    const { selected } = selectFiles(
      changed(
        'src/cart.ts',
        'src/Button.tsx',
        'src/cart.test.ts',
        'src/__tests__/x.ts',
        'src/Button.stories.tsx',
        'vite.config.ts',
        'src/types.d.ts',
        'README.md',
        'styles.css',
        'tests/e2e.ts',
      ),
      DEFAULT_CONFIG,
    );
    expect([...selected.keys()]).toEqual(['src/Button.tsx', 'src/cart.ts']);
  });

  it('applies include, exclude and maxFiles', () => {
    const config = { ...DEFAULT_CONFIG, include: ['src/**'], exclude: ['src/gen/**'], maxFiles: 2 };
    const { selected, skipped } = selectFiles(
      changed('lib/a.ts', 'src/gen/api.ts', 'src/c.ts', 'src/a.ts', 'src/b.ts'),
      config,
    );
    expect([...selected.keys()]).toEqual(['src/a.ts', 'src/b.ts']);
    expect(skipped).toEqual(['src/c.ts']);
  });
});
