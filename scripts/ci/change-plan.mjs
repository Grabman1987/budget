// Deliberately small allowlist. Unknown paths, changed tests/config and missing Git evidence
// require the full suite. Both sides of renames are examined with --no-renames.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Full E2E shards as "<group>-<index>-<total>". WebKit (webkit-iphone, workers: 1, about 46 % of all
// test executions) gets its own shards: with a single 12-way split Playwright placed the whole serial
// WebKit share into the last three shards (21-28 min vs 9-11 min for the rest, PR runs 2026-10-30).
// Coverage is unchanged: the union of both groups is exactly the previous full project set.
export const E2E_GROUPS = { chromium: 8, webkit: 6 };
const FULL_SHARDS = Object.entries(E2E_GROUPS).flatMap(([group, total]) =>
  Array.from({ length: total }, (_, i) => `${group}-${i + 1}-${total}`),
);
const FUNDING_SPECS = ['e2e/funding-plan.spec.ts', 'e2e/savings-plans.spec.ts'];
const UI_SCOPES = new Map([
  ['apps/web/src/wealth/funding-plan.tsx', FUNDING_SPECS],
  ['apps/web/src/wealth/funding-plan.css', FUNDING_SPECS],
  [
    'apps/web/src/wealth/price-history.tsx',
    ['e2e/report-polish.spec.ts', 'e2e/portfolio-instruments.spec.ts'],
  ],
  [
    'apps/web/src/wealth/price-history.css',
    ['e2e/report-polish.spec.ts', 'e2e/portfolio-instruments.spec.ts'],
  ],
]);
const isDoc = (path) =>
  path === 'README.md' || (/^docs\/.+\.md$/.test(path) && !/^docs\/(queue\/|ops\.md$)/.test(path));

export function fullPlan(reason) {
  return { lane: 'full', shards: FULL_SHARDS, specs: [], reason };
}

export function planChanges(paths, event = 'pull_request', highRisk = false) {
  if (highRisk) return fullPlan('High-risk review classification requires full coverage.');
  if (event !== 'pull_request') return fullPlan('Only pull requests may use a focused lane.');
  if (!Array.isArray(paths) || paths.length === 0) return fullPlan('No changed-file evidence.');
  const specs = new Set();
  for (const path of paths) {
    if (
      typeof path !== 'string' ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').some((part) => !part || part === '.' || part === '..') ||
      /[\r\n\0]/.test(path)
    )
      return fullPlan('Invalid path evidence.');
    if (isDoc(path)) continue;
    const affected = UI_SCOPES.get(path);
    if (!affected) return fullPlan(`Full coverage required by ${path}.`);
    affected.forEach((spec) => specs.add(spec));
  }
  return specs.size
    ? {
        lane: 'ui',
        shards: [1],
        specs: [...specs].sort(),
        reason: 'Explicitly mapped isolated UI changes.',
      }
    : {
        lane: 'docs',
        shards: [1],
        specs: [],
        reason: 'Documentation only; no executable changes.',
      };
}

export function changedPaths(base, head, cwd = process.cwd()) {
  // Resolve refs before using them in revision expressions, including local CLI arguments.
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const resolve = (ref) =>
    git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  const ancestor = git(['merge-base', resolve(base), resolve(head)]).trim();
  return git(['diff', '--name-only', '--no-renames', '-z', ancestor, resolve(head), '--'])
    .split('\0')
    .filter(Boolean);
}

// Exact status vectors: an unexpected skip/cancellation/failure can never turn an aggregate green.
export function verificationPassed(needs, windows = false) {
  const reused = needs.reuse?.result === 'success' && needs.reuse?.outputs?.reuse === 'true';
  const lane = needs.plan?.outputs?.lane;
  if (!reused && (needs.plan?.result !== 'success' || !['docs', 'ui', 'full'].includes(lane)))
    return false;
  const expected = windows
    ? { 'windows-unit': reused || lane !== 'full' ? 'skipped' : 'success' }
    : {
        static: reused ? 'skipped' : 'success',
        unit: reused || lane === 'docs' ? 'skipped' : 'success',
        e2e: reused || lane === 'docs' ? 'skipped' : 'success',
        visual: reused || lane !== 'full' ? 'skipped' : 'success',
      };
  return Object.entries(expected).every(([job, result]) => needs[job]?.result === result);
}

function main() {
  if (process.argv[2] === '--gate') {
    const passed = verificationPassed(
      JSON.parse(process.env.NEEDS_JSON),
      process.argv[3] === 'windows',
    );
    console.log(`Required verification passed: ${passed}`);
    process.exitCode = passed ? 0 : 1;
    return;
  }
  const event = process.env.GITHUB_EVENT_NAME || 'pull_request';
  let plan;
  try {
    plan =
      event === 'pull_request'
        ? planChanges(
            changedPaths(
              process.env.BASE_SHA || process.argv[2] || 'origin/main',
              process.env.HEAD_SHA || process.argv[3] || 'HEAD',
            ),
            event,
            process.env.HIGH_RISK === 'true',
          )
        : fullPlan('Push, scheduled audit or manual full verification.');
  } catch {
    plan = fullPlan('Git comparison unavailable; using the full suite.');
  }
  console.log(JSON.stringify(plan, null, 2));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `lane=${plan.lane}\nshards=${JSON.stringify(plan.shards)}\nspecs=${plan.specs.join(' ')}\n`,
    );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Verification plan\n\nLane: **${plan.lane}**\n\n${plan.reason}\n\n${plan.specs.join('\n')}\n`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
