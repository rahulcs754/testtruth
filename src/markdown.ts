import type { MissedMutant, Summary } from './types.js';

/** Hidden marker so we update our own PR comment instead of adding a new one. */
export const MARKER = '<!-- testtruth-report -->';
const MAX_MISSED = 25;

export interface RenderOptions {
  threshold: number;
  /** Source files left out because of `maxFiles`. */
  skipped?: string[];
}

function code(text: string): string {
  return text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function pct(score: number | null): string {
  return score === null ? 'n/a' : `${score}%`;
}

function missedLine(m: MissedMutant): string {
  const where = code(`${m.file}:${m.line}`);
  const change =
    m.original !== undefined && m.replacement !== undefined
      ? `${code(m.original || ' ')} → ${code(m.replacement || ' ')}`
      : m.replacement !== undefined
        ? `→ ${code(m.replacement || ' ')}`
        : '';
  const why = m.status === 'NoCoverage' ? 'no test runs this line' : 'tests ran, none failed';
  return `- ${where} ${m.mutator}: ${change} _(${why})_`.replace(/ {2,}/g, ' ');
}

export function renderMarkdown(summary: Summary, opts: RenderOptions): string {
  const out: string[] = [MARKER];
  const total = summary.caught + summary.missed;

  if (summary.score === null) {
    out.push('### 🧪 TestTruth: nothing to check');
    out.push('', 'No mutants were created on the changed lines (no logic changed, or only tests/config changed).');
  } else {
    const icon = summary.score >= opts.threshold ? '✅' : '⚠️';
    out.push(`### ${icon} TestTruth: ${summary.score}% of changed code is truly tested`);
    out.push(
      '',
      `${summary.caught} of ${total} small bugs we added to your changed lines made a test fail.` +
        (summary.missed > 0
          ? ` **${summary.missed} could ship with no failing test.**`
          : ' Your tests caught every one.'),
      `Threshold: ${opts.threshold}%.`,
    );

    out.push('', '| File | Caught | Missed | Score |', '|---|---:|---:|---:|');
    for (const f of summary.files) {
      out.push(`| ${cell(f.file)} | ${f.caught} | ${f.missed} | ${pct(f.score)} |`);
    }

    if (summary.missedMutants.length > 0) {
      out.push('', '**Missed** (add or tighten a test so each of these fails):');
      for (const m of summary.missedMutants.slice(0, MAX_MISSED)) out.push(missedLine(m));
      const rest = summary.missedMutants.length - MAX_MISSED;
      if (rest > 0) out.push(`- …and ${rest} more. See the full Stryker log in the job.`);
    }
  }

  const notes: string[] = [];
  if (summary.invalid > 0) notes.push(`${summary.invalid} mutant(s) did not compile and were not counted.`);
  if (opts.skipped && opts.skipped.length > 0) {
    notes.push(`${opts.skipped.length} file(s) not checked because of \`maxFiles\`: ${opts.skipped.map(code).join(', ')}.`);
  }
  if (notes.length > 0) out.push('', ...notes.map((n) => `> ${n}`));

  out.push('', '<sub>Mutation testing on changed lines only, powered by StrykerJS.</sub>');
  return out.join('\n') + '\n';
}
