import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { setTheme } from './theme';

test.use({ ledgerToday: '2026-10-20', bankingConfigured: true });

test('a matching transfer rule displays one state on the phone grid and waits for confirmation', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const { origin, databasePath } = isolatedLedger;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account: source } = await post('/accounts', {
    name: 'Synthetic giro',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 10000,
  });
  const { account: destination } = await post('/accounts', {
    name: 'Synthetic depot',
    type: 'brokerage',
    openingDate: '2026-10-01',
  });
  await post('/assignment-rules', {
    name: 'Synthetic transfer',
    enabled: true,
    automatic: false,
    match: { mode: 'all', conditions: [{ type: 'contains', text: 'Synthetic platform' }] },
    actions: { transferAccountId: destination.id },
  });
  const id = randomUUID();
  const opened = openDatabase(databasePath);
  try {
    opened.db
      .insert(schema.bankSyncCandidate)
      .values({
        id,
        accountId: source.id,
        dedupeKey: id,
        date: '2026-10-20',
        amountCents: -1201,
        currency: 'EUR',
        memo: 'Synthetic platform',
      })
      .run();
    opened.db
      .insert(schema.inboxItem)
      .values({
        id,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        refType: 'bank-sync-candidate',
        refId: id,
      })
      .run();
  } finally {
    opened.close();
  }
  const balances = async () => {
    const response = await request.get(origin + '/api/accounts');
    expect(response.ok()).toBe(true);
    const { accounts } = (await response.json()) as {
      accounts: { id: string; balanceCents: number }[];
    };
    return [source.id, destination.id].map(
      (accountId) => accounts.find(({ id }) => id === accountId)?.balanceCents,
    );
  };
  await page.goto('/konten/pruefen');
  const row = page.getByTestId('inbox-row').filter({ hasText: 'Synthetic platform' });
  const confirm = row.getByRole('button', { name: /^Vorschlag bestätigen/ });
  await expect(
    row.getByRole('button', {
      name: 'Vorschlag bestätigen: Überweisung an Synthetic depot',
    }),
  ).toBeVisible();
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await expect(row.locator('.bank-suggestion-pill')).toHaveCount(1);
    await expect(row).not.toContainText(/Empfänger fehlt|Kategorie fehlt|Kategorie prüfen/);
    await expect(confirm).toBeEnabled();
    expect(await balances()).toEqual([10000, 0]);
    const actual = await row.evaluate((element) => {
      const rect = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
      const phone = innerWidth < 768;
      const date = rect('.bank-v1-meta > span');
      const account = rect('.bank-v1-phone-source');
      const button = rect('.kstatus-btn');
      return {
        fits: element.getBoundingClientRect().right <= innerWidth,
        sameBaseline: !phone || Math.abs(date.top - account.top) <= 1,
        target: button.height >= 44 && button.width >= 44,
      };
    });
    expect(actual).toEqual({ fits: true, sameBaseline: true, target: true });
  }
  const confirmation = page.waitForResponse(
    (response) =>
      response.url().endsWith('/' + id + '/confirm') && response.request().method() === 'POST',
  );
  await confirm.click();
  const response = await confirmation;
  expect(response.ok()).toBe(true);
  expect(await balances()).toEqual([8799, 1201]);
  await post('/undo', { groupId: (await response.json()).groupId });
  expect(await balances()).toEqual([10000, 0]);
});
