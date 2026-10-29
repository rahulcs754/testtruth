#!/usr/bin/env node

// src/cli.ts
import { appendFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { parseArgs } from "util";

// src/config.ts
import { existsSync, readFileSync } from "fs";
var DEFAULT_CONFIG = {
  threshold: 60,
  failOnLow: false,
  include: [],
  exclude: [],
  maxFiles: 30
};
function parseConfig(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("testtruth.json must be a JSON object");
  }
  const obj = raw;
  const config = { ...DEFAULT_CONFIG };
  if (obj.base !== void 0) config.base = expect(obj.base, "string", "base");
  if (obj.threshold !== void 0) {
    const t = expect(obj.threshold, "number", "threshold");
    if (t < 0 || t > 100) throw new Error("threshold must be between 0 and 100");
    config.threshold = t;
  }
  if (obj.failOnLow !== void 0) config.failOnLow = expect(obj.failOnLow, "boolean", "failOnLow");
  if (obj.include !== void 0) config.include = stringArray(obj.include, "include");
  if (obj.exclude !== void 0) config.exclude = stringArray(obj.exclude, "exclude");
  if (obj.maxFiles !== void 0) {
    const m = expect(obj.maxFiles, "number", "maxFiles");
    if (!Number.isInteger(m) || m < 1) throw new Error("maxFiles must be a positive integer");
    config.maxFiles = m;
  }
  return config;
}
function loadConfig(path) {
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  return parseConfig(JSON.parse(readFileSync(path, "utf8")));
}
function expect(value, type, key) {
  if (typeof value !== type) throw new Error(`${key} must be a ${type}`);
  return value;
}
function stringArray(value, key) {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value;
}

// src/diff.ts
import { execFileSync } from "child_process";
var HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
function parseDiff(diff) {
  const result = /* @__PURE__ */ new Map();
  let current;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = parsePath(line.slice(4));
      if (path) {
        current = result.get(path) ?? [];
        result.set(path, current);
      } else {
        current = void 0;
      }
      continue;
    }
    const hunk = HUNK.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === void 0 ? 1 : Number(hunk[2]);
      if (count > 0) current.push({ start, end: start + count - 1 });
    }
  }
  for (const [path, ranges] of result) {
    if (ranges.length === 0) result.delete(path);
    else result.set(path, mergeRanges(ranges));
  }
  return result;
}
function parsePath(raw) {
  let path = raw.trim();
  if (path === "/dev/null") return void 0;
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1);
    if (path.includes("\\")) return void 0;
  }
  return path.startsWith("b/") ? path.slice(2) : path;
}
function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of sorted) {
    const last = merged.at(-1);
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}
function inRanges(line, ranges) {
  return !!ranges?.some((r) => line >= r.start && line <= r.end);
}
function gitChangedLines(base, cwd = process.cwd()) {
  const out = execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", "--no-ext-diff", "--diff-filter=AMR", `${base}...HEAD`],
    { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return parseDiff(out);
}

// src/files.ts
var SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
var DEFAULT_EXCLUDE = [
  "**/*.d.ts",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/*.stories.*",
  "**/*.config.*",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "test/**",
  "tests/**",
  "e2e/**"
];
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
function matchesAny(file, globs) {
  return globs.some((g) => globToRegExp(g).test(file));
}
function selectFiles(changed, config) {
  const selected = /* @__PURE__ */ new Map();
  const skipped = [];
  const exclude = [...DEFAULT_EXCLUDE, ...config.exclude];
  for (const [file, ranges] of [...changed].sort(([a], [b]) => a.localeCompare(b))) {
    if (!SOURCE_EXT.test(file)) continue;
    if (file.includes(",")) continue;
    if (config.include.length > 0 && !matchesAny(file, config.include)) continue;
    if (matchesAny(file, exclude)) continue;
    if (selected.size >= config.maxFiles) skipped.push(file);
    else selected.set(file, ranges);
  }
  return { selected, skipped };
}

// src/github.ts
import { readFileSync as readFileSync2 } from "fs";

// src/markdown.ts
var MARKER = "<!-- testtruth-report -->";
var MAX_MISSED = 25;
function code(text) {
  return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
}
function cell(text) {
  return text.replace(/\|/g, "\\|");
}
function pct(score) {
  return score === null ? "n/a" : `${score}%`;
}
function missedLine(m) {
  const where = code(`${m.file}:${m.line}`);
  const change = m.original !== void 0 && m.replacement !== void 0 ? `${code(m.original || " ")} \u2192 ${code(m.replacement || " ")}` : m.replacement !== void 0 ? `\u2192 ${code(m.replacement || " ")}` : "";
  const why = m.status === "NoCoverage" ? "no test runs this line" : "tests ran, none failed";
  return `- ${where} ${m.mutator}: ${change} _(${why})_`.replace(/ {2,}/g, " ");
}
function renderMarkdown(summary, opts) {
  const out = [MARKER];
  const total = summary.caught + summary.missed;
  if (summary.score === null) {
    out.push("### \u{1F9EA} TestTruth: nothing to check");
    out.push("", "No mutants were created on the changed lines (no logic changed, or only tests/config changed).");
  } else {
    const icon = summary.score >= opts.threshold ? "\u2705" : "\u26A0\uFE0F";
    out.push(`### ${icon} TestTruth: ${summary.score}% of changed code is truly tested`);
    out.push(
      "",
      `${summary.caught} of ${total} small bugs we added to your changed lines made a test fail.` + (summary.missed > 0 ? ` **${summary.missed} could ship with no failing test.**` : " Your tests caught every one."),
      `Threshold: ${opts.threshold}%.`
    );
    out.push("", "| File | Caught | Missed | Score |", "|---|---:|---:|---:|");
    for (const f of summary.files) {
      out.push(`| ${cell(f.file)} | ${f.caught} | ${f.missed} | ${pct(f.score)} |`);
    }
    if (summary.missedMutants.length > 0) {
      out.push("", "**Missed** (add or tighten a test so each of these fails):");
      for (const m of summary.missedMutants.slice(0, MAX_MISSED)) out.push(missedLine(m));
      const rest = summary.missedMutants.length - MAX_MISSED;
      if (rest > 0) out.push(`- \u2026and ${rest} more. See the full Stryker log in the job.`);
    }
  }
  const notes = [];
  if (summary.invalid > 0) notes.push(`${summary.invalid} mutant(s) did not compile and were not counted.`);
  if (opts.skipped && opts.skipped.length > 0) {
    notes.push(`${opts.skipped.length} file(s) not checked because of \`maxFiles\`: ${opts.skipped.map(code).join(", ")}.`);
  }
  if (notes.length > 0) out.push("", ...notes.map((n) => `> ${n}`));
  out.push("", "<sub>Mutation testing on changed lines only, powered by StrykerJS.</sub>");
  return out.join("\n") + "\n";
}

// src/github.ts
function prContext(env = process.env) {
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
  if (!owner || !repo || !env.GITHUB_EVENT_PATH) return void 0;
  const event = JSON.parse(readFileSync2(env.GITHUB_EVENT_PATH, "utf8"));
  const number = event.pull_request?.number;
  if (typeof number !== "number") return void 0;
  return { owner, repo, number, apiUrl: env.GITHUB_API_URL ?? "https://api.github.com" };
}
async function gh(token, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json"
    }
  });
  if (!res.ok) throw new Error(`GitHub API ${init.method ?? "GET"} ${new URL(url).pathname} failed: ${res.status}`);
  return res;
}
async function upsertComment(token, pr, body) {
  const base = `${pr.apiUrl}/repos/${pr.owner}/${pr.repo}`;
  for (let page = 1; page <= 10; page++) {
    const res = await gh(token, `${base}/issues/${pr.number}/comments?per_page=100&page=${page}`);
    const comments = await res.json();
    const ours = comments.find((c) => c.body?.includes(MARKER));
    if (ours) {
      await gh(token, `${base}/issues/comments/${ours.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
      return "updated";
    }
    if (comments.length < 100) break;
  }
  await gh(token, `${base}/issues/${pr.number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  return "created";
}

// src/stryker.ts
import { spawnSync } from "child_process";
import { existsSync as existsSync2, readFileSync as readFileSync3, rmSync } from "fs";
import { join } from "path";
var REPORT_PATH = "reports/mutation/mutation.json";
function buildMutateArg(files) {
  const parts = [];
  for (const [file, ranges] of files) {
    for (const r of ranges) parts.push(`${file}:${r.start}-${r.end}`);
  }
  return parts.join(",");
}
function strykerArgs(files) {
  return ["run", "--mutate", buildMutateArg(files), "--reporters", "json,clear-text"];
}
function findStryker(cwd) {
  const bin = join(cwd, "node_modules", ".bin", process.platform === "win32" ? "stryker.cmd" : "stryker");
  return existsSync2(bin) ? bin : void 0;
}
function runStryker(files, cwd = process.cwd()) {
  const bin = findStryker(cwd);
  if (!bin) {
    throw new Error(
      "StrykerJS is not installed in this repo. Run: npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner (or jest-runner)"
    );
  }
  const reportFile = join(cwd, REPORT_PATH);
  rmSync(reportFile, { force: true });
  const result = spawnSync(bin, strykerArgs(files), {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
    shell: process.platform === "win32"
  });
  if (result.error) throw result.error;
  if (!existsSync2(reportFile)) {
    throw new Error(`Stryker did not write ${REPORT_PATH} (exit code ${result.status}). See the log above.`);
  }
  return readReport(reportFile);
}
function readReport(path) {
  const report = JSON.parse(readFileSync3(path, "utf8"));
  if (!report || typeof report.files !== "object") throw new Error(`${path} is not a Stryker mutation report`);
  return report;
}

// src/score.ts
import { isAbsolute, relative } from "path";
var MAX_SNIPPET = 60;
function toRepoPath(file, cwd) {
  const rel = isAbsolute(file) ? relative(cwd, file) : file;
  return rel.replace(/\\/g, "/").replace(/^\.\//, "");
}
function percent(caught, missed) {
  const total = caught + missed;
  return total === 0 ? null : Math.round(caught / total * 1e3) / 10;
}
function shorten(text) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_SNIPPET ? `${oneLine.slice(0, MAX_SNIPPET - 1)}\u2026` : oneLine;
}
function originalText(source, loc) {
  if (!source) return void 0;
  const lines = source.split("\n");
  const { start, end } = loc;
  if (start.line === end.line) return lines[start.line - 1]?.slice(start.column - 1, end.column - 1);
  const parts = [lines[start.line - 1]?.slice(start.column - 1) ?? ""];
  for (let l = start.line + 1; l < end.line; l++) parts.push(lines[l - 1] ?? "");
  parts.push(lines[end.line - 1]?.slice(0, end.column - 1) ?? "");
  return parts.join("\n");
}
function summarize(report, changed, cwd = process.cwd()) {
  const files = [];
  const missedMutants = [];
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
        case "Killed":
        case "Timeout":
          fileCaught++;
          break;
        case "Survived":
        case "NoCoverage": {
          fileMissed++;
          const original = originalText(result.source, m.location);
          missedMutants.push({
            file,
            line: m.location.start.line,
            mutator: m.mutatorName,
            original: original === void 0 ? void 0 : shorten(original),
            replacement: m.replacement === void 0 ? void 0 : shorten(m.replacement),
            status: m.status
          });
          break;
        }
        case "CompileError":
        case "RuntimeError":
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

// src/cli.ts
var HELP = `testtruth: mutation-test only the lines your PR changed

Usage:
  testtruth run     Run Stryker on changed lines and print the report
  testtruth report  Score an existing Stryker report (skip the run)

Options:
  --base <ref>          Compare against this ref (default: origin/<PR base> or origin/main)
  --config <path>       Config file (default: testtruth.json)
  --threshold <0-100>   Minimum score (overrides config)
  --fail-on-low         Exit 1 when the score is below the threshold
  --comment             Post or update a PR comment (needs GITHUB_TOKEN, in Actions)
  --out <path>          Also write the Markdown report to this file
  --report <path>       (report) Stryker JSON report to read
  --dry-run             (run) Print what would be mutated, do not run Stryker
  -h, --help            Show this help
`;
function defaultBase(config) {
  if (config.base) return config.base;
  const prBase = process.env.GITHUB_BASE_REF;
  return prBase ? `origin/${prBase}` : "origin/main";
}
function warn(message) {
  console.error(process.env.GITHUB_ACTIONS ? `::warning title=TestTruth::${message}` : `testtruth: ${message}`);
}
async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      base: { type: "string" },
      config: { type: "string", default: "testtruth.json" },
      threshold: { type: "string" },
      "fail-on-low": { type: "boolean" },
      comment: { type: "boolean" },
      out: { type: "string" },
      report: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" }
    }
  });
  const command = positionals[0];
  if (values.help || command !== "run" && command !== "report") {
    console.log(HELP);
    return values.help ? 0 : 2;
  }
  const config = loadConfig(resolve(values.config));
  if (values.threshold !== void 0) {
    const t = Number(values.threshold);
    if (!Number.isFinite(t) || t < 0 || t > 100) throw new Error("--threshold must be 0-100");
    config.threshold = t;
  }
  if (values["fail-on-low"]) config.failOnLow = true;
  const base = values.base ?? defaultBase(config);
  const { selected, skipped } = selectFiles(gitChangedLines(base), config);
  let report;
  if (command === "report") {
    if (!values.report) throw new Error("report needs --report <path>");
    report = readReport(resolve(values.report));
  } else if (selected.size === 0) {
    report = { files: {} };
  } else if (values["dry-run"]) {
    console.log(`Would mutate (vs ${base}):
${buildMutateArg(selected).split(",").join("\n")}`);
    return 0;
  } else {
    console.error(`testtruth: mutating ${selected.size} changed file(s) vs ${base}`);
    report = runStryker(selected);
  }
  const summary = summarize(report, selected);
  const markdown = renderMarkdown(summary, { threshold: config.threshold, skipped });
  console.log(markdown);
  if (values.out) writeFileSync(values.out, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  if (values.comment) {
    const pr = prContext();
    const token = process.env.GITHUB_TOKEN;
    if (!pr) warn("--comment is set but this is not a pull_request run; skipping the comment.");
    else if (!token) warn("--comment needs GITHUB_TOKEN; skipping the comment.");
    else {
      try {
        const how = await upsertComment(token, pr, markdown);
        console.error(`testtruth: PR comment ${how}`);
      } catch (err) {
        warn(`could not post the PR comment: ${err.message}`);
      }
    }
  }
  if (config.failOnLow && summary.score !== null && summary.score < config.threshold) {
    console.error(`testtruth: score ${summary.score}% is below the threshold ${config.threshold}%`);
    return 1;
  }
  return 0;
}
main(process.argv.slice(2)).then(
  (code2) => process.exit(code2),
  (err) => {
    warn(err.message ?? String(err));
    process.exit(0);
  }
);
