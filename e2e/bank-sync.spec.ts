import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('bank source callback, mapping, queue action and responsive review', async ({
  page,
}, info) => {
  const bank = page.getByRole('region', { name: 'Bank-Sync (PSD2)', exact: true });
  const calls: { path: string; body: unknown }[] = [];
  const status = {
    configured: true,
    accounts: [
      { id: 'synthetic-account', name: 'Girokonto A', currency: 'EUR', openingDate: '2023-10-01' },
    ],
    connections: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        label: 'Bank A · AT',
        status: 'active',
        validUntil: '2027-03-20T00:00:00Z',
        lastAttemptAt: '2026-10-01T02:30:00Z',
        lastSuccessAt: '2026-10-01T02:31:00Z',
        nextRunAt: '2026-10-02T02:30:00Z',
        accounts: [
          {
            id: '10000000-0000-4000-8000-000000000002',
            label: 'Konto A',
            currency: 'EUR',
            accountId: null,
            fromDate: null,
            locked: false,
          },
        ],
      },
    ],
  };
  await page.route('**/api/bank-sync**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') {
      calls.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ json: { queued: true, groupId: 'synthetic-group' } });
    }
    return route.fulfill({ json: status });
  });
  await page.goto(
    '/einstellungen/datenquellen?code=synthetic-code&state=synthetic-callback-state-0000000000',
  );
  await page.getByRole('button', { name: 'Bankfreigabe abschließen' }).click();
  await expect(
    page.getByText('Bankfreigabe gespeichert. Bitte die Konten zuordnen.'),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  expect(calls[0]).toEqual({
    path: '/api/bank-sync/callback',
    body: { code: 'synthetic-code', state: 'synthetic-callback-state-0000000000' },
  });
  await page.getByLabel('Konto in Budget').selectOption('synthetic-account');
  await page.getByLabel('Umsätze ab').fill('2026-09-01');
  await page.getByRole('button', { name: 'Konto zuordnen' }).click();
  await expect(page.getByText('Kontozuordnung gespeichert.')).toBeVisible();
  expect(calls[1]?.body).toEqual({ accountId: 'synthetic-account', fromDate: '2026-09-01' });
  await bank.getByRole('button', { name: 'Jetzt abrufen' }).click();
  await expect(page.getByText('Abruf vorgemerkt.', { exact: false })).toBeVisible();
  expect(calls[2]?.path).toContain('/sync');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).include('.data-sources').analyze()).violations).toEqual(
    [],
  );
  await page.getByRole('heading', { name: 'Bank-Sync (PSD2)' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/bank-sync-' + info.project.name + '-light.png',
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset['theme'] = 'dark';
  });
  await page.screenshot({
    path: 'test-results/bank-sync-' + info.project.name + '-dark.png',
    fullPage: true,
  });
});

test('bank inbox suggestion requires an explicit posting decision', async ({ page }) => {
  const candidateId = '10000000-0000-4000-8000-000000000003';
  let confirmed = false;
  await page.route('**/api/inbox', (route) =>
    route.fulfill({
      json: {
        asOf: '2026-10-01',
        count: confirmed ? 0 : 1,
        entries: confirmed
          ? []
          : [
              {
                id: candidateId,
                type: 'stored',
                kind: 'import',
                title: 'Bankumsatz prüfen',
                detail: 'Girokonto A · 30.09.2026 · −12,01 € · Shop A',
                refType: 'bank-sync-candidate',
                refId: candidateId,
                urgent: false,
                createdAt: '2026-10-01T02:30:00Z',
              },
            ],
      },
    }),
  );
  await page.route('**/api/bank-sync/candidates/**/confirm', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      categoryId: null,
      actions: { categoryId: null, payeeId: null },
      candidateRevision: 'a'.repeat(64),
    });
    confirmed = true;
    return route.fulfill({ json: { groupId: 'synthetic-confirm-group' } });
  });
  await page.route('**/api/assignment-rules/candidates/**', (route) =>
    route.fulfill({
      json: {
        candidate: { id: candidateId },
        candidateRevision: 'a'.repeat(64),
        cleanup: { cleaned: 'Shop A', payeeId: null, payeeName: null, learned: false },
        suggestions: [],
        existingTransfer: null,
      },
    }),
  );
  await page.goto('/konten/posteingang');
  await expect(page.getByText('Bankumsatz prüfen', { exact: true })).toBeVisible();
  expect(confirmed).toBe(false);
  await expect(page.getByRole('button', { name: 'Nicht übernehmen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Als Buchung bestätigen' }).click();
  await expect(page.getByText('Posteingang leer.', { exact: false })).toBeVisible();
  expect(confirmed).toBe(true);
});
