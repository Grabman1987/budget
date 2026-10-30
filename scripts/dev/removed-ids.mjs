// Finds identifiers that a change removed from application code while an e2e spec that was NOT
// part of the same change still mentions them. This is the failure behind most red PR runs after a
// refactor (a route, report id, data-testid or label moved and the spec kept the old value), and
// it is found here in seconds instead of in 12 e2e shards.
// Heuristic by design: it only flags tokens that vanished from all non-test source.
import { execFileSync } from 'node:child_process';

const TESTID = /(?:data-testid|testId)["']?\s*[=:]\s*\{?\s*["'`]([A-Za-z][\w-]{3,})["'`]/g;
const ROUTE = /["'`](\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+)["'`]/g;
const isApp = (p) =>
  /^(?:apps|packages)\/.+\.[cm]?[jt]sx?$/.test(p) && !/\.test\.[cm]?[jt]sx?$/.test(p);

/** Removed tokens per application file, parsed from `git diff -U0` output. Pure. */
export function removedTokens(diff) {
  const tokens = new Set();
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.slice(4).replace(/^b\//, '');
    else if (line.startsWith('-') && !line.startsWith('--- ') && file && isApp(file)) {
      for (const re of [TESTID, ROUTE]) for (const m of line.matchAll(re)) tokens.add(m[1]);
    }
  }
  return [...tokens].sort();
}

/** Pure decision: tokens gone from the app whose referencing specs were not updated. */
export function staleReferences(tokens, { stillInApp, specsMentioning, changedSpecs }) {
  const changed = new Set(changedSpecs);
  const result = [];
  for (const token of tokens) {
    if (stillInApp(token)) continue;
    const specs = specsMentioning(token).filter((s) => !changed.has(s));
    if (specs.length) result.push({ token, specs });
  }
  return result;
}

function gitGrep(args) {
  try {
    return execFileSync('git', ['grep', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return ''; // exit 1 = no match
  }
}

export function checkRemovedIds(base, changedFiles) {
  let mergeBase;
  try {
    mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    mergeBase = base; // shallow clone: compare with the tip
  }
  const diff = execFileSync('git', ['diff', '-U0', '--no-renames', mergeBase, 'HEAD', '--'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const tokens = removedTokens(diff);
  return staleReferences(tokens, {
    stillInApp: (t) =>
      gitGrep(['-l', '-F', '--', t, 'apps', 'packages', ':!*.test.ts', ':!*.test.tsx']).trim() !==
      '',
    specsMentioning: (t) => gitGrep(['-l', '-F', '--', t, 'e2e']).split('\n').filter(Boolean),
    changedSpecs: changedFiles.filter((f) => f.startsWith('e2e/')),
  });
}
