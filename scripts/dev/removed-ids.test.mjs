import { describe, expect, it } from 'vitest';
import { removedTokens, staleReferences } from './removed-ids.mjs';

const diff = [
  'diff --git a/apps/web/src/reports/finanzcheck.tsx b/apps/web/src/reports/finanzcheck.tsx',
  '--- a/apps/web/src/reports/finanzcheck.tsx',
  '+++ b/apps/web/src/reports/finanzcheck.tsx',
  '-  <svg data-testid="r07-balance-chart">',
  '-  <AppLink to="/reports/prendite">',
  '+  <svg data-testid="balance-history">',
  'diff --git a/e2e/heute.spec.ts b/e2e/heute.spec.ts',
  '--- a/e2e/heute.spec.ts',
  '+++ b/e2e/heute.spec.ts',
  "-await page.goto('/reports/old-only-in-spec');",
].join('\n');

describe('removed identifiers', () => {
  it('collects test ids and routes removed from application code only', () => {
    expect(removedTokens(diff)).toEqual(['/reports/prendite', 'r07-balance-chart']);
  });

  it('ignores removed lines in test files', () => {
    expect(removedTokens(diff)).not.toContain('/reports/old-only-in-spec');
  });

  it('flags only tokens that are gone from the app and still used by an untouched spec', () => {
    const stale = staleReferences(['r07-balance-chart', '/reports/prendite', 'unused-id'], {
      stillInApp: (t) => t === '/reports/prendite',
      specsMentioning: (t) =>
        t === 'r07-balance-chart' ? ['e2e/pace.spec.ts', 'e2e/heute.spec.ts'] : [],
      changedSpecs: ['e2e/heute.spec.ts'],
    });
    expect(stale).toEqual([{ token: 'r07-balance-chart', specs: ['e2e/pace.spec.ts'] }]);
  });

  it('accepts a migration done in the same change', () => {
    expect(
      staleReferences(['gone-id'], {
        stillInApp: () => false,
        specsMentioning: () => ['e2e/a.spec.ts'],
        changedSpecs: ['e2e/a.spec.ts'],
      }),
    ).toEqual([]);
  });

  it('sees test ids in a deleted file (+++ /dev/null)', () => {
    const deleted = [
      'diff --git a/apps/web/src/a.tsx b/apps/web/src/a.tsx',
      'deleted file mode 100644',
      '--- a/apps/web/src/a.tsx',
      '+++ /dev/null',
      '-<i data-testid="gone-id1" />',
    ].join('\n');
    expect(removedTokens(deleted)).toEqual(['gone-id1']);
  });

  it('honours an explicit allow list', () => {
    expect(
      staleReferences(['legacy-id'], {
        stillInApp: () => false,
        specsMentioning: () => ['e2e/redirect.spec.ts'],
        changedSpecs: [],
        allowed: ['legacy-id'],
      }),
    ).toEqual([]);
  });
});
