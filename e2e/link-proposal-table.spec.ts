import {
  accounts,
  categories,
  categoryGroup,
  createBooking,
  createEntity,
  createExpectedPayment,
  matchOccurrences,
  openDatabase,
  payee,
} from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

const today = '2026-11-20';
const ctx = { actor: 'synthetic-link-table' };
test.use({ ledgerToday: today });

test('recurring-payment proposals are a compact table with direct choices', async ({
  page,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  const { db } = opened;
  accounts.create(
    db,
    {
      id: 'lp-account',
      name: 'Muster Prüfkonto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2025-01-01',
      openingBalanceCents: 100000,
    },
    ctx,
  );
  createEntity(db, categoryGroup, { id: 'lp-group', name: 'Muster Gruppe' }, ctx);
  createEntity(db, payee, { id: 'lp-payee', name: 'Muster GmbH' }, ctx);
  categories.create(
    db,
    {
      id: 'lp-category',
      groupId: 'lp-group',
      name: 'Muster Abos',
      kind: 'fixed',
      class: 'need',
      inflationTrailingMean: false,
    },
    ctx,
  );
  for (const [id, name] of [
    ['lp-a', 'Muster Abo A'],
    ['lp-b', 'Muster Abo B'],
  ] as const)
    createExpectedPayment(
      db,
      {
        id,
        name,
        categoryId: 'lp-category',
        accountId: 'lp-account',
        payeeId: 'lp-payee',
        kind: 'outflow',
        rhythm: 'monthly',
        dueDay: 22,
        startDate: '2026-11-01',
      },
      { validFrom: '2026-11-01', amountCents: 2800 },
      ctx,
      today,
    );
  for (const date of ['2026-11-22'])
    createBooking(
      db,
      {
        accountId: 'lp-account',
        date,
        payeeId: 'lp-payee',
        amountCents: -2800,
        splits: [{ categoryId: 'lp-category', amountCents: -2800 }],
      },
      ctx,
    );
  matchOccurrences(db, today);
  opened.close();

  await page.goto('/konten/pruefen?teil=aufgaben');
  const sources = page.getByRole('region', { name: 'Aufgaben nach Quelle' });
  await sources.getByRole('button', { name: 'Prüfen · Plan', exact: true }).click();
  const table = page.getByRole('table', { name: 'Wiederkehrende Zahlungen zuordnen' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Erwartet' })).toBeVisible();
  const rows = table.locator('tbody tr');
  await expect(rows.first()).toContainText('Muster Abo');
  await expect(table).not.toContainText('2026-11');
  await expect(page.getByText('Abbuchung zuordnen', { exact: true })).toHaveCount(0);
  await expect(rows.first().getByRole('button', { name: 'Zuordnen' })).toBeVisible();
  await expect(rows.first().getByRole('button', { name: 'Ablehnen' })).toBeVisible();
  const box = await rows.first().boundingBox();
  if (page.viewportSize()!.width > 700) expect(box!.height).toBeLessThan(80);
  await page.screenshot({ path: info.outputPath('link-proposal-table.png'), fullPage: true });
});
