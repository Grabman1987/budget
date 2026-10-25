import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedPaths, planChanges, verificationPassed } from './change-plan.mjs';

describe('verification lane selection', () => {
  it('limits docs to non-executable documentation', () => {
    expect(planChanges(['README.md', 'docs/portfolio-funding-plan.md']).lane).toBe('docs');
  });
  it('maps the complete planner UI flow, including its existing savings form', () => {
    expect(
      planChanges([
        'apps/web/src/wealth/funding-plan.css',
        'apps/web/src/wealth/funding-plan.tsx',
        'docs/example.md',
      ]),
    ).toMatchObject({
      lane: 'ui',
      shards: [1],
      specs: ['e2e/funding-plan.spec.ts', 'e2e/savings-plans.spec.ts'],
    });
  });
  it.each([
    'packages/domain/src/invest/funding-plan.ts',
    'packages/db/src/repos/funding-plan.ts',
    'apps/server/src/api/invest.ts',
    'apps/web/src/auth/auth.tsx',
    'apps/web/src/styles.css',
    'apps/web/src/pages/reports-pages.tsx',
    'package-lock.json',
    'Dockerfile',
    '.github/workflows/ci.yml',
    'scripts/ci/change-plan.mjs',
    'docs/queue/README.md',
    'docs/ops.md',
    'AGENTS.md',
    'CLAUDE.md',
    'SPEC.md',
    'e2e/funding-plan.spec.ts',
    'e2e/shell.spec.ts-snapshots/example.png',
    'docs/example.mjs',
    'unknown.txt',
    '../README.md',
    'docs/../README.md',
    'docs//readme.md',
    '/README.md',
    'docs/a\nb.md',
  ])('uses full coverage when %s is included, even alongside allowed files', (path) => {
    expect(
      planChanges(['docs/example.md', 'apps/web/src/wealth/funding-plan.css', path]).lane,
    ).toBe('full');
  });
  it.each(['push', 'schedule', 'workflow_dispatch', 'unknown'])(
    'forces full coverage for %s',
    (event) => {
      expect(planChanges(['README.md'], event)).toMatchObject({
        lane: 'full',
        shards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      });
    },
  );
  it.each([[], null, [null], ['']])('fails closed for missing/malformed evidence %j', (paths) => {
    expect(planChanges(paths).lane).toBe('full');
  });
  it('includes deleted executable paths when renamed into documentation, and uses the PR merge base', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'budget-change-plan-'));
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    try {
      git('init', '-b', 'main');
      git('config', 'user.email', 'test@example.invalid');
      git('config', 'user.name', 'Synthetic CI Test');
      writeFileSync(join(cwd, 'source.ts'), 'export const value = 1;\n');
      git('add', '.');
      git('commit', '-m', 'base');
      git('switch', '-c', 'feature');
      git('mv', 'source.ts', 'README.md');
      git('commit', '-m', 'rename');
      const head = git('rev-parse', 'HEAD');
      git('switch', 'main');
      writeFileSync(join(cwd, 'unrelated.ts'), 'export {};\n');
      git('add', '.');
      git('commit', '-m', 'advance main');
      const paths = changedPaths('main', head, cwd);
      expect(paths.sort()).toEqual(['README.md', 'source.ts']);
      expect(planChanges(paths).lane).toBe('full');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('required status aggregates', () => {
  const needsFor = (lane) => ({
    reuse: { result: 'skipped', outputs: {} },
    plan: { result: 'success', outputs: { lane } },
    static: { result: 'success' },
    unit: { result: lane === 'docs' ? 'skipped' : 'success' },
    e2e: { result: lane === 'docs' ? 'skipped' : 'success' },
    visual: { result: lane === 'full' ? 'success' : 'skipped' },
    'windows-unit': { result: lane === 'full' ? 'success' : 'skipped' },
  });
  it.each(['docs', 'ui', 'full'])('accepts exactly the documented %s coverage', (lane) => {
    expect(verificationPassed(needsFor(lane))).toBe(true);
    expect(verificationPassed(needsFor(lane), true)).toBe(true);
  });
  it.each(['static', 'unit', 'e2e', 'visual', 'windows-unit', 'plan'])(
    'rejects a failed, cancelled or unexpectedly skipped %s',
    (job) => {
      for (const result of ['failure', 'cancelled', 'skipped']) {
        const needs = needsFor('full');
        needs[job].result = result;
        expect(verificationPassed(needs, job === 'windows-unit')).toBe(false);
      }
    },
  );
  it('does not turn missing or unknown plan evidence into a fast lane', () => {
    for (const lane of ['', undefined, 'anything']) {
      expect(verificationPassed(needsFor(lane))).toBe(false);
      expect(verificationPassed(needsFor(lane), true)).toBe(false);
    }
  });
  it('accepts reuse only with its successful decision and all covered jobs skipped', () => {
    const needs = needsFor('full');
    for (const job of ['plan', 'static', 'unit', 'e2e', 'visual', 'windows-unit'])
      needs[job].result = 'skipped';
    needs.reuse = { result: 'success', outputs: { reuse: 'true' } };
    expect(verificationPassed(needs)).toBe(true);
    expect(verificationPassed(needs, true)).toBe(true);
    needs.reuse.result = 'failure';
    expect(verificationPassed(needs)).toBe(false);
  });
});
