import { describe, expect, it } from 'vitest';
import { REQUIRED_CHECKS, decide } from './reuse-validated-tree.mjs';

const check = (name, over = {}) => ({
  name,
  id: 1,
  status: 'completed',
  conclusion: 'success',
  appSlug: 'github-actions',
  runPath: '.github/workflows/ci.yml',
  runEvent: 'pull_request',
  runHeadSha: 'h1',
  ...over,
});

const pull = (over = {}) => ({
  number: 7,
  sameRepo: true,
  headSha: 'h1',
  headTree: 't1',
  parentInHead: true,
  checks: REQUIRED_CHECKS.map((name) => check(name)),
  ...over,
});

const run = (over) => decide({ commitTree: 't1', pulls: [pull(over)] });

describe('decide', () => {
  it('reuses an identical tree whose PR head passed every required check', () => {
    expect(run()).toMatchObject({ reuse: true });
  });

  it('runs the full suite without an associated PR', () => {
    expect(decide({ commitTree: 't1', pulls: [] })).toMatchObject({ reuse: false });
  });

  it.each([
    ['fork PR', { sameRepo: false }],
    ['different tree', { headTree: 't2' }],
    ['PR head behind main', { parentInHead: false }],
    ['unreadable PR head', { headTree: undefined }],
    ['missing check', { checks: REQUIRED_CHECKS.slice(1).map((name) => check(name)) }],
    [
      'failed check',
      {
        checks: REQUIRED_CHECKS.map((n) =>
          check(n, n === 'docker' ? { conclusion: 'failure' } : {}),
        ),
      },
    ],
    [
      'unfinished check',
      { checks: REQUIRED_CHECKS.map((n) => check(n, { status: 'in_progress', conclusion: null })) },
    ],
    ['skipped check', { checks: REQUIRED_CHECKS.map((n) => check(n, { conclusion: 'skipped' })) }],
    ['foreign app', { checks: REQUIRED_CHECKS.map((n) => check(n, { appSlug: 'someone-else' })) }],
    [
      'other workflow',
      { checks: REQUIRED_CHECKS.map((n) => check(n, { runPath: '.github/workflows/x.yml' })) },
    ],
    [
      'push run, not PR run',
      { checks: REQUIRED_CHECKS.map((n) => check(n, { runEvent: 'push' })) },
    ],
    ['run of another sha', { checks: REQUIRED_CHECKS.map((n) => check(n, { runHeadSha: 'h0' })) }],
  ])('fails closed: %s', (_label, over) => {
    expect(run(over)).toMatchObject({ reuse: false });
  });

  it('judges the latest check-run per name, so a later failed re-run blocks reuse', () => {
    const checks = [
      ...REQUIRED_CHECKS.map((name) => check(name, { id: 1 })),
      check('check-windows', { id: 2, conclusion: 'failure' }),
    ];
    expect(run({ checks })).toMatchObject({ reuse: false });
  });

  it('accepts a later green re-run after an earlier failure', () => {
    const checks = [
      check('docker', { id: 1, conclusion: 'failure' }),
      ...REQUIRED_CHECKS.map((name) => check(name, { id: 2 })),
    ];
    expect(run({ checks })).toMatchObject({ reuse: true });
  });

  it('one qualifying PR is enough', () => {
    const bad = pull({ number: 8, headTree: 'tx' });
    expect(decide({ commitTree: 't1', pulls: [bad, pull()] })).toMatchObject({ reuse: true });
  });
});
