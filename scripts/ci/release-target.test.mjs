import { expect, it } from 'vitest';
import { releaseAllowed } from './release-target.mjs';
const sha = 'a'.repeat(40);
const run = {
  databaseId: 1,
  headSha: sha,
  headBranch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
};
it('releases the exact verified main candidate', () => {
  expect(releaseAllowed({ revision: sha, main: sha, runs: [run] })).toBe(true);
});
it.each(['failure', 'cancelled', 'timed_out', 'skipped', ''])(
  'blocks latest %s despite earlier success',
  (conclusion) => {
    expect(
      releaseAllowed({
        revision: sha,
        main: sha,
        runs: [run, { ...run, databaseId: 2, conclusion }],
      }),
    ).toBe(false);
  },
);
it.each(['main', 'a'.repeat(7), '', 'b'.repeat(40)])(
  'rejects invalid or stale revision %s',
  (revision) => {
    expect(releaseAllowed({ revision, main: sha, runs: [run] })).toBe(false);
  },
);
it.each([
  { event: 'pull_request' },
  { headBranch: 'other' },
  { headSha: 'b'.repeat(40) },
  { status: 'in_progress' },
])('rejects unrelated or unfinished CI %j', (change) => {
  expect(releaseAllowed({ revision: sha, main: sha, runs: [{ ...run, ...change }] })).toBe(false);
});
it('rejects missing CI', () =>
  expect(releaseAllowed({ revision: sha, main: sha, runs: [] })).toBe(false));
