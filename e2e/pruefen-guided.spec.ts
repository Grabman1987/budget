import { redesignLoaded } from './ledger-helpers';
import { expect, test } from '@playwright/test';

/**
 * Issue #1054: guided Prüfen ("Prüfen durchgehen"). The API is stubbed with synthetic bank lines so
 * the spec writes no shared server state. Desktop and 390 px phone run the same flow.
 */

const line = (id: string, date: string, payee: string, amountCents: number) => ({
  type: 'stored',
  id,
  kind: 'import',
  title: 'Synthetic movement',
  detail: null,
  refType: 'bank-sync-candidate',
  refId: id,
  urgent: false,
  createdAt: `${date}T12:00:00Z`,
  bankCandidate: {
    date,
    amountCents,
    currency: 'EUR',
    memo: 'Synthetic memo',
    payeeName: payee,
    accountName: 'Girokonto A',
  },
});
const rule = {
  id: 'rule-a',
  name: 'Shop A zuordnen',
  revision: 'r1',
  automatic: true,
  actions: { categoryId: null },
};

test('guided Prüfen: one line at a time, failed confirm stays actionable, summary and exit', async ({
  page,
}) => {
  let queue = [
    line('c-1', '2026-09-01', 'Shop A', -1201),
    line('c-2', '2026-09-02', 'Shop B', -2500),
    line('c-3', '2026-09-03', 'Shop C', -300),
  ];
  let failNext = true;
  const confirmed: string[] = [];
  await page.route(/\/api\/inbox\?/, (route) =>
    route.fulfill({
      json: {
        asOf: '2026-09-17',
        count: queue.length + 2,
        entries: queue,
        overspentSummary: null,
        readSourceSummaries: [],
        segment: 'umsaetze',
        segments: { umsaetze: queue.length, aufgaben: 2 },
        taskSources: { accounts: 0, receipts: 0, plan: 0, payslips: 0, other: 2 },
        totalEntries: queue.length,
        countsByKind: {},
        countsByCause: {},
        limit: 100,
        offset: 0,
        next: null,
      },
    }),
  );
  await page.route(/\/api\/inbox\/count/, (route) =>
    route.fulfill({ json: { asOf: '2026-09-17', count: queue.length + 2 } }),
  );
  await page.route(/\/api\/assignment-rules\/candidates\/c-\d/, (route) => {
    const id = route.request().url().split('/').pop();
    return route.fulfill({
      json: {
        candidate: {},
        candidateRevision: 'rev',
        cleanup: { payeeId: null },
        existingTransfer: null,
        suggestions: id === 'c-2' ? [] : [rule],
      },
    });
  });
  await page.route(/\/api\/bank-sync\/candidates\/c-\d\/matches/, (route) =>
    route.fulfill({ json: { merge: [], link: [], transfers: [] } }),
  );
  await page.route(/\/api\/bank-sync\/candidates\/c-\d\/confirm/, (route) => {
    if (failNext) {
      failNext = false;
      return route.fulfill({ status: 500, json: { error: 'internal' } });
    }
    const id = route.request().url().split('/').at(-2)!;
    confirmed.push(id);
    queue = queue.filter((item) => item.id !== id);
    return route.fulfill({ json: { groupId: 'g-1', bookingId: 'b-1' } });
  });

  await page.goto('/konten/pruefen');
  if (!(await redesignLoaded(page))) test.skip(true, 'guided mode is part of the redesign build');
  await page.getByRole('link', { name: 'Prüfen durchgehen' }).click();
  await expect(page).toHaveURL(/modus=gefuehrt/);

  // Oldest first with progress; the facts and the primary action are visible without scrolling.
  const card = page.locator('.guided-card');
  await expect(card.getByRole('heading', { name: 'Shop A' })).toBeVisible();
  await expect(page.locator('.guided-progress')).toContainText('1 von 3');
  // Facts and primary actions fit the viewport without scrolling (measured after fonts settle).
  await page.evaluate(() => document.fonts.ready);
  for (const locator of [
    card.getByRole('heading', { name: 'Shop A' }),
    card.getByText('−12,01 €'),
    card.getByText('Girokonto A'),
    card.getByText('Shop A zuordnen'),
    card.getByRole('button', { name: 'Bestätigen' }),
    card.getByRole('button', { name: 'Später' }),
  ])
    await expect(locator).toBeInViewport({ ratio: 1 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Esc inside the edit dialog closes only the dialog and keeps the guided pass.
  await card.getByRole('button', { name: 'Bearbeiten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Buchung übernehmen' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/modus=gefuehrt/);
  await expect(card.getByRole('heading', { name: 'Shop A' })).toBeVisible();

  // A failed confirmation keeps the line, shows the error and stays actionable.
  const confirm = card.getByRole('button', { name: 'Bestätigen' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(card.getByRole('alert')).toContainText('Der Umsatz bleibt offen');
  await expect(card.getByRole('heading', { name: 'Shop A' })).toBeVisible();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(card.getByRole('heading', { name: 'Shop B' })).toBeVisible();
  expect(confirmed).toEqual(['c-1']);

  // No rule: "Unbekannt" with its reason, direct confirmation held back; defer with a reason.
  await expect(card.getByText('Unbekannt')).toBeVisible();
  await expect(card.getByText(/Keine Regel passt/)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Bestätigen' })).toBeDisabled();
  await card.getByRole('button', { name: 'Später' }).click();
  await card.getByLabel('Grund für später').selectOption('Beleg fehlt');
  await card.getByRole('button', { name: 'Zurückstellen' }).click();
  await expect(card.getByRole('heading', { name: 'Shop C' })).toBeVisible();

  // Keyboard: Enter confirms the last line, which ends the pass in the summary.
  await expect(card.getByRole('button', { name: 'Bestätigen' })).toBeEnabled();
  const summary = page.locator('.guided-summary');
  // Enter is armed shortly after the line settled; retry until it is.
  await expect(async () => {
    await page.keyboard.press('Enter');
    await expect(summary).toBeVisible({ timeout: 400 });
  }).toPass();
  await expect(summary.getByRole('heading', { name: 'Zusammenfassung' })).toBeVisible();
  await expect(summary.locator('.guided-counts')).toContainText('Erledigt');
  // Counts in order: erledigt, zurückgestellt, noch offen.
  const counts = summary.locator('.guided-counts dd');
  await expect(counts.nth(0)).toHaveText('2');
  await expect(counts.nth(1)).toHaveText('1');
  await expect(summary).toContainText('Shop B');
  await expect(summary.getByRole('link', { name: 'Zu den Aufgaben (2)' })).toBeVisible();
  await expect(summary.getByRole('link', { name: 'Zu Heute' })).toBeVisible();

  // Esc leaves to the list view; the list stays available.
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/modus=gefuehrt/);
  await expect(page.getByRole('link', { name: 'Prüfen durchgehen' })).toBeVisible();
});
