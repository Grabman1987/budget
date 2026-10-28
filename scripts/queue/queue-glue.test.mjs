// Bash glue of the queue (gate.sh, automerge.sh, run_queue.sh, scope-lib.sh) against stub `gh` and
// `curl` executables and real throw-away git repositories (a bare "origin" plus a clone as the repo root).
// Nothing here touches GitHub, the network or the real checkout.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const QUEUE = dirname(fileURLToPath(import.meta.url));
const fwd = (p) => p.replace(/\\/g, '/');
// C:\x -> /c/x for PATH entries inside Git Bash
const posix = (p) => fwd(p).replace(/^([A-Za-z]):\//, (_m, d) => `/${d.toLowerCase()}/`);

function findBash() {
  if (process.platform !== 'win32') return 'bash';
  // `bash` on a Windows PATH may be the WSL launcher; the scripts are written for Git Bash.
  const dirs = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'),
  ];
  const candidates = [
    process.env.BASH_EXE,
    ...dirs.filter(Boolean).map((d) => join(d, 'Git', 'bin', 'bash.exe')),
  ];
  return candidates.find((c) => c && existsSync(c)) ?? null;
}
const BASH = findBash();

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.invalid',
  GIT_TERMINAL_PROMPT: '0',
};
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};

const GH_STUB = `#!/usr/bin/env bash
d=$STUB_DIR
echo "$*" >>"$d/calls.log"
if [ -f "$d/move-on" ] && [ ! -f "$d/moved" ] && [ "$(cat "$d/move-on")" = "$1 $2" ]; then
  touch "$d/moved"
  git -C "$MOVER" pull -q --ff-only origin main && git -C "$MOVER" commit -q --allow-empty -m moved && git -C "$MOVER" push -q origin main
fi
[ -f "$d/fail.$1.$2" ] && exit 1
if [ "$1 $2" = "api -X" ]; then n=$(basename "$(dirname "$4")"); [ -f "$d/fail.update.$n" ] && exit 1; fi
case "$1 $2" in
  "run list") case "$*" in *ci.yml*) cat "$d/ci.json" ;; *deploy.yml*) cat "$d/deploy.json" ;; esac ;;
  "pr list") case "$*" in *"--limit 200"*) cat "$d/heads.txt" ;; *"--state merged"*) cat "$d/merged.tsv" ;; *) cat "$d/prs.tsv" ;; esac ;;
  "pr view") cat "$d/head.$3" ;;
  "issue view") case "$*" in *"--json comments"*) cat "$d/comments.$3" 2>/dev/null ;; *"--json state"*) cat "$d/state.$3" ;; *"--json url"*) echo "https://example.invalid/issues/$3" ;; *) cat "$d/body.$3" 2>/dev/null || exit 1 ;; esac ;;
  "issue list") case "$*" in *"--label ready"*) cat "$d/ready.tsv" ;; *"--json number"*) echo 0 ;; esac ;;
  "issue comment") echo "$*" >>"$d/comments.$3" ;;
  "api --paginate") cat "$d/checks.ndjson" ;;
  "api repos/{owner}/{repo}/issues/"*/events) [ -f "$d/fail.events" ] && exit 1; cat "$d/events.$(basename "$(dirname "$2")")" 2>/dev/null ;;
esac
exit 0
`;
const CURL_STUB = `#!/usr/bin/env bash
[ -f "$STUB_DIR/curl-fail" ] && exit 22
cat "$STUB_DIR/health.json"
`;

/** The throw-away git setup shared by all fixtures: bare origin, repo root (queue scripts copied in), mover. */
let BASE;
beforeAll(() => {
  BASE = mkdtempSync(join(tmpdir(), 'queue-glue-base-'));
  const origin = join(BASE, 'origin.git');
  const root = join(BASE, 'root');
  git(BASE, 'init', '-q', '--bare', '-b', 'main', origin);
  git(BASE, 'clone', '-q', origin, root);
  git(root, 'checkout', '-q', '-B', 'main');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'a.ts'), 'a\n');
  writeFileSync(join(root, 'package.json'), '{}\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  git(root, 'push', '-q', '-u', 'origin', 'main');
  git(BASE, 'clone', '-q', origin, join(BASE, 'mover'));
  for (const repo of ['root', 'mover']) {
    git(join(BASE, repo), 'remote', 'set-url', 'origin', fwd(origin));
  }
  mkdirSync(join(root, 'scripts', 'queue'), { recursive: true });
  for (const f of [
    'gate.sh',
    'live.sh',
    'loop.sh',
    'automerge.sh',
    'run_queue.sh',
    'scope-lib.sh',
    'policy.mjs',
    'board.sh',
    'task-prompt.md',
  ]) {
    copyFileSync(join(QUEUE, f), join(root, 'scripts', 'queue', f));
  }
  mkdirSync(join(root, 'logs', 'queue', 'scope'), { recursive: true });
});
afterAll(() => rmSync(BASE, { recursive: true, force: true }));

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

/** A bare origin, a clone as repo root with the queue scripts copied in, and stub gh/curl. */
function fixture() {
  const tmp = mkdtempSync(join(tmpdir(), 'queue-glue-'));
  dirs.push(tmp);
  // the git setup is built once (beforeAll) and copied; only the remote URLs are re-pointed (plain file edit)
  cpSync(BASE, tmp, { recursive: true });
  for (const repo of ['root', 'mover']) {
    const cfg = join(tmp, repo, '.git', 'config');
    const text = readFileSync(cfg, 'utf8');
    writeFileSync(
      cfg,
      text.replaceAll(fwd(join(BASE, 'origin.git')), fwd(join(tmp, 'origin.git'))),
    );
  }
  const origin = join(tmp, 'origin.git');
  const root = join(tmp, 'root');
  const mover = join(tmp, 'mover');
  const bin = join(tmp, 'bin');
  const stub = join(tmp, 'stub');
  for (const d of [bin, stub]) mkdirSync(d);
  writeFileSync(join(bin, 'gh'), GH_STUB);
  writeFileSync(join(bin, 'curl'), CURL_STUB);
  chmodSync(join(bin, 'gh'), 0o755);
  chmodSync(join(bin, 'curl'), 0o755);

  const f = {
    tmp,
    root,
    origin,
    stub,
    write: (name, text) => writeFileSync(join(stub, name), text),
    calls: () =>
      existsSync(join(stub, 'calls.log')) ? readFileSync(join(stub, 'calls.log'), 'utf8') : '',
    head: () => git(root, 'rev-parse', 'origin/main'),
    scope: (issue, text) =>
      writeFileSync(join(root, 'logs', 'queue', 'scope', `issue-${issue}.txt`), text),
    /** PR branch agent/issue-N with one commit, pushed; returns its head sha. */
    pr(issue, files) {
      git(root, 'checkout', '-q', '-b', `agent/issue-${issue}`, 'origin/main');
      for (const [p, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, p)), { recursive: true });
        writeFileSync(join(root, p), text);
      }
      git(root, 'add', '--', ...Object.keys(files));
      git(root, 'commit', '-q', '-m', 'work');
      git(root, 'push', '-q', 'origin', `agent/issue-${issue}`);
      const sha = git(root, 'rev-parse', 'HEAD');
      git(root, 'checkout', '-q', 'main');
      return sha;
    },
    advanceMain() {
      git(root, 'commit', '-q', '--allow-empty', '-m', 'main moves');
      git(root, 'push', '-q', 'origin', 'main');
      git(root, 'fetch', '-q', 'origin');
    },
    /** Everything green for main's head and for PR #n with head sha. */
    green(n, sha) {
      const h = f.head();
      const run = JSON.stringify({ headSha: h, status: 'completed', conclusion: 'success' });
      f.write('ci.json', run);
      f.write('deploy.json', run);
      f.write('health.json', JSON.stringify({ status: 'ok', revision: h }));
      if (n) {
        f.write('prs.tsv', `${n}\tfalse\tagent/issue-7\trisk:low\n`);
        f.write(`head.${n}`, sha);
        f.checks(sha);
      }
    },
    checks(sha, conclusion = 'success') {
      const names = ['check', 'check-windows', 'docker', 'restore-test'];
      f.write(
        'checks.ndjson',
        names
          .map((name, i) =>
            JSON.stringify({ id: i + 1, name, status: 'completed', conclusion, head_sha: sha }),
          )
          .join('\n') + '\n',
      );
    },
    env: () => ({
      ...process.env,
      ...GIT_ENV,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      STUB_DIR: fwd(stub),
      MOVER: fwd(mover),
      STUB_BIN: posix(bin),
    }),
    sh(args, opts = {}) {
      // Git Bash puts its own tools (curl.exe, ...) in front of PATH at start-up, so the stubs are put
      // back in front from inside the shell.
      const front = 'export PATH="$STUB_BIN:$PATH"; ';
      const inner =
        args[0] === '-c'
          ? ['-c', front + args[1]]
          : ['-c', `${front}exec bash "$@"`, 'bash', ...args];
      const r = spawnSync(BASH, inner, {
        cwd: root,
        env: f.env(),
        encoding: 'utf8',
        timeout: 90_000,
        ...opts,
      });
      return { status: r.status, out: `${r.stdout}${r.stderr}`.trim() };
    },
    script: (name, ...args) => f.sh([fwd(join(root, 'scripts', 'queue', name)), ...args]),
    /** Runs a snippet with scope-lib.sh sourced, the way run_queue.sh does. */
    lib: (snippet) =>
      f.sh([
        '-c',
        `set -uo pipefail
HERE='${fwd(join(root, 'scripts', 'queue'))}' ROOT='${fwd(root)}' LOGDIR='${fwd(join(root, 'logs', 'queue'))}'
SCOPES="$LOGDIR/scope"; export GH_REPO=o/r
. "$HERE/scope-lib.sh"
${snippet}`,
      ]),
  };
  return f;
}

const GOOD_MAIN = 'a'.repeat(40);

/** Exercise only the real helper declarations; never enter its integration/release body. */
function mergeObserver(states = [`42\t${GOOD_MAIN}\t2\tcompleted\tsuccess`]) {
  const f = fixture();
  const source = readFileSync(join(QUEUE, 'merge-pr.sh'), 'utf8');
  const declarations = source.slice(source.indexOf('retry()'), source.indexOf('until main=$(gate_ok)'));
  writeFileSync(join(f.tmp, 'bin', 'gh'), `#!/usr/bin/env bash
echo "$*" >> "$STUB_DIR/calls.log"
case "$1 $2" in
  "run list") echo 42 ;;
  "run watch") exit "$(cat "$STUB_DIR/watch-exit")" ;;
  "run view")
    case "$*" in
      *--log-failed*) echo 'FAIL synthetic-terminal' ;;
      *status,conclusion*)
        [ -f "$STUB_DIR/status-error" ] && exit 1
        n=$(cat "$STUB_DIR/read-count"); n=$((n + 1)); echo "$n" > "$STUB_DIR/read-count"
        row=$(sed -n "\${n}p" "$STUB_DIR/states")
        [ -n "$row" ] || row=$(tail -n 1 "$STUB_DIR/states")
        printf '%s\n' "$row" ;;
      *) [ -f "$STUB_DIR/identity-error" ] && exit 1; cat "$STUB_DIR/identity" ;;
    esac ;;
  "pr view") [ -f "$STUB_DIR/metadata-error" ] && exit 1; cat "$STUB_DIR/closing-result" ;;
esac
`);
  writeFileSync(join(f.tmp, 'bin', 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(join(f.tmp, 'bin', 'sleep'), 0o755);
  f.write('identity', `42\t${GOOD_MAIN}\t2\n`);
  f.write('states', states.join('\n') + '\n');
  f.write('read-count', '0');
  f.write('watch-exit', '1');
  f.write('closing-result', 'true\n');
  return {
    ...f,
    observe: () => f.sh(['-c', `set -uo pipefail\npr=781\n${declarations}\nwait_ci '${GOOD_MAIN}'`]),
    metadata: () => f.sh(['-c', `set -uo pipefail\npr=781\n${declarations}\nclosing_refs_ok || exit 1\ngh pr merge 781 --squash`]),
    reads: () => Number(readFileSync(join(f.stub, 'read-count'), 'utf8')),
  };
}

describe('merge-pr CI observation and closing-reference guard', () => {
  it('confirms an ordinary successful watch with an authoritative same-attempt success', () => {
    const f = mergeObserver();
    f.write('watch-exit', '0');
    expect(f.observe().status).toBe(0);
    expect(f.reads()).toBe(1);
  });

  it('recovers a transient watch error on the same live run/head/attempt and observes its success', () => {
    const f = mergeObserver([
      `42\t${GOOD_MAIN}\t2\tqueued\t`,
      `42\t${GOOD_MAIN}\t2\tin_progress\t`,
      `42\t${GOOD_MAIN}\t2\tcompleted\tsuccess`,
    ]);
    const result = f.observe();
    expect(result.status).toBe(0);
    expect(result.out).not.toContain('CI red');
    expect(f.reads()).toBe(3);
    expect(f.calls().match(/^run watch /gm)).toHaveLength(1);
    expect(f.calls()).not.toMatch(/^(workflow run|run rerun|pr merge|api) /m);
  });

  it.each(['failure', 'cancelled', 'timed_out', 'neutral', 'skipped', 'action_required', 'stale', 'startup_failure'])(
    'reports authoritative terminal %s as red',
    (conclusion) => {
      const f = mergeObserver([`42\t${GOOD_MAIN}\t2\tcompleted\t${conclusion}`]);
      const result = f.observe();
      expect(result.status).toBe(1);
      expect(result.out).toContain('CI red');
      expect(result.out).toContain('synthetic-terminal');
    },
  );

  it.each([
    `43\t${GOOD_MAIN}\t2\tcompleted\tsuccess`,
    `42\t${'b'.repeat(40)}\t2\tcompleted\tsuccess`,
    `42\t${GOOD_MAIN}\t3\tcompleted\tsuccess`,
    `42\t${GOOD_MAIN}\t2\tunknown\t`,
    `42\t${GOOD_MAIN}\t2\tcompleted\t`,
    `42\t${GOOD_MAIN}\t2\tcompleted\tunknown`,
    `42\t${GOOD_MAIN}\t2\tin_progress\tfailure`,
    'malformed',
  ])('fails closed on unknown or mismatched authoritative state %s', (state) => {
    const f = mergeObserver([state]);
    f.write('watch-exit', '0');
    const result = f.observe();
    expect(result.status).toBe(1);
    expect(result.out).toContain('CI observation');
    expect(result.out).not.toContain('CI red');
  });

  it.each(['identity-error', 'status-error'])('fails closed after bounded API read errors: %s', (flag) => {
    const f = mergeObserver();
    f.write(flag, '');
    const result = f.observe();
    expect(result.status).toBe(1);
    expect(result.out).toContain('CI observation');
    expect(result.out).not.toContain('CI red');
    const reads = f.calls().split('\n').filter((line) => line.startsWith('run view '));
    expect(reads).toHaveLength(flag === 'identity-error' ? 3 : 4);
  });

  it.each([
    `43\t${GOOD_MAIN}\t2`,
    `42\t${'b'.repeat(40)}\t2`,
    `42\t${GOOD_MAIN}\t0`,
    `42\t${GOOD_MAIN}\tunknown`,
    '',
  ])('rejects an unverified initial run/head/attempt identity: %s', (identity) => {
    const f = mergeObserver();
    f.write('identity', identity);
    const result = f.observe();
    expect(result.status).toBe(1);
    expect(result.out).toContain('CI observation');
    expect(f.calls()).not.toContain('run watch');
  });

  it('exhausts its bounded live-state readback without merging or calling it red', () => {
    const f = mergeObserver([`42\t${GOOD_MAIN}\t2\tin_progress\t`]);
    const result = f.observe();
    expect(result.status).toBe(1);
    expect(result.out).toContain('CI observation exhausted');
    expect(result.out).not.toContain('CI red');
    expect(f.reads()).toBe(30);
    expect(f.calls()).not.toMatch(/^(workflow run|run rerun|pr merge|api) /m);
  });

  it('allows the merge command only after an authoritative typed-empty closing-reference result', () => {
    const f = mergeObserver();
    expect(f.metadata().status).toBe(0);
    expect(f.calls()).toContain('pr merge 781 --squash');
  });

  it.each(['false', 'null', '', '{}', 'unknown', 'true\ntrue'])(
    'blocks nonempty, unavailable or malformed closing-reference results: %s',
    (result) => {
      const f = mergeObserver();
      f.write('closing-result', result);
      expect(f.metadata().status).toBe(1);
      expect(f.calls()).not.toContain('pr merge');
    },
  );

  it('blocks closing-reference API errors after bounded retries', () => {
    const f = mergeObserver();
    f.write('metadata-error', '');
    expect(f.metadata().status).toBe(1);
    expect(f.calls().match(/^pr view /gm)).toHaveLength(3);
    expect(f.calls()).not.toContain('pr merge');
  });
});

describe.skipIf(!BASH)('gate.sh (fails closed)', () => {
  it('passes and prints the validated main head only when CI, deploy and /health all confirm it', () => {
    const f = fixture();
    f.green();
    const r = f.script('gate.sh');
    expect(r.status).toBe(0);
    expect(r.out).toBe(`ok ${f.head()}`);
  });
  it('blocks on a gh error', () => {
    const f = fixture();
    f.green();
    f.write('fail.run.list', '');
    const r = f.script('gate.sh');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/^BLOCK: gh run list ci\.yml failed/);
  });
  it.each(['ci.json', 'deploy.json'])(
    'reports the real reason when gh answers empty (%s)',
    (file) => {
      const f = fixture();
      f.green();
      f.write(file, '');
      const r = f.script('gate.sh');
      expect(r.status).toBe(1);
      expect(r.out).toMatch(/^BLOCK: (ci|deploy)\.yml run for \w+ missing$/);
    },
  );
  it('blocks while CI is pending', () => {
    const f = fixture();
    f.green();
    f.write(
      'ci.json',
      JSON.stringify({ headSha: f.head(), status: 'in_progress', conclusion: null }),
    );
    const r = f.script('gate.sh');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/^BLOCK: ci\.yml in_progress/);
  });
  it('blocks when /health shows another revision', () => {
    const f = fixture();
    f.green();
    f.write('health.json', JSON.stringify({ status: 'ok', revision: GOOD_MAIN }));
    const r = f.script('gate.sh');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/^BLOCK: live revision/);
  });
  it('blocks when /health is unreachable', () => {
    const f = fixture();
    f.green();
    f.write('curl-fail', '');
    const r = f.script('gate.sh');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/^BLOCK: health unreachable/);
  });
});

describe.skipIf(!BASH)('automerge.sh integration order (oldest first)', () => {
  const two = () => {
    const f = fixture();
    const sha7 = f.pr(7, { 'src/a.ts': 'one\n' });
    const sha8 = f.pr(8, { 'src/b.ts': 'two\n' });
    f.scope(7, 'src/**\n');
    f.scope(8, 'src/**\n');
    // listed newest first on purpose
    f.write('prs.tsv', `13\tfalse\tagent/issue-8\trisk:low\n12\tfalse\tagent/issue-7\trisk:low\n`);
    f.write('head.12', sha7);
    f.write('head.13', sha8);
    f.write(
      'checks.ndjson',
      [sha7, sha8]
        .flatMap((s) =>
          ['check', 'check-windows', 'docker', 'restore-test'].map((name, i) => ({
            id: i + 1,
            name,
            status: 'completed',
            conclusion: 'success',
            head_sha: s,
          })),
        )
        .map((x) => JSON.stringify(x))
        .join('\n') + '\n',
    );
    return { f, sha7, sha8 };
  };
  it('merges the lowest PR number first', () => {
    const { f, sha7 } = two();
    f.green();
    f.script('automerge.sh');
    expect(f.calls()).toContain(`pr merge 12 --squash --delete-branch --match-head-commit ${sha7}`);
    expect(f.calls()).not.toContain('pr merge 13');
  });
  it('a failed update-branch labels that PR needs-human and the next behind PR is updated', () => {
    const { f } = two();
    f.advanceMain();
    f.green();
    f.write('fail.update.12', '');
    const r = f.script('automerge.sh');
    expect(r.out).toMatch(/#12: update-branch failed/);
    expect(r.out).toMatch(/#13: branch updated/);
    expect(f.calls()).toContain('pr edit 12 --add-label needs-human');
    expect(f.calls()).toMatch(/^pr comment 12 /m);
    expect(f.calls()).toContain('pulls/13/update-branch');
    expect(f.calls()).not.toContain('pr edit 13');
  });
  it('updates only the first PR in line that is behind main, the others wait', () => {
    const { f } = two();
    f.advanceMain();
    f.green();
    const r = f.script('automerge.sh');
    expect(f.calls().match(/update-branch/g)).toHaveLength(1);
    expect(f.calls()).toContain('pulls/12/update-branch');
    expect(f.calls()).not.toContain('pulls/13/update-branch');
    expect(r.out).toMatch(/#12: branch updated/);
    expect(f.calls()).not.toContain('pr merge');
  });
});

describe.skipIf(!BASH)('automerge.sh (head-bound, scoped, one merge per run)', () => {
  const setup = (files = { 'src/a.ts': 'changed\n' }) => {
    const f = fixture();
    const sha = f.pr(7, files);
    f.scope(7, 'src/**\n');
    f.green(12, sha);
    return { f, sha };
  };

  it('merges with --match-head-commit on the sha it checked', () => {
    const { f, sha } = setup();
    const r = f.script('automerge.sh');
    expect(r.out).toContain(`#12: merged ${sha.slice(0, 7)}`);
    expect(f.calls()).toContain(`pr merge 12 --squash --delete-branch --match-head-commit ${sha}`);
  });
  it('does not merge when the required checks belong to another head sha', () => {
    const { f } = setup();
    f.checks('c'.repeat(40));
    const r = f.script('automerge.sh');
    expect(r.out).toMatch(
      /#12: wait \(not green for \w+: check check-windows docker restore-test\)/,
    );
    expect(f.calls()).not.toContain('pr merge');
  });
  it('does not merge when a required check failed for the head', () => {
    const { f, sha } = setup();
    f.checks(sha, 'failure');
    f.script('automerge.sh');
    expect(f.calls()).not.toContain('pr merge');
  });
  it('does not merge when main moved between the gate and the fetch', () => {
    const { f } = setup();
    f.write('move-on', 'run list');
    const r = f.script('automerge.sh');
    expect(r.out).toMatch(/main moved since the gate/);
    expect(f.calls()).not.toContain('pr merge');
  });
  it('re-reads origin/main right before the merge and skips if it moved', () => {
    const { f } = setup();
    f.write('move-on', 'pr view');
    const r = f.script('automerge.sh');
    expect(r.out).toMatch(/#12: skip \(main moved/);
    expect(f.calls()).not.toContain('pr merge');
  });
  it('never falls back to the issue body when the scope snapshot is missing', () => {
    const { f } = setup();
    rmSync(join(f.root, 'logs', 'queue', 'scope', 'issue-7.txt'));
    f.write('body.7', '```queue-scope\n**\n```\n');
    const r = f.script('automerge.sh');
    expect(r.out).toMatch(/#12: skip \(no scope snapshot/);
    expect(f.calls()).not.toContain('issue view');
    expect(f.calls()).not.toContain('pr merge');
  });
  it('flags a committed change outside the scope as needs-human and does not merge', () => {
    const { f } = setup({ 'src/a.ts': 'changed\n', 'package.json': '{"x":1}\n' });
    const r = f.script('automerge.sh');
    expect(r.out).toMatch(/#12: scope violation/);
    expect(f.calls()).toContain('pr edit 12 --add-label needs-human');
    expect(f.calls()).toContain('issue edit 7 --add-label needs-human');
    expect(f.calls()).not.toContain('pr merge');
  });
  it('never merges a protected path, even when the scope would allow it', () => {
    const { f } = setup({ '.github/workflows/ci.yml': 'x\n' });
    f.scope(7, '**\n');
    f.script('automerge.sh');
    expect(f.calls()).not.toContain('pr merge');
    expect(f.calls()).toContain('pr edit 12 --add-label needs-human');
  });
  it('updates a branch that is behind main through the API (with expected_head_sha) and skips it this round', () => {
    const { f, sha } = setup();
    f.advanceMain();
    f.green(12, sha);
    const r = f.script('automerge.sh');
    expect(r.out).toMatch(/#12: branch updated/);
    expect(f.calls()).toContain(
      `api -X PUT repos/Grabman1987/budget/pulls/12/update-branch -f expected_head_sha=${sha}`,
    );
    expect(f.calls()).not.toContain('--expected-head-sha');
    expect(f.calls()).not.toContain('pr merge');
  });
  it('merges at most one PR per run', () => {
    const { f, sha } = setup();
    const sha2 = f.pr(8, { 'src/b.ts': 'b\n' });
    f.scope(8, 'src/**\n');
    f.write('prs.tsv', `12\tfalse\tagent/issue-7\trisk:low\n13\tfalse\tagent/issue-8\trisk:low\n`);
    f.write('head.13', sha2);
    f.write(
      'checks.ndjson',
      [sha, sha2]
        .flatMap((s) =>
          ['check', 'check-windows', 'docker', 'restore-test'].map((name, i) => ({
            id: i + 1,
            name,
            status: 'completed',
            conclusion: 'success',
            head_sha: s,
          })),
        )
        .map((x) => JSON.stringify(x))
        .join('\n') + '\n',
    );
    f.script('automerge.sh');
    expect(f.calls().match(/^pr merge/gm)).toHaveLength(1);
  });
});

describe.skipIf(!BASH)('scope snapshot and run_queue.sh start rules', () => {
  it('writes the snapshot once and never re-reads an edited issue body', () => {
    const f = fixture();
    f.write('body.7', 'intro\n```queue-scope\nsrc/**\n```\n');
    expect(f.lib('scope_snapshot 7; echo rc=$?').out).toContain('rc=0');
    const file = join(f.root, 'logs', 'queue', 'scope', 'issue-7.txt');
    expect(readFileSync(file, 'utf8').trim()).toBe('src/**');
    f.write('body.7', '```queue-scope\n**\n```\n');
    f.lib('scope_snapshot 7');
    expect(readFileSync(file, 'utf8').trim()).toBe('src/**');
  });
  it('writes no snapshot without a queue-scope block', () => {
    const f = fixture();
    f.write('body.7', 'no block here');
    expect(f.lib('scope_snapshot 7; echo rc=$?').out).toContain('rc=1');
    expect(existsSync(join(f.root, 'logs', 'queue', 'scope', 'issue-7.txt'))).toBe(false);
  });
  it('does not start a job for an issue without a queue-scope block and comments only once', () => {
    const f = fixture();
    f.write('ready.tsv', '7\tready,area:infra\n');
    f.write('heads.txt', '');
    f.write('body.7', 'no block here');
    const run = () => f.script('run_queue.sh', '--max-parallel', '2');
    expect(run().out).toContain('#7: skip (no queue-scope block)');
    run();
    expect(f.calls().match(/^issue comment 7/gm)).toHaveLength(1);
    expect(f.calls()).not.toMatch(/issue edit 7/);
    expect(existsSync(join(f.root, 'logs', 'queue', 'scope', 'issue-7.txt'))).toBe(false);
  });
});

describe.skipIf(!BASH)(
  'publish_in_scope (Codex path: commit and push only inside the scope)',
  () => {
    const setup = () => {
      const f = fixture();
      f.scope(7, 'src/**\n');
      mkdirSync(join(f.root, 'logs', 'queue', 'nohooks'), { recursive: true });
      const wt = join(f.tmp, 'wt', 'issue-7');
      git(f.root, 'worktree', 'add', '-q', '-B', 'agent/issue-7', wt, 'origin/main');
      const pushed = () => git(f.root, 'ls-remote', 'origin', 'refs/heads/agent/issue-7');
      const publish = () =>
        f.lib(`publish_in_scope 7 '${fwd(wt)}' agent/issue-7 'feat: work'; echo rc=$?`);
      return { f, wt, pushed, publish };
    };

    it('commits exactly the changed paths and pushes when everything is inside the scope', () => {
      const { f, wt, pushed, publish } = setup();
      writeFileSync(join(wt, 'src', 'a.ts'), 'changed\n');
      writeFileSync(join(wt, 'src', 'new file.ts'), 'n\n');
      const r = publish();
      expect(r.out).toContain('rc=0');
      expect(pushed()).not.toBe('');
      expect(git(wt, 'log', '-1', '--format=%s')).toBe('feat: work');
      expect(f.calls()).not.toContain('needs-human');
    });
    it('commits and pushes nothing when an untracked file lies outside the scope', () => {
      const { f, wt, pushed, publish } = setup();
      writeFileSync(join(wt, 'src', 'a.ts'), 'changed\n');
      writeFileSync(join(wt, 'secret.txt'), 's\n');
      const r = publish();
      expect(r.out).not.toContain('rc=0');
      expect(pushed()).toBe('');
      expect(git(wt, 'log', '--oneline', 'origin/main..HEAD')).toBe('');
      expect(f.calls()).toContain('issue edit 7 --add-label needs-human');
      expect(existsSync(join(wt, 'secret.txt'))).toBe(true); // work is kept
    });
    it('refuses to push a commit the agent made itself outside the scope', () => {
      const { wt, pushed, publish } = setup();
      writeFileSync(join(wt, 'package.json'), '{"x":1}\n');
      git(wt, 'add', '-A');
      git(wt, 'commit', '-q', '-m', 'sneaky');
      const r = publish();
      expect(r.out).not.toContain('rc=0');
      expect(pushed()).toBe('');
    });
    it('wgit ignores a .git file swapped after the check (explicit --git-dir and --work-tree)', () => {
      const { f, wt } = setup();
      const evil = join(f.tmp, 'evil');
      git(f.tmp, 'init', '-q', evil);
      rmSync(join(wt, '.git'));
      writeFileSync(
        join(wt, '.git'),
        `gitdir: ${fwd(join(evil, '.git'))}
`,
      );
      const r = f.lib(`wgit '${fwd(wt)}' rev-parse --absolute-git-dir --show-toplevel`);
      expect(r.out).toContain('/.git/worktrees/issue-7');
      expect(r.out).not.toContain('evil');
    });
    it('refuses to run git in a worktree whose .git file points somewhere else', () => {
      const { f, wt, pushed, publish } = setup();
      const evil = join(f.tmp, 'evil');
      git(f.tmp, 'init', '-q', evil);
      rmSync(join(wt, '.git'));
      writeFileSync(join(wt, '.git'), `gitdir: ${fwd(join(evil, '.git'))}\n`);
      writeFileSync(join(wt, 'src', 'a.ts'), 'changed\n');
      const r = publish();
      expect(r.out).not.toContain('rc=0');
      expect(pushed()).toBe('');
      expect(f.calls()).toContain('issue edit 7 --add-label needs-human');
    });
  },
);

describe.skipIf(!BASH)('live.sh (closes only completed issues, never on errors)', () => {
  const MERGED = '2026-10-17T09:00:00Z';
  /** labelled = PR carries queue:complete now; labelledAt = time of its latest "labeled" event. */
  const setup = (labelled, labelledAt = '2026-10-17T10:00:00Z') => {
    const f = fixture();
    f.green();
    f.write('merged.tsv', `agent/issue-7\t${f.head()}\t${labelled}\t12\t${MERGED}\n`);
    f.write('events.12', `${labelledAt}\n`);
    f.write('state.7', 'OPEN');
    return f;
  };
  const closed = (f) => /^issue close 7/m.test(f.calls());
  const comments = (f) => f.calls().match(/^issue comment 7/gm) ?? [];

  it('without queue:complete: no close, one comment per PR, board to CI / Review', () => {
    const f = setup('false');
    const r = f.script('live.sh');
    expect(r.out).toContain('#7: live');
    expect(closed(f)).toBe(false);
    expect(f.calls()).toMatch(/open items remain, issue stays open/);
    expect(f.calls()).toContain('85b8e1ab');
    expect(f.calls()).not.toContain('6c62c1e6');
    f.script('live.sh');
    expect(comments(f)).toHaveLength(1);
    expect(closed(f)).toBe(false);
  });
  it('with queue:complete set after the merge: closes and moves the board to Live', () => {
    const f = setup('true');
    f.script('live.sh');
    expect(closed(f)).toBe(true);
    expect(f.calls()).toContain('6c62c1e6');
  });
  it('a queue:complete set before the merge (by the agent) does not count', () => {
    const f = setup('true', '2026-10-17T08:00:00Z');
    f.script('live.sh');
    expect(closed(f)).toBe(false);
    expect(comments(f)).toHaveLength(1);
    expect(f.calls()).not.toContain('6c62c1e6');
  });
  it('does nothing when the label events cannot be read', () => {
    const f = setup('true');
    f.write('fail.events', '');
    f.script('live.sh');
    expect(closed(f)).toBe(false);
    expect(comments(f)).toHaveLength(0);
  });
  it('does nothing when gh pr list fails', () => {
    const f = setup('true');
    f.write('fail.pr.list', '');
    f.script('live.sh');
    expect(closed(f)).toBe(false);
    expect(comments(f)).toHaveLength(0);
  });
  it('does nothing when the issue comments cannot be read', () => {
    const f = setup('false');
    f.write('fail.issue.view', '');
    f.script('live.sh');
    expect(closed(f)).toBe(false);
    expect(comments(f)).toHaveLength(0);
  });
  it('does nothing while the merge commit is not live yet', () => {
    const f = setup('true');
    f.advanceMain();
    f.write('merged.tsv', `agent/issue-7\t${f.head()}\ttrue\t12\t${MERGED}\n`);
    f.write('health.json', JSON.stringify({ status: 'ok', revision: 'b'.repeat(40) }));
    f.script('live.sh');
    expect(closed(f)).toBe(false);
    expect(comments(f)).toHaveLength(0);
  });
});

describe.skipIf(!BASH)('loop.sh STOP file', () => {
  const stop = (text) => {
    const f = fixture();
    const file = join(f.root, 'logs', 'queue', 'STOP');
    writeFileSync(file, text);
    const r = f.script('loop.sh', '--once');
    return { f, r, log: readFileSync(join(f.root, 'logs', 'queue', 'loop.log'), 'utf8'), file };
  };
  it('logs mtime, size and first line before removing the file', () => {
    const { r, log, file } = stop('maintenance window\nsecond line\n');
    expect(log).toMatch(
      /STOP file found \(mtime \d{4}-\d\d-\d\d \d\d:\d\d:\d\d, 31 bytes, reason: maintenance window\)/,
    );
    expect(r.out).toContain('reason: maintenance window');
    expect(existsSync(file)).toBe(false);
  });
  it('logs "none" for an empty STOP file and still honours it', () => {
    const { log, file } = stop('');
    expect(log).toMatch(/, 0 bytes, reason: none\)/);
    expect(existsSync(file)).toBe(false);
  });
});

describe.skipIf(!BASH)('live.sh never closes parents', () => {
  it('closes only the issue of the PR branch, never another issue the PR mentions', () => {
    const f = fixture();
    f.green();
    f.write('merged.tsv', `agent/issue-7\t${f.head()}\ttrue\t12\t2026-10-17T09:00:00Z\n`);
    f.write('events.12', `2026-10-17T10:00:00Z\n`);
    f.write('state.7', 'OPEN');
    f.write('state.3', 'OPEN');
    f.script('live.sh');
    expect(f.calls()).toMatch(/^issue close 7/m);
    expect(f.calls()).not.toMatch(/^issue (close|view|comment) 3/m);
  });
  it('ignores merged PRs that are not agent/codex issue branches', () => {
    const f = fixture();
    f.green();
    f.write('merged.tsv', `feature/epic-3\t${f.head()}\ttrue\t12\n`);
    f.script('live.sh');
    expect(f.calls()).not.toMatch(/^issue close/m);
  });
});

describe.skipIf(!BASH)('loop.sh pacing', () => {
  // the delay arithmetic is unit-tested in policy.test.mjs (loopDelay); one real round checks the wiring
  it('an error round with a bad --interval logs a 600 s fallback instead of spinning', () => {
    const f = fixture();
    f.green();
    for (const n of ['ready.tsv', 'heads.txt', 'merged.tsv', 'prs.tsv']) f.write(n, '');
    f.write('curl-fail', '');
    f.script('loop.sh', '--once', '--interval', 'abc');
    const log = readFileSync(join(f.root, 'logs', 'queue', 'loop.log'), 'utf8');
    expect(log).toMatch(/pace: idle=1 errors=1 next=600s/);
  });
});
