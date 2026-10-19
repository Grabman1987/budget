// Review #646 regressions. Scripts run only as disposable copies with local command/sibling mocks;
// no real GitHub, network, dispatch, merge, deploy or unattended queue is used.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkScope } from './policy.mjs';

const QUEUE = dirname(fileURLToPath(import.meta.url));
const fwd = (p) => p.replace(/\\/g, '/');
const posix = (p) => fwd(p).replace(/^([A-Za-z]):\//, (_m, d) => `/${d.toLowerCase()}/`);
const BASH =
  process.platform === 'win32'
    ? [
        process.env.BASH_EXE,
        ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
          .filter(Boolean)
          .map((d) => join(d, 'Git', 'bin', 'bash.exe')),
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs/Git/bin/bash.exe'),
      ].find((p) => p && existsSync(p))
    : 'bash';
const SHA = 'a'.repeat(40);
const MERGED = '2026-10-17T09:00:00Z';
const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function fixture(script) {
  const root = mkdtempSync(join(tmpdir(), 'queue-review-650-'));
  dirs.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const write = (name, text) => writeFileSync(join(root, name), text);
  const executable = (name, body) =>
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  copyFileSync(join(QUEUE, script), join(root, script));
  copyFileSync(join(QUEUE, 'policy.mjs'), join(root, 'policy.mjs'));
  executable(
    'git',
    `case "$*" in
  *"rev-parse --show-toplevel") echo "$STUB_ROOT" ;;
  "fetch -q origin main" | "merge-base --is-ancestor ${SHA} ${SHA}") ;;
  *) echo "unexpected git: $*" >&2; exit 99 ;;
esac`,
  );
  executable('curl', `echo '{"status":"ok","revision":"${SHA}"}'`);
  executable(
    'gh',
    `echo "$*" >>"$STUB_ROOT/calls.log"
case "$1 $2" in
  "run list") echo success ;;
  "pr list") cat "$STUB_ROOT/merged.tsv" ;;
  "api repos/{owner}/{repo}/issues/12/events") cat "$STUB_ROOT/events.txt" ;;
  "issue view") case "$*" in *"--json state"*) echo OPEN ;; *"--json comments"*) ;; *) exit 99 ;; esac ;;
  "issue comment" | "issue close") ;;
  *) echo "unexpected gh: $*" >&2; exit 99 ;;
esac`,
  );
  write('board.sh', '#!/usr/bin/env bash\nexit 0\n');
  return {
    write,
    calls: () => readFileSync(join(root, 'calls.log'), 'utf8'),
    run() {
      // Git Bash prepends its own tools: put mocks first again inside the shell.
      const r = spawnSync(
        BASH,
        ['-c', 'export PATH="$STUB_BIN:$PATH"; exec bash "$@"', 'bash', script, '--once'],
        {
          cwd: root,
          env: { ...process.env, STUB_ROOT: fwd(root), STUB_BIN: posix(bin) },
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
      expect(r.error).toBeUndefined();
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
      expect(`${r.stdout}${r.stderr}`).not.toContain('unexpected');
      return `${r.stdout}${r.stderr}`;
    },
  };
}

describe('review #646: real spec beside its snapshot directory', () => {
  it('allows the added plan.spec.ts alongside modified look-alikes, but protects the existing spec', () => {
    const paths = [
      'src/a.ts',
      'docs/Dockerfile.md',
      'e2e/plan.specs.ts',
      'packages/db/src/schema.ts',
    ];
    expect(
      checkScope(
        [
          { status: 'M', paths },
          { status: 'A', paths: ['e2e/plan.spec.ts'] },
        ],
        ['**'],
      ),
    ).toEqual({ ok: true, outside: [] });
    expect(checkScope([{ status: 'M', paths: ['e2e/plan.spec.ts'] }], ['**'])).toMatchObject({
      ok: false,
      outside: ['e2e/plan.spec.ts'],
    });
    expect(
      checkScope([{ status: 'A', paths: ['e2e/plan.spec.ts-snapshots/a.png'] }], ['**']),
    ).toMatchObject({ ok: false, outside: ['e2e/plan.spec.ts-snapshots/a.png'] });
  });
});

describe('review #646: live completion needs a merge timestamp', () => {
  it.each([
    ['missing field', undefined, '2026-10-17T10:00:00Z', false],
    ['empty field', '', '2026-10-17T10:00:00Z', false],
    ['label before merge', MERGED, '2026-10-17T08:00:00Z', false],
    ['label at merge', MERGED, MERGED, false],
    ['missing label event', MERGED, '', false],
    ['label after merge', MERGED, '2026-10-17T10:00:00Z', true],
  ])('%s', (_name, mergedAt, labelledAt, close) => {
    const f = fixture('live.sh');
    f.write(
      'merged.tsv',
      `codex/issue-7\t${SHA}\ttrue\t12${mergedAt === undefined ? '' : `\t${mergedAt}`}\n`,
    );
    f.write('events.txt', `${labelledAt}\n`);
    const out = f.run();
    const calls = f.calls();
    expect(/^issue close 7 /m.test(calls)).toBe(close);
    expect(/^issue comment 7 /m.test(calls)).toBe(!close);
    expect(out).toContain(close ? ', closed' : 'open items remain');
  });
});

describe('review #646: board warnings do not cause error backoff', () => {
  it.each([
    ['warn: board 7 CI / Review failed', 0, 1, 60],
    ['#7: live in aaaaaaa, closed\nwarn: board 7 Live failed', 0, 0, 60],
    ['live: gh pr list failed, skipping', 1, 1, 120],
    ['live: cannot read ci.yml runs, skipping', 1, 1, 120],
    ['live: no healthy revision, skipping', 1, 1, 120],
    ['#7: label events unreadable, skipping', 1, 1, 120],
    ['warn: board 7 Live failed\n#8: close failed', 1, 1, 120],
  ])('%s', (liveOutput, errors, idle, delay) => {
    const f = fixture('loop.sh');
    // Only the copied loop's classification runs; every operational sibling is replaced.
    f.write('live-output.txt', liveOutput);
    f.write('live.sh', '#!/usr/bin/env bash\ncat "$STUB_ROOT/live-output.txt"\n');
    for (const sibling of ['gate.sh', 'automerge.sh', 'run_queue.sh']) {
      f.write(sibling, '#!/usr/bin/env bash\nexit 0\n');
    }
    const out = f.run();
    expect(out).toContain(liveOutput.replaceAll('\n', '; '));
    expect(out).toContain(`pace: idle=${idle} errors=${errors} next=${delay}s`);
  });
});
