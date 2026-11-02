// Local pre-push gate: catches the cheap CI failures (typecheck, lint, formatting, unit tests of
// the touched code, removed identifiers still used by e2e specs) before a push starts a 20-job CI
// run. It never replaces CI and never touches a required check.
//
// Scope and limits (so nobody over-trusts it):
//   - It checks the checked-out HEAD against the base (default origin/main), not the refs that
//     `git push` was asked to send, and it runs against the working tree.
//   - Unit tests run with BUDGET_REQUIRE_AGE=0 (CI sets 1), so the encrypted-backup test may skip
//     locally; CI still runs it.
//   - Removed-identifier coverage is documented in removed-ids.mjs (test ids and route strings only).
//
// Usage:
//   node scripts/dev/pre-push-check.mjs            run against origin/main...HEAD
//   node scripts/dev/pre-push-check.mjs --base REF compare with another base
//   node scripts/dev/pre-push-check.mjs --list     print the plan only
// Install as a git hook once per clone:  git config core.hooksPath .githooks
// Skip everything in an emergency:       BUDGET_SKIP_PREPUSH=1 git push
// Allow a legitimate leftover reference: BUDGET_PREPUSH_ALLOW_REMOVED=token1,token2 git push
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkRemovedIds } from './removed-ids.mjs';

const CODE = /\.(?:[cm]?[jt]sx?)$/;
const FORMAT = /\.(?:[cm]?[jt]sx?|json|css|md|ya?ml)$/;
const CSS = /\.css$/;
const TESTABLE = /^(?:apps|packages|scripts)\/.*\.(?:[cm]?[jt]sx?|css)$/;
// On Windows the tools run through cmd.exe, which re-parses the argument string.
const WINDOWS_UNSAFE = /[&|<>^%"!()`\r\n]/;

/** Pure planning step, unit-tested without running any tool. */
export function planChecks(paths, { windows = false } = {}) {
  const files = paths.filter(
    (p) =>
      typeof p === 'string' &&
      p &&
      !p.startsWith('node_modules/') &&
      !(windows && WINDOWS_UNSAFE.test(p)),
  );
  const code = files.filter((p) => CODE.test(p));
  const format = files.filter((p) => FORMAT.test(p));
  const related = files.filter((p) => TESTABLE.test(p));
  const steps = [];
  if (code.length) steps.push({ name: 'typecheck', cmd: ['npm', 'run', 'typecheck'] });
  if (files.some((p) => CSS.test(p)))
    steps.push({ name: 'css scale', cmd: ['node', 'packages/ui/scripts/check-css-scale.mjs'] });
  if (code.length)
    steps.push({
      name: 'eslint (changed files)',
      cmd: ['npx', 'eslint', '--no-warn-ignored', '--', ...code],
    });
  if (format.length)
    steps.push({
      name: 'prettier (changed files)',
      cmd: ['npx', 'prettier', '--check', '--ignore-unknown', '--', ...format],
    });
  if (related.length)
    steps.push({
      name: 'unit tests related to the change',
      cmd: ['npx', 'vitest', 'related', '--run', '--passWithNoTests', ...related],
      env: { BUDGET_REQUIRE_AGE: '0' },
    });
  return steps;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Common ancestor with the base; a shallow clone has none, so callers fall back to the base tip. */
export function resolveMergeBase(base) {
  try {
    return git(['merge-base', base, 'HEAD']).trim();
  } catch {
    return null;
  }
}

export function changedFiles(base, mergeBase = resolveMergeBase(base) ?? base) {
  return git([
    'diff',
    '--name-only',
    '--no-renames',
    '--diff-filter=d',
    '-z',
    mergeBase,
    'HEAD',
    '--',
  ])
    .split('\0')
    .filter(Boolean);
}

function main() {
  const argv = process.argv.slice(2);
  if (process.env.BUDGET_SKIP_PREPUSH === '1') {
    console.log('pre-push: skipped (BUDGET_SKIP_PREPUSH=1).');
    return 0;
  }
  if (!existsSync('node_modules')) {
    console.warn('pre-push: node_modules missing, skipping (run "npm ci" to enable the gate).');
    return 0;
  }
  const baseIndex = argv.indexOf('--base');
  const base = baseIndex >= 0 ? argv[baseIndex + 1] : 'origin/main';
  try {
    git(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]);
  } catch {
    console.warn(`pre-push: base ${base} not found; run "git fetch origin main". Skipping.`);
    return 0;
  }
  const mergeBase = resolveMergeBase(base);
  if (!mergeBase) {
    console.warn(
      `pre-push: no common ancestor with ${base} (shallow clone?); comparing with its tip, so files changed on ${base} may be listed too.`,
    );
  }
  const windows = process.platform === 'win32';
  let files;
  try {
    files = changedFiles(base, mergeBase ?? base);
  } catch (error) {
    console.warn(
      `pre-push: cannot list changed files (${error.message.split('\n')[0]}). Skipping.`,
    );
    return 0;
  }
  const steps = planChecks(files, { windows });
  if (argv.includes('--list')) {
    for (const s of steps) console.log(`${s.name}: ${s.cmd.join(' ')}`);
    return 0;
  }
  const failed = [];
  try {
    const stale = checkRemovedIds(base, files, mergeBase ?? base);
    for (const { token, specs } of stale) {
      console.error(
        `pre-push: "${token}" was removed from the app but is still used by ${specs.join(', ')}`,
      );
    }
    if (stale.length)
      failed.push('removed identifiers still referenced by e2e specs (migrate them in this PR)');
  } catch (error) {
    console.warn(`pre-push: removed-identifier check skipped (${error.message.split('\n')[0]}).`);
  }
  if (!steps.length && !failed.length) {
    console.log('pre-push: nothing to check (no code, format-relevant or test-relevant files).');
    return 0;
  }
  for (const step of steps) {
    console.log(`\n> ${step.name}`);
    const result = spawnSync(step.cmd[0], step.cmd.slice(1), {
      stdio: 'inherit',
      shell: windows,
      env: { ...process.env, ...step.env },
    });
    if (result.status !== 0) failed.push(step.name);
  }
  if (failed.length) {
    console.error(
      `\npre-push: FAILED -> ${failed.join(', ')}. Fix these before pushing; CI would fail on them too.`,
    );
    return 1;
  }
  console.log('\npre-push: all local checks passed (CI still decides).');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
