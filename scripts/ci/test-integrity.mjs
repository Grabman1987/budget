// Test-integrity gate: a PR may add tests but must not weaken existing ones.
// Usage: node scripts/ci/test-integrity.mjs [baseRef=origin/main]   (see docs/queue/test-integrity.md)
// Env: HEAD_REF (PR head branch), ALLOW_TEST_CHANGES=1 (report violations as warnings, exit 0).
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TEST_FILE =
  /\.test\.(ts|tsx|mjs)$|^e2e\/.*\.ts$|^(playwright|vitest)\.config\.ts$|^vitest\.setup\.ts$/;
const BASELINE = /^e2e\/.*-snapshots\//;
const BASELINE_BRANCH = 'bot/visual-baselines';
const ASSERTION =
  /\bexpect\s*\(|\bassert\b|\.(toBe\w*|toEqual|toStrictEqual|toMatch\w*|toHave\w*|toThrow\w*|toContain\w*|toBeCloseTo)\b/;
const DECLARATION = /\b(test|it|describe|test\.describe)\s*\(/;
const DISABLED = /\.(skip|only|fixme|todo)\b|\btest\.fail\b|\bxit\b|\bxdescribe\b|\{\s*skip\b/;
const TOLERANCE = /maxDiffPixelRatio|maxDiffPixels|threshold|toBeCloseTo\(|retries|timeout/;
const COVERAGE_CONFIG = /coverage|thresholds?|perFile|autoUpdate/i;

// Parses `git diff -U0 --no-renames` output into [{ path, status, removed, added }].
export function parseDiff(diff) {
  const files = [];
  let file, inHunk, o, n;
  for (const text of diff.split('\n')) {
    const head = /^diff --git a\/(.+) b\/(.+)$/.exec(text);
    if (head) {
      file = { path: head[2], status: 'modified', removed: [], added: [] };
      files.push(file);
      inHunk = false;
    } else if (!file) continue;
    else if (!inHunk && text.startsWith('new file mode')) file.status = 'added';
    else if (!inHunk && text.startsWith('deleted file mode')) file.status = 'deleted';
    else if (text.startsWith('@@')) {
      [, o, n] = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(text).map(Number);
      inHunk = true;
    } else if (inHunk && text.startsWith('-'))
      file.removed.push({ line: o++, text: text.slice(1) });
    else if (inHunk && text.startsWith('+')) file.added.push({ line: n++, text: text.slice(1) });
  }
  return files;
}

// Drops identical removed+added pairs: a pure move inside one file is not a change.
function withoutMoves({ removed, added }) {
  const pool = new Map();
  for (const a of added) pool.set(a.text.trim(), (pool.get(a.text.trim()) ?? 0) + 1);
  const stillRemoved = removed.filter((r) => {
    const count = pool.get(r.text.trim()) ?? 0;
    if (count) pool.set(r.text.trim(), count - 1);
    return !count;
  });
  const left = new Map(pool);
  const stillAdded = added.filter((a) => {
    const count = left.get(a.text.trim()) ?? 0;
    if (count) left.set(a.text.trim(), count - 1);
    return count;
  });
  return { removed: stillRemoved, added: stillAdded };
}

export function check(files, { headRef = '' } = {}) {
  const found = [];
  const flag = (file, line, reason) => found.push({ file, line, reason });
  for (const f of files.filter((x) => TEST_FILE.test(x.path) || BASELINE.test(x.path))) {
    if (BASELINE.test(f.path)) {
      if (f.status !== 'added' && headRef !== BASELINE_BRANCH)
        flag(f.path, 1, `screenshot baseline ${f.status} (only ${BASELINE_BRANCH} may do this)`);
      continue;
    }
    if (f.status === 'deleted') {
      flag(f.path, 1, 'test file deleted');
      continue;
    }
    const { removed, added } = withoutMoves(f);
    for (const r of removed) {
      if (/vitest\.config\.ts$/.test(f.path) && COVERAGE_CONFIG.test(r.text))
        flag(f.path, r.line, 'coverage config changed');
      else if (TOLERANCE.test(r.text))
        flag(f.path, r.line, 'tolerance/timeout/retry line changed or removed');
      else if (DECLARATION.test(r.text))
        flag(f.path, r.line, 'test declaration removed or changed');
      else if (ASSERTION.test(r.text)) flag(f.path, r.line, 'assertion removed or changed');
    }
    for (const a of added) {
      if (/vitest\.config\.ts$/.test(f.path) && COVERAGE_CONFIG.test(a.text))
        flag(f.path, a.line, 'coverage config changed');
      else if (DISABLED.test(a.text))
        flag(f.path, a.line, 'test disabled (skip/only/fixme/todo/fail)');
    }
  }
  return found;
}

function main() {
  const base = process.argv[2] ?? 'origin/main';
  const diff = execFileSync(
    'git',
    ['diff', '--merge-base', base, 'HEAD', '-U0', '--no-renames', '--no-color'],
    {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    },
  );
  const violations = check(parseDiff(diff), { headRef: process.env.HEAD_REF ?? '' });
  const allowed = process.env.ALLOW_TEST_CHANGES === '1';
  for (const v of violations)
    console.log(`${allowed ? 'warning' : 'error'}: ${v.file}:${v.line} ${v.reason}`);
  if (violations.length && allowed)
    console.log(
      'ALLOW_TEST_CHANGES=1: violations reported as warnings (label tests-change-approved).',
    );
  else if (violations.length)
    console.log(
      'Test-integrity gate failed. Owner can approve with the label tests-change-approved.',
    );
  else console.log(`Test-integrity gate: no weakened tests against ${base}.`);
  process.exit(violations.length && !allowed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
