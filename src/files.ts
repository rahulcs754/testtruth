import type { ChangedLines, Config } from './types.js';

const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** Files that are never worth mutating. */
export const DEFAULT_EXCLUDE = [
  '**/*.d.ts',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/*.stories.*',
  '**/*.config.*',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  'test/**',
  'tests/**',
  'e2e/**',
];

/** Minimal glob: `**` any path, `*` any name part, `?` one char. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(file: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(file));
}

export interface FileSelection {
  selected: ChangedLines;
  /** Source files left out because of `maxFiles`. */
  skipped: string[];
}

/** Keep only source files we can mutate, respecting include/exclude. */
export function selectFiles(changed: ChangedLines, config: Config): FileSelection {
  const selected: ChangedLines = new Map();
  const skipped: string[] = [];
  const exclude = [...DEFAULT_EXCLUDE, ...config.exclude];

  for (const [file, ranges] of [...changed].sort(([a], [b]) => a.localeCompare(b))) {
    if (!SOURCE_EXT.test(file)) continue;
    // Stryker splits --mutate on commas.
    if (file.includes(',')) continue;
    if (config.include.length > 0 && !matchesAny(file, config.include)) continue;
    if (matchesAny(file, exclude)) continue;
    if (selected.size >= config.maxFiles) skipped.push(file);
    else selected.set(file, ranges);
  }
  return { selected, skipped };
}
