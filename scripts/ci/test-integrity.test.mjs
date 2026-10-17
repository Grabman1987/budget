import { describe, expect, it } from 'vitest';
import { check, parseDiff } from './test-integrity.mjs';
import { linesPct, MAX_DROP } from './coverage-ratchet.mjs';

// Builds a one-hunk -U0 diff; removed lines start at line 10, added lines at line 10.
function diff(path, { removed = [], added = [], status = 'modified' } = {}) {
  const mode =
    status === 'modified' ? '' : `${status === 'added' ? 'new' : 'deleted'} file mode 100644\n`;
  const hunk =
    removed.length || added.length ? `@@ -10,${removed.length} +10,${added.length} @@\n` : '';
  return `diff --git a/${path} b/${path}\n${mode}${hunk}${removed.map((l) => `-${l}`).join('\n')}${removed.length ? '\n' : ''}${added.map((l) => `+${l}`).join('\n')}\n`;
}
const run = (text, opts) => check(parseDiff(text), opts);
const reasons = (text, opts) => run(text, opts).map((v) => `${v.file}:${v.line} ${v.reason}`);
// Disabling markers are assembled so this very file does not trip the gate.
const markers = [
  'it.' + 'skip(1)',
  'it.' + 'only(1)',
  'test.' + 'fixme(1)',
  'it.' + 'todo(1)',
  'test.' + 'fail(1)',
  'x' + 'it(1)',
  'x' + 'describe(1)',
  'use({ ' + 'skip: true })',
];

describe('test-integrity', () => {
  it('allows added tests and assertions', () => {
    expect(
      run(diff('a/x.test.ts', { added: ["it('new', () => {", '  expect(1).toBe(1);', '});'] })),
    ).toEqual([]);
  });
  it('flags a deleted test file, but not a deleted source file', () => {
    expect(
      reasons(diff('a/x.test.ts', { status: 'deleted', removed: ['expect(1).toBe(1);'] })),
    ).toEqual(['a/x.test.ts:1 test file deleted']);
    expect(run(diff('a/x.ts', { status: 'deleted', removed: ['expect(1)'] }))).toEqual([]);
  });
  it('flags removed and modified assertions with the old line number', () => {
    expect(
      reasons(
        diff('e2e/x.ts', { removed: ['  expect(a).toBe(1);'], added: ['  expect(a).toBe(2);'] }),
      ),
    ).toEqual(['e2e/x.ts:10 assertion removed or changed']);
  });
  it('treats an identical removed+added line (a move) as no change', () => {
    expect(
      run(
        diff('a/x.test.ts', { removed: ['  expect(a).toBe(1);'], added: ['expect(a).toBe(1);'] }),
      ),
    ).toEqual([]);
  });
  it('flags removed test declarations', () => {
    expect(reasons(diff('a/x.test.tsx', { removed: ["  test.describe('x', () => {"] }))).toEqual([
      'a/x.test.tsx:10 test declaration removed or changed',
    ]);
  });
  it.each(markers)('flags newly added %s', (marker) => {
    expect(run(diff('a/x.test.mjs', { added: [marker] }))).toHaveLength(1);
  });
  it.each([
    'maxDiffPixelRatio: 0.01',
    'threshold: 0.2',
    'retries: 2',
    'timeout: 5000',
    'expect(a).toBeCloseTo(1, 2)',
  ])('flags a changed tolerance line %s', (line) => {
    expect(
      reasons(diff('playwright.config.ts', { removed: [line], added: [line.replace(/\d+/, '9')] })),
    ).toHaveLength(1);
  });
  it('flags coverage threshold changes in the vitest config only', () => {
    expect(
      reasons(diff('vitest.config.ts', { added: ['coverage: { thresholds: { lines: 10 } },'] })),
    ).toEqual(['vitest.config.ts:10 coverage config changed']);
    expect(
      run(
        diff('vitest.config.ts', { removed: ["include: ['a'],"], added: ["include: ['a', 'b'],"] }),
      ),
    ).toEqual([]);
  });
  it('flags modified or deleted baselines unless on the baseline bot branch', () => {
    const png = 'e2e/plan.spec.ts-snapshots/plan-chromium.png';
    expect(
      reasons(`diff --git a/${png} b/${png}\nBinary files a/${png} and b/${png} differ\n`),
    ).toHaveLength(1);
    expect(run(diff(png, { status: 'deleted' }))).toHaveLength(1);
    expect(
      run(`diff --git a/${png} b/${png}\nBinary files a/${png} and b/${png} differ\n`, {
        headRef: 'bot/visual-baselines',
      }),
    ).toEqual([]);
    expect(
      run(
        `diff --git a/${png} b/${png}\nnew file mode 100644\nBinary files /dev/null and b/${png} differ\n`,
      ),
    ).toEqual([]);
  });
  it('ignores non-test files', () => {
    expect(
      run(diff('apps/web/src/a.ts', { removed: ['expect(1).toBe(1);'], added: [markers[0]] })),
    ).toEqual([]);
  });
});

describe('coverage-ratchet', () => {
  it('reads the total line percentage', () => {
    expect(linesPct({ total: { lines: { pct: 81.5 } } })).toBe(81.5);
    expect(MAX_DROP).toBe(0.1);
  });
});
