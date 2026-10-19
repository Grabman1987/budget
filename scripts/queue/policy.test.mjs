import { describe, expect, it } from 'vitest';
import {
  checkRuns,
  checkScope,
  loopDelay,
  mergeGate,
  parseNameStatus,
  parsePorcelain,
  parseScope,
} from './policy.mjs';

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const run = (over = {}) => ({ headSha: HEAD, status: 'completed', conclusion: 'success', ...over });
const live = (over = {}) => ({ status: 'ok', revision: HEAD, ancestor: true, ...over });
const gate = (over = {}) =>
  mergeGate({ mainHead: HEAD, ciRun: run(), deployRun: run(), health: live(), ...over });

describe('mergeGate', () => {
  it('passes only when head, CI, deploy and live revision are all confirmed', () => {
    expect(gate()).toEqual({ ok: true, reason: 'ok' });
  });
  it('passes when the live revision is newer and contains the head', () => {
    expect(gate({ health: live({ revision: OLD, ancestor: true }) }).ok).toBe(true);
  });
  it.each([
    ['unknown main head', { mainHead: '' }],
    ['malformed main head', { mainHead: 'main' }],
    ['failed CI', { ciRun: run({ conclusion: 'failure' }) }],
    ['cancelled CI', { ciRun: run({ conclusion: 'cancelled' }) }],
    ['pending CI', { ciRun: run({ status: 'in_progress', conclusion: null }) }],
    ['missing CI run', { ciRun: null }],
    ['CI run of an older head', { ciRun: run({ headSha: OLD }) }],
    ['missing deploy run', { deployRun: null }],
    ['failed deploy', { deployRun: run({ conclusion: 'failure' }) }],
    ['skipped deploy', { deployRun: run({ conclusion: 'skipped' }) }],
    ['pending deploy', { deployRun: run({ status: 'queued', conclusion: null }) }],
    ['deploy run of an older head', { deployRun: run({ headSha: OLD }) }],
    ['unreachable health', { health: null }],
    ['health error', { health: { error: 'curl failed' } }],
    ['health not ok', { health: live({ status: 'degraded' }) }],
    ['health without revision', { health: live({ revision: undefined }) }],
    ['revision mismatch, head not contained', { health: live({ revision: OLD, ancestor: false }) }],
    [
      'revision mismatch, ancestry unknown',
      { health: live({ revision: OLD, ancestor: undefined }) },
    ],
  ])('blocks on %s', (_name, over) => {
    const r = gate(over);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/\S/);
    expect(r.reason).not.toContain('\n');
  });
});

describe('parseScope', () => {
  const body = (block) => `Intro\n\n${block}\n\nOutro`;
  it('reads the globs of the queue-scope block', () => {
    const globs = parseScope(body('```queue-scope\nsrc/a.ts\n\napps/web/**\n```'));
    expect(globs).toEqual(['src/a.ts', 'apps/web/**']);
  });
  it('copes with CRLF and trailing spaces', () => {
    expect(parseScope('```queue-scope  \r\nsrc/a.ts \r\n```\r\n')).toEqual(['src/a.ts']);
  });
  it('returns null without a block, with an empty block or with other fences', () => {
    expect(parseScope('no block')).toBeNull();
    expect(parseScope('```queue-scope\n\n```')).toBeNull();
    expect(parseScope('```ts\nsrc/a.ts\n```')).toBeNull();
    expect(parseScope('```queue-scope\nsrc/a.ts')).toBeNull();
  });
  it('drops absolute and parent-relative patterns', () => {
    expect(parseScope('```queue-scope\n/etc/passwd\n../x\nsrc/../y\nok.ts\n```')).toEqual([
      'ok.ts',
    ]);
    expect(parseScope('```queue-scope\n../x\n```')).toBeNull();
  });
});

const scope = ['src/**', 'docs/queue/README.md', 'a/*.ts', 'x/**/y.ts'];
const porcelain = (...entries) => entries.join('\0') + '\0';
const check = (text) => checkScope(parsePorcelain(text), scope);

describe('parsePorcelain', () => {
  it('parses modified, untracked, deleted and renamed entries (NUL separated)', () => {
    const text = porcelain(
      ' M src/a.ts',
      '?? new file.ts',
      ' D gone.ts',
      'R  src/new.ts',
      'src/old.ts',
    );
    expect(parsePorcelain(text)).toEqual([
      { status: ' M', paths: ['src/a.ts'] },
      { status: '??', paths: ['new file.ts'] },
      { status: ' D', paths: ['gone.ts'] },
      { status: 'R ', paths: ['src/new.ts', 'src/old.ts'] },
    ]);
  });
  it('keeps unusual path characters unquoted', () => {
    expect(parsePorcelain(porcelain('?? src/ä "q"\tx.ts'))[0].paths).toEqual(['src/ä "q"\tx.ts']);
  });
  it('is empty for no output', () => {
    expect(parsePorcelain('')).toEqual([]);
  });
});

describe('parseNameStatus', () => {
  it('parses add, modify, delete and rename (old and new path)', () => {
    const text =
      ['A', 'src/a.ts', 'M', 'src/b.ts', 'D', 'src/c.ts', 'R087', 'src/old.ts', 'out/new.ts'].join(
        '\0',
      ) + '\0';
    expect(parseNameStatus(text)).toEqual([
      { status: 'A', paths: ['src/a.ts'] },
      { status: 'M', paths: ['src/b.ts'] },
      { status: 'D', paths: ['src/c.ts'] },
      { status: 'R087', paths: ['src/old.ts', 'out/new.ts'] },
    ]);
  });
});

describe('checkScope', () => {
  it('accepts in-scope additions, modifications and deletions', () => {
    expect(check(porcelain(' M src/a.ts', '?? src/deep/b.ts', ' D src/c.ts'))).toEqual({
      ok: true,
      outside: [],
    });
  });
  it('blocks an untracked file outside the scope', () => {
    expect(check(porcelain(' M src/a.ts', '?? secrets.txt'))).toMatchObject({
      ok: false,
      outside: ['secrets.txt'],
    });
  });
  it('blocks a deletion outside the scope', () => {
    expect(check(porcelain(' D package.json')).outside).toEqual(['package.json']);
  });
  it('blocks a rename from inside to outside and from outside to inside', () => {
    expect(check(porcelain('R  elsewhere/new.ts', 'src/old.ts')).outside).toEqual([
      'elsewhere/new.ts',
    ]);
    expect(check(porcelain('R  src/new.ts', 'elsewhere/old.ts')).outside).toEqual([
      'elsewhere/old.ts',
    ]);
    const ns = parseNameStatus(['R100', 'src/old.ts', 'out/new.ts'].join('\0') + '\0');
    expect(checkScope(ns, scope).outside).toEqual(['out/new.ts']);
  });
  it('blocks everything without a scope block', () => {
    const r = checkScope(parsePorcelain(porcelain(' M src/a.ts')), null);
    expect(r.ok).toBe(false);
    expect(r.outside).toEqual(['src/a.ts']);
    expect(r.reason).toMatch(/queue-scope/);
  });
  it('matches globs: ** crosses directories, * does not, exact files, dots are literal', () => {
    expect(check(porcelain(' M src/a/b/c.ts')).ok).toBe(true);
    expect(check(porcelain(' M a/one.ts')).ok).toBe(true);
    expect(check(porcelain(' M a/deep/one.ts')).ok).toBe(false);
    expect(check(porcelain(' M x/y.ts', ' M x/1/2/y.ts')).ok).toBe(true);
    expect(check(porcelain(' M docs/queue/README.md')).ok).toBe(true);
    expect(check(porcelain(' M docs/queue/READMEXmd')).ok).toBe(false);
    expect(check(porcelain(' M srcx/a.ts')).ok).toBe(false);
  });
  it('treats a trailing slash as a whole directory', () => {
    expect(checkScope(parsePorcelain(porcelain(' M docs/a/b.md')), ['docs/']).ok).toBe(true);
  });
  it('blocks path traversal that only looks in scope', () => {
    expect(check(porcelain(' M src/../package.json')).ok).toBe(false);
  });
});

describe('checkRuns (head-bound required checks)', () => {
  const req = ['check', 'check-windows', 'docker', 'restore-test'];
  const opt = ['test-integrity', 'coverage'];
  const ok = (name, id = 1, over = {}) => ({
    name,
    id,
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
    ...over,
  });
  const all = req.map((n) => ok(n));
  const verdict = (runs) => checkRuns({ sha: HEAD, required: req, optional: opt, runs });

  it('passes when every required check succeeded for this sha', () => {
    expect(verdict(all)).toEqual({ ok: true, bad: [] });
  });
  it('requires optional checks only when present', () => {
    expect(verdict([...all, ok('coverage')]).ok).toBe(true);
    expect(verdict([...all, ok('coverage', 9, { conclusion: 'failure' })]).bad).toEqual([
      'coverage',
    ]);
  });
  it('fails on missing, failed or pending required checks', () => {
    expect(verdict(all.slice(1)).bad).toEqual(['check']);
    expect(verdict([...all.slice(1), ok('check', 5, { conclusion: 'failure' })]).bad).toEqual([
      'check',
    ]);
    expect(
      verdict([...all.slice(1), ok('check', 5, { status: 'in_progress', conclusion: null })]).bad,
    ).toEqual(['check']);
  });
  it('ignores runs of another sha', () => {
    expect(verdict([...all.slice(1), ok('check', 5, { head_sha: OLD })]).bad).toEqual(['check']);
  });
  it('uses the latest run of a check (a re-run replaces an earlier failure)', () => {
    const rerun = [ok('check', 1, { conclusion: 'failure' }), ok('check', 7), ...all.slice(1)];
    expect(verdict(rerun).ok).toBe(true);
    const worse = [ok('check', 1), ok('check', 7, { conclusion: 'failure' }), ...all.slice(1)];
    expect(verdict(worse).ok).toBe(false);
  });
});

describe('protected paths (denylist on top of any scope)', () => {
  const everything = ['**'];
  const denied = [
    '.github/workflows/ci.yml',
    'scripts/queue/automerge.sh',
    'scripts/ci/check.mjs',
    '.claude/settings.json',
    '.agents/skills/x/SKILL.md',
    'AGENTS.md',
    'CLAUDE.md',
    'fly.toml',
    'Dockerfile',
    'docker-entrypoint.sh',
    'litestream.yml',
    'packages/db/drizzle/0001_init.sql',
    'playwright.config.ts',
    'vitest.config.ts',
    'package.json',
    'package-lock.json',
    'vitest.setup.ts',
    'eslint.config.js',
    'e2e/plan/plan.spec.ts-snapshots/a.png',
    'e2e/x-snapshots/b/c.png',
  ];
  it.each(denied)('blocks %s even if the scope allows everything', (path) => {
    const r = checkScope([{ status: 'M', paths: [path] }], everything);
    expect(r.ok).toBe(false);
    expect(r.outside).toEqual([path]);
  });
  it('blocks a rename into a protected path and a deletion of one', () => {
    expect(
      checkScope([{ status: 'R100', paths: ['.github/x.yml', 'src/x.yml'] }], everything).outside,
    ).toEqual(['.github/x.yml']);
    expect(checkScope([{ status: 'D', paths: ['fly.toml'] }], everything).ok).toBe(false);
  });
  it('still allows ordinary files and look-alike names', () => {
    const paths = [
      'src/a.ts',
      'docs/Dockerfile.md',
      'e2e/plan.specs.ts', // was e2e/plan.spec.ts: a real spec is now protected (existing-test rule)
      'packages/db/src/schema.ts',
    ];
    expect(
      checkScope(
        [
          { status: 'M', paths },
          { status: 'A', paths: ['e2e/plan.spec.ts'] },
        ],
        everything,
      ),
    ).toEqual({ ok: true, outside: [] });
  });
});

describe('loopDelay (loop.sh pacing)', () => {
  it('uses the base interval while there is activity or only a few idle rounds', () => {
    expect(loopDelay({ base: 60, idle: 0, errors: 0 })).toBe(60);
    expect(loopDelay({ base: 60, idle: 4, errors: 0 })).toBe(60);
  });
  it('backs off to 5 minutes after the idle threshold', () => {
    expect(loopDelay({ base: 60, idle: 5, errors: 0 })).toBe(300);
    expect(loopDelay({ base: 60, idle: 50, errors: 0 })).toBe(300);
  });
  it('doubles per consecutive error round and caps at 10 minutes', () => {
    const d = (errors) => loopDelay({ base: 60, idle: 0, errors });
    expect([1, 2, 3, 4, 5, 500].map(d)).toEqual([120, 240, 480, 600, 600, 600]);
  });
  it('errors win over idle, and a larger base is never shortened', () => {
    expect(loopDelay({ base: 60, idle: 9, errors: 1 })).toBe(120);
    expect(loopDelay({ base: 400, idle: 9, errors: 0 })).toBe(400);
    expect(loopDelay({ base: 400, idle: 0, errors: 3 })).toBe(600);
  });
});

describe('existing test files are protected (orchestrator review, never automerge)', () => {
  const everything = ['**'];
  const ns = (...parts) => parseNameStatus(parts.join('\0') + '\0');
  it.each([
    ['M', 'apps/web/src/plan/plan.test.ts'],
    ['D', 'scripts/x/policy.test.mjs'],
    ['M', 'e2e/plan/plan.spec.ts'],
    ['D', 'e2e/plan/plan.spec.ts'],
    ['M', 'a.test.ts'],
  ])('blocks %s of the existing %s even if the scope allows it', (status, path) => {
    const r = checkScope(ns(status, path), everything);
    expect(r).toMatchObject({ ok: false, outside: [path] });
  });
  it('blocks every porcelain state that touches an existing test file', () => {
    for (const st of [' M', 'M ', ' D', 'MM', 'D ']) {
      const r = checkScope(parsePorcelain(porcelain(`${st} src/a.test.ts`)), everything);
      expect(r.ok, st).toBe(false);
    }
  });
  it('blocks a rename of an existing test file, in both name-status and porcelain order', () => {
    expect(checkScope(ns('R100', 'src/old.test.ts', 'src/new.ts'), everything).ok).toBe(false);
    expect(
      checkScope(parsePorcelain(porcelain('R  src/new.ts', 'src/old.test.ts')), everything).ok,
    ).toBe(false);
  });
  it('still allows adding new test files and changing non-test files', () => {
    expect(checkScope(ns('A', 'src/new.test.ts'), everything).ok).toBe(true);
    expect(checkScope(ns('A', 'e2e/new.spec.ts'), everything).ok).toBe(true);
    expect(
      checkScope(
        parsePorcelain(porcelain('?? src/new.test.ts', 'A  e2e/n.spec.ts', 'AM src/m.test.ts')),
        everything,
      ).ok,
    ).toBe(true);
    expect(checkScope(ns('M', 'src/a.ts', 'M', 'docs/testing.md'), everything).ok).toBe(true);
  });
});

describe('loopDelay input validation', () => {
  it('falls back to 600 s for a missing, non-numeric or too small base', () => {
    for (const base of [NaN, undefined, 'abc', 0, 4, -60, 1.5]) {
      expect(loopDelay({ base, idle: 0, errors: 0 }), String(base)).toBe(600);
    }
    expect(loopDelay({ base: 5, idle: 0, errors: 0 })).toBe(5);
  });
  it('never returns anything but an integer of at least 5', () => {
    for (const [idle, errors] of [
      [NaN, 0],
      [0, NaN],
      [undefined, undefined],
      [-3, -1],
    ]) {
      const d = loopDelay({ base: 60, idle, errors });
      expect(Number.isInteger(d) && d >= 5, `${idle}/${errors} -> ${d}`).toBe(true);
    }
  });
});
