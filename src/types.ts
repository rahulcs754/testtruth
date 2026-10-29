/** 1-based, inclusive line range in the new version of a file. */
export interface LineRange {
  start: number;
  end: number;
}

/** Changed lines per file path (repo-relative, forward slashes). */
export type ChangedLines = Map<string, LineRange[]>;

export interface Config {
  base?: string;
  /** Minimum score (0-100) for the check to pass. */
  threshold: number;
  /** Exit 1 when the score is below `threshold`. */
  failOnLow: boolean;
  include: string[];
  exclude: string[];
  /** Stop after this many files, so a huge PR stays fast. */
  maxFiles: number;
}

export type MutantStatus =
  | 'Killed'
  | 'Survived'
  | 'NoCoverage'
  | 'Timeout'
  | 'CompileError'
  | 'RuntimeError'
  | 'Ignored'
  | 'Pending';

export interface Position {
  line: number;
  column: number;
}

/** Subset of the mutation-testing-report-schema that we read. */
export interface MutationReport {
  files: Record<
    string,
    {
      source?: string;
      mutants: Array<{
        id: string;
        mutatorName: string;
        replacement?: string;
        status: MutantStatus;
        location: { start: Position; end: Position };
      }>;
    }
  >;
}

export interface MissedMutant {
  file: string;
  line: number;
  mutator: string;
  original?: string;
  replacement?: string;
  /** Survived: tests ran it and still passed. NoCoverage: no test ran it. */
  status: 'Survived' | 'NoCoverage';
}

export interface FileScore {
  file: string;
  caught: number;
  missed: number;
  score: number | null;
}

export interface Summary {
  caught: number;
  missed: number;
  /** Mutants that did not compile or crashed; not counted in the score. */
  invalid: number;
  /** 0-100, or null when there was nothing to score. */
  score: number | null;
  files: FileScore[];
  missedMutants: MissedMutant[];
}
