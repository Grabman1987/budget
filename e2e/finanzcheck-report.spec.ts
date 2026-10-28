import {
  DEFAULT_ACTIVE_RULE_COUNT,
  dayCounts,
  ruleTimelines,
  type HistoryMatrix,
} from '@budget/domain';
import type { FinanceCheckFull } from '../apps/web/src/reports/finanzcheck-api';
import type { Heute } from '../apps/web/src/heute/api';
import { expect as baseExpect, sampleTest as test, SAMPLE_URL } from './sample';
import { inspectReport } from './overview-report';

// The sample server evaluates the rules synchronously (seconds) the first time a report finds the
// stored results stale, and every request waits for it: generous timeouts instead of retries.
const expect = baseExpect.configure({ timeout: 60_000 });
test.describe.configure({ timeout: 150_000 });

// Report 5.2 on the seeded sample server (17.09.2026): stored rule results of 12 month ends and
// today, read through the real /api/rules endpoints.
test('retired Finanz-Check bookmark opens Heute while real history retains stage, dates and current counts', async ({
  page,
}, info) => {
  // The retired reader invoked this same idempotent derivation before reading stored history.
  const derived = await page.request.post('/api/rules/evaluate', {
    headers: { origin: SAMPLE_URL },
    timeout: 90_000,
  });
  expect(derived.status()).toBe(200);
  const response = await page.request.get('/api/rules/results', { timeout: 90_000 });
  expect(response.status()).toBe(200);
  const matrix = (await response.json()) as HistoryMatrix;
  const days = matrix.days;
  expect(days).toEqual([
    '2025-09-30',
    '2025-10-31',
    '2025-11-30',
    '2025-12-31',
    '2026-01-31',
    '2026-02-28',
    '2026-03-31',
    '2026-04-30',
    '2026-05-31',
    '2026-06-30',
    '2026-07-31',
    '2026-08-31',
    '2026-09-17',
  ]);
  const checkResponse = await page.request.get('/api/rules/check');
  expect(checkResponse.status()).toBe(200);
  const check = (await checkResponse.json()) as FinanceCheckFull;
  expect([1, 2, 3]).toContain(check.stage.stage);
  expect(check.stage.label.length).toBeGreaterThan(0);
  expect(check.counts.ok).toBeGreaterThan(0);
  expect(matrix.rules).toHaveLength(DEFAULT_ACTIVE_RULE_COUNT);
  const lines = ruleTimelines(matrix);
  expect(lines).toHaveLength(DEFAULT_ACTIVE_RULE_COUNT);
  for (const line of lines) {
    expect(line.code).toMatch(/^R\d\d$/);
    expect(line.strip).toHaveLength(13);
    expect(line.strip.map((cell) => cell.asOf)).toEqual(days);
  }
  expect(dayCounts(matrix).at(-1)).toEqual({
    asOf: '2026-09-17',
    ok: check.counts.ok,
    warn: check.counts.warn,
    bad: check.counts.bad,
    notEvaluated: check.counts.notEvaluated,
  });
  const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/heute');
  await page.goto('/reports/finanzcheck');
  const heute = (await (await loaded).json()) as Heute;
  await expect(page).toHaveURL(/\/$/);
  expect(days.at(-1)).toBe('2026-09-17');
  expect(days).toHaveLength(13);

  expect('unavailable' in heute.financeCheck).toBe(false);
  if ('unavailable' in heute.financeCheck) throw new Error('Synthetic rule check unavailable');
  expect(heute.financeCheck.counts).toMatchObject(check.counts);
  const rules = heute.financeCheck.actionRules.filter((rule) => rule.status === 'bad');
  if (rules.length) {
    const row = page.locator('.attention-row', { hasText: /Regelbefund/ });
    const remaining = page.locator('.attention-remaining > summary');
    if (!(await row.isVisible()) && (await remaining.isVisible())) await remaining.click();
    await expect(row).toContainText(String(rules.length));
    const action = row.getByRole('link', { name: 'Handeln', exact: true });
    await expect(action).toHaveAttribute(
      'href',
      `/einstellungen/regelwerk#rule-result-${rules[0]!.code}`,
    );
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await action.focus();
    await expect(action).toBeFocused();
  } else {
    await expect(page.locator('.attention-row', { hasText: /Regelbefund/ })).toHaveCount(0);
  }
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await inspectReport(page, info, 'finanzcheck');
});
