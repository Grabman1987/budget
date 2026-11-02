// Finds identifiers that a change removed from application code while an e2e spec that was NOT
// part of the same change still mentions them. This is the failure behind most red PR runs after a
// refactor (a route, report id, data-testid or label moved and the spec kept the old value), and
// it is found here in seconds instead of in 12 e2e shards.
// Heuristic by design. Coverage is deliberately narrow and stated here so nobody over-trusts it:
//   - literal data-testid / testId values (>= 4 chars) and quoted multi-segment route strings,
//   - tokens that no longer appear, as a whole quoted string, anywhere in non-test app source.
// It does NOT see visible text, report ids used as bare words, CSS selectors or computed values.
// Escape hatch for a legitimate leftover (redirect or 404 spec): BUDGET_PREPUSH_ALLOW_REMOVED=a,b
import { execFileSync } from 'node:child_process';

const TESTID = /(?:data-testid|testId)["']?\s*[=:]\s*\{?\s*["'`]([A-Za-z][\w-]{3,})["'`]/g;
const ROUTE = /["'`](\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+)["'`]/g;
const isApp = (p) =>
  /^(?:apps|packages)\/.+\.[cm]?[jt]sx?$/.test(p) && !/\.test\.[cm]?[jt]sx?$/.test(p);

/** Removed tokens per application file, parsed from `git diff -U0` output. Pure. */
export function removedTokens(diff) {
  const tokens = new Set();
  let file = null;
  for (const raw of diff.split('\n')) {
    const line = raw.replace(/\t.*$/, '');
    // A deleted file has `+++ /dev/null`; keep the path from the `--- a/` line then.
    if (line.startsWith('--- '))
      file = line
        .slice(4)
        .replace(/^"?a\//, '')
        .replace(/"$/, '');
    else if (line.startsWith('+++ ')) {
      const next = line
        .slice(4)
        .replace(/^"?b\//, '')
        .replace(/"$/, '');
      if (next !== '/dev/null') file = next;
    } else if (line.startsWith('-') && file && isApp(file)) {
      for (const re of [TESTID, ROUTE]) for (const m of line.matchAll(re)) tokens.add(m[1]);
    }
  }
  return [...tokens].sort();
}

/** Pure decision: tokens gone from the app whose referencing specs were not updated. */
export function staleReferences(
  tokens,
  { stillInApp, specsMentioning, changedSpecs, allowed = [] },
) {
  const changed = new Set(changedSpecs);
  const allow = new Set(allowed);
  const result = [];
  for (const token of tokens) {
    if (allow.has(token) || stillInApp(token)) continue;
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

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function checkRemovedIds(base, changedFiles, mergeBase = base) {
  const diff = execFileSync('git', ['diff', '-U0', '--no-renames', mergeBase, 'HEAD', '--'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const tokens = removedTokens(diff);
  return staleReferences(tokens, {
    // Whole quoted string only, so `/reports/a` is not "still there" because `/reports/a-b` is.
    stillInApp: (t) =>
      gitGrep([
        '-l',
        '-E',
        `["'\`]${escapeRe(t)}["'\`]`,
        '--',
        'apps',
        'packages',
        ':!*.test.ts',
        ':!*.test.tsx',
      ]).trim() !== '',
    specsMentioning: (t) => gitGrep(['-l', '-F', '--', t, 'e2e']).split('\n').filter(Boolean),
    changedSpecs: changedFiles.filter((f) => f.startsWith('e2e/')),
    allowed: (process.env.BUDGET_PREPUSH_ALLOW_REMOVED ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  });
}
