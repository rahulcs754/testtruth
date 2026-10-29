import { isAbsolute, relative } from 'node:path';
import { inRanges } from './diff.js';
import type { ChangedLines, FileScore, MissedMutant, MutationReport, Summary } from './types.js';

const MAX_SNIPPET = 60;

function toRepoPath(file: string, cwd: string): string {
  const rel = isAbsolute(file) ? relative(cwd, file) : file;
  return rel.replace(/\\/g, '/').replace(/^\.\//, '');
}

function percent(caught: number, missed: number): number | null {
  const total = caught + missed;
  return total === 0 ? null : Math.round((caught / total) * 1000) / 10;
}

function shorten(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_SNIPPET ? `${oneLine.slice(0, MAX_SNIPPET - 1)}…` : oneLine;
}

/** The original code a mutant replaced, from the report's copy of the source. */
function originalText(source: string | undefined, loc: MutationReport['files'][string]['mutants'][number]['location']): string | undefined {
  if (!source) return undefined;
  const lines = source.split('\n');
  const { start, end } = loc;
  // Report columns are 1-based.
  if (start.line === end.line) return lines[start.line - 1]?.slice(start.column - 1, end.column - 1);
  const parts = [lines[start.line - 1]?.slice(start.column - 1) ?? ''];
  for (let l = start.line + 1; l < end.line; l++) parts.push(lines[l - 1] ?? '');
  parts.push(lines[end.line - 1]?.slice(0, end.column - 1) ?? '');
  return parts.join('\n');
}

/**
 * Score only the mutants that sit on changed lines.
 * Caught = Killed + Timeout. Missed = Survived + NoCoverage.
 * CompileError / RuntimeError are invalid mutants; Ignored / Pending are left out.
 */
export function summarize(report: MutationReport, changed: ChangedLines, cwd = process.cwd()): Summary {
  const files: FileScore[] = [];
  const missedMutants: MissedMutant[] = [];
  let caught = 0;
  let missed = 0;
  let invalid = 0;

  for (const [rawPath, result] of Object.entries(report.files)) {
    const file = toRepoPath(rawPath, cwd);
    const ranges = changed.get(file);
    if (!ranges) continue;

    let fileCaught = 0;
    let fileMissed = 0;
    for (const m of result.mutants) {
      if (!inRanges(m.location.start.line, ranges)) continue;
      switch (m.status) {
        case 'Killed':
        case 'Timeout':
          fileCaught++;
          break;
        case 'Survived':
        case 'NoCoverage': {
          fileMissed++;
          const original = originalText(result.source, m.location);
          missedMutants.push({
            file,
            line: m.location.start.line,
            mutator: m.mutatorName,
            original: original === undefined ? undefined : shorten(original),
            replacement: m.replacement === undefined ? undefined : shorten(m.replacement),
            status: m.status,
          });
          break;
        }
        case 'CompileError':
        case 'RuntimeError':
          invalid++;
          break;
        default:
          break;
      }
    }
    if (fileCaught + fileMissed === 0) continue;
    caught += fileCaught;
    missed += fileMissed;
    files.push({ file, caught: fileCaught, missed: fileMissed, score: percent(fileCaught, fileMissed) });
  }

  files.sort((a, b) => (a.score ?? 100) - (b.score ?? 100) || a.file.localeCompare(b.file));
  missedMutants.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { caught, missed, invalid, score: percent(caught, missed), files, missedMutants };
}
