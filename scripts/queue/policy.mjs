// Decision logic of the autonomous queue (docs/queue/README.md): pure functions plus a thin CLI that
// the bash scripts call as `node scripts/queue/policy.mjs <subcommand>` (input on stdin). Node built-ins
// only. Everything fails closed: unknown, pending or malformed input never produces `ok: true`.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const short = (s) => String(s ?? '').slice(0, 7) || '?';
const oneLine = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

// ---------- merge gate ----------

/** One workflow run for the main head must be completed+success, and that head must be live. */
function runVerdict(name, run, mainHead) {
  if (!run) return `${name} run for ${short(mainHead)} missing`;
  if (run.headSha !== mainHead)
    return `${name} run is for ${short(run.headSha)}, not ${short(mainHead)}`;
  if (run.status !== 'completed') return `${name} ${run.status || 'status unknown'}`;
  if (run.conclusion !== 'success') return `${name} ${run.conclusion || 'conclusion unknown'}`;
  return null;
}

/**
 * @param {{mainHead: string, ciRun: object|null, deployRun: object|null,
 *   health: {status?: string, revision?: string, ancestor?: boolean, error?: string}|null}} input
 *   health.ancestor = "mainHead is an ancestor of health.revision" (computed by the caller with git).
 * @returns {{ok: boolean, reason: string}}
 */
export function mergeGate({ mainHead, ciRun, deployRun, health }) {
  const block = (reason) => ({ ok: false, reason: oneLine(reason) });
  if (!SHA.test(mainHead ?? '')) return block('origin/main head unknown');
  const ci = runVerdict('ci.yml', ciRun, mainHead);
  if (ci) return block(ci);
  const deploy = runVerdict('deploy.yml', deployRun, mainHead);
  if (deploy) return block(deploy);
  if (!health || health.error)
    return block(`health unreachable${health?.error ? `: ${health.error}` : ''}`);
  if (health.status !== 'ok') return block(`health status ${health.status || 'unknown'}`);
  if (!SHA.test(health.revision ?? '')) return block('health revision unknown');
  if (health.revision !== mainHead && health.ancestor !== true) {
    return block(
      `live revision ${short(health.revision)} does not contain main ${short(mainHead)}`,
    );
  }
  return { ok: true, reason: 'ok' };
}

// ---------- required checks bound to one head SHA ----------

/** runs: check-run objects ({id, name, status, conclusion, head_sha}); the latest run per name counts. */
export function checkRuns({ sha, required, optional = [], runs }) {
  const latest = (name) =>
    runs
      .filter((r) => r.name === name && r.head_sha === sha)
      .reduce((a, r) => (!a || r.id > a.id ? r : a), null);
  const green = (r) => r.status === 'completed' && r.conclusion === 'success';
  const bad = [
    ...required.filter((n) => {
      const r = latest(n);
      return !r || !green(r);
    }),
    ...optional.filter((n) => {
      const r = latest(n);
      return r && !green(r);
    }),
  ];
  return { ok: bad.length === 0, bad };
}

// ---------- file scope ----------

/** Globs of the first ```queue-scope fenced block in an issue body, or null (none / empty). */
export function parseScope(body) {
  const m = /^```queue-scope[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/m.exec(String(body ?? ''));
  if (!m) return null;
  const globs = m[1]
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^\.\//, ''))
    .filter((l) => l && !l.startsWith('/') && !l.includes('\\') && !l.split('/').includes('..'));
  return globs.length ? globs : null;
}

const globCache = new Map();
function globToRegExp(glob) {
  let re = globCache.get(glob);
  if (re) return re;
  const g = glob.endsWith('/') ? `${glob}**` : glob;
  let out = '';
  for (let i = 0; i < g.length; i++) {
    if (g.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 2;
    } else if (g.startsWith('**', i)) {
      out += '.*';
      i += 1;
    } else if (g[i] === '*') out += '[^/]*';
    else if (g[i] === '?') out += '[^/]';
    else out += g[i].replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  re = new RegExp(`^${out}$`);
  globCache.set(glob, re);
  return re;
}

// Never changed by an unattended merge, whatever the issue scope says: CI, the queue itself, agent
// instructions, deploy and migration files, test-runner config and visual baselines. An issue that needs
// one of these goes through the orchestrator.
const PROTECTED = [
  '.github/**',
  'scripts/queue/**',
  'scripts/ci/**',
  '.claude/**',
  '.agents/**',
  'AGENTS.md',
  'CLAUDE.md',
  'fly.toml',
  'Dockerfile',
  'docker-entrypoint.sh',
  'litestream.yml',
  'packages/db/drizzle/**',
  'playwright.config.ts',
  'vitest.config.ts',
  'vitest.setup.ts',
  'eslint.config.js',
  'package.json',
  'package-lock.json',
  'e2e/**/*-snapshots/**',
];

function inScope(path, globs) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..'))
    return false;
  if (PROTECTED.some((g) => globToRegExp(g).test(path))) return false;
  return globs.some((g) => globToRegExp(g).test(path));
}

/** `git status --porcelain=v1 -z --untracked-files=all` -> [{status, paths}]; renames carry new and old path. */
export function parsePorcelain(text) {
  const parts = String(text).split('\0');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    const status = e.slice(0, 2);
    const paths = [e.slice(3)];
    if (/[RC]/.test(status)) paths.push(parts[++i] ?? '');
    out.push({ status, paths });
  }
  return out;
}

/** `git diff --name-status -M -z` -> [{status, paths}]; renames/copies carry old and new path. */
export function parseNameStatus(text) {
  const parts = String(text).split('\0');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i];
    if (!status) continue;
    const n = /^[RC]/.test(status) ? 2 : 1;
    out.push({ status, paths: parts.slice(i + 1, i + 1 + n) });
    i += n;
  }
  return out;
}

/** Every path of every change (deletions and both sides of renames included) must match a glob. */
export function checkScope(changes, globs) {
  const paths = [...new Set(changes.flatMap((c) => c.paths))];
  if (!globs?.length) {
    return {
      ok: false,
      outside: paths,
      reason: 'the issue has no queue-scope block (or it is empty)',
    };
  }
  const outside = paths.filter((p) => !inScope(p, globs));
  return outside.length
    ? {
        ok: false,
        outside,
        reason: 'files outside the issue queue-scope or on the protected list:',
      }
    : { ok: true, outside: [] };
}

// ---------- loop pacing ----------

/** Seconds until the next loop round: `base` while busy, `idleDelay` after `idleAfter` idle rounds,
 *  doubling per consecutive error round up to `max`. Never shorter than `base`. */
export function loopDelay({ base, idle, errors, idleAfter = 5, idleDelay = 300, max = 600 }) {
  if (errors > 0) return Math.min(max, base * 2 ** Math.min(errors, 20));
  return idle >= idleAfter ? Math.max(base, idleDelay) : base;
}

// ---------- CLI ----------

const stdin = () => readFileSync(0, 'utf8');
const readScopeFile = (file) => {
  try {
    const globs = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    return globs.length ? globs : null;
  } catch {
    return null;
  }
};
const parserFor = (kind) => ({ porcelain: parsePorcelain, 'name-status': parseNameStatus })[kind];

function main([cmd, ...args]) {
  if (cmd === 'gate') {
    let r, input;
    try {
      input = JSON.parse(stdin());
      r = mergeGate(input);
    } catch {
      r = { ok: false, reason: 'gate input unreadable' };
    }
    console.log(r.ok ? `ok ${input.mainHead}` : `BLOCK: ${r.reason}`);
    return r.ok ? 0 : 1;
  }
  if (cmd === 'parse-scope') {
    const globs = parseScope(stdin());
    if (globs) console.log(globs.join('\n'));
    return globs ? 0 : 1;
  }
  if (cmd === 'check-scope' || cmd === 'paths0') {
    const parse = parserFor(args[0]);
    if (!parse) return (console.error(`unknown kind: ${args[0]}`), 2);
    const changes = parse(stdin());
    if (cmd === 'paths0') {
      process.stdout.write(
        [...new Set(changes.flatMap((c) => c.paths))].map((p) => `${p}\0`).join(''),
      );
      return 0;
    }
    const r = checkScope(changes, readScopeFile(args[1]));
    if (!r.ok)
      console.log(
        [r.reason, ...r.outside.map((p) => `- \`${p.replaceAll('`', "'")}\``)].join('\n'),
      );
    return r.ok ? 0 : 1;
  }
  if (cmd === 'checks') {
    const [sha, required, optional] = args;
    const raw = stdin().trim();
    const runs = raw.startsWith('[')
      ? JSON.parse(raw)
      : raw
          .split(/\r?\n/)
          .filter(Boolean)
          .map((l) => JSON.parse(l));
    const r = checkRuns({
      sha,
      required: required.split(/\s+/).filter(Boolean),
      optional: (optional ?? '').split(/\s+/).filter(Boolean),
      runs,
    });
    if (!r.ok) console.log(r.bad.join(' '));
    return r.ok ? 0 : 1;
  }
  if (cmd === 'delay') {
    const [base, idle, errors, idleAfter] = args.map(Number);
    console.log(loopDelay({ base, idle, errors, ...(idleAfter && { idleAfter }) }));
    return 0;
  }
  console.error(
    'usage: policy.mjs gate | delay <base> <idle> <errors> [idleAfter] | parse-scope | check-scope <porcelain|name-status> <scopefile> | paths0 <kind> | checks <sha> <required> <optional>',
  );
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`policy.mjs: ${e.message}`);
    process.exitCode = 2;
  }
}
