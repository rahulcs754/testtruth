import { execFileSync } from 'node:child_process';
import type { ChangedLines, LineRange } from './types.js';

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse `git diff --unified=0` output into the added/changed line ranges
 * of each file. Deleted files and pure deletions are left out.
 */
export function parseDiff(diff: string): ChangedLines {
  const result: ChangedLines = new Map();
  let current: LineRange[] | undefined;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = parsePath(line.slice(4));
      if (path) {
        current = result.get(path) ?? [];
        result.set(path, current);
      } else {
        current = undefined;
      }
      continue;
    }
    const hunk = HUNK.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) current.push({ start, end: start + count - 1 });
    }
  }

  for (const [path, ranges] of result) {
    if (ranges.length === 0) result.delete(path);
    else result.set(path, mergeRanges(ranges));
  }
  return result;
}

function parsePath(raw: string): string | undefined {
  let path = raw.trim();
  if (path === '/dev/null') return undefined;
  if (path.startsWith('"') && path.endsWith('"')) {
    // git quotes paths with unusual characters; we skip escape handling
    // and only support plain quoted paths.
    path = path.slice(1, -1);
    if (path.includes('\\')) return undefined;
  }
  return path.startsWith('b/') ? path.slice(2) : path;
}

export function mergeRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: LineRange[] = [];
  for (const r of sorted) {
    const last = merged.at(-1);
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

export function inRanges(line: number, ranges: LineRange[] | undefined): boolean {
  return !!ranges?.some((r) => line >= r.start && line <= r.end);
}

/** Changed lines between `base` and HEAD (three-dot: since the merge base). */
export function gitChangedLines(base: string, cwd = process.cwd()): ChangedLines {
  const out = execFileSync(
    'git',
    ['diff', '--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=AMR', `${base}...HEAD`],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return parseDiff(out);
}
