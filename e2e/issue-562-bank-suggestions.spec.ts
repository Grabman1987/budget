import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-20' });

test('three prepared bank rows are explicitly reviewed with progress and individual Undo', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const { origin, databasePath } = isolatedLedger;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const account = (
    await post('/accounts', {
      name: 'Synthetic giro 562',
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: 100000,
    })
  ).account as { id: string };
  const group = (await post('/categories/groups', { name: 'Synthetic group 562' })).group;
  const category = (
    await post('/categories', {
      name: 'Synthetic category 562',
      class: 'need',
      groupId: group.id,
    })
  ).category;
  await post('/assignment-rules', {
    name: 'Synthetic rule 562',
    enabled: true,
    automatic: true,
    match: { mode: 'all', conditions: [{ type: 'contains', text: 'Rule 562' }] },
    actions: { categoryId: category.id },
  });
  const sourceId = randomUUID();
  const staged = openDatabase(databasePath);
  try {
    const consentId = randomUUID();
    staged.db
      .insert(schema.bankSyncConsent)
      .values({
        id: consentId,
        initiator: 'synthetic',
        stateHash: randomUUID(),
        label: 'Synthetic bank 562',
        expiresAt: '2027-01-01T00:00:00Z',
        nextRunAt: '2027-01-01T00:00:00Z',
      })
      .run();
    staged.db
      .insert(schema.bankSyncAccount)
      .values({
        id: sourceId,
        consentId,
        secret: 'synthetic-unused',
        label: 'Synthetic source 562',
        currency: 'EUR',
        accountId: account.id,
      })
      .run();
    createBooking(
      staged.db,
      {
        accountId: account.id,
        date: '2026-10-19',
        amountCents: -1201,
        memo: 'Merge 562',
        status: 'confirmed',
        splits: [{ amountCents: -1201, categoryId: category.id }],
      },
      { actor: 'synthetic-562' },
    );
    for (const [memo, amountCents] of [
      ['Merge 562', -1201],
      ['Rule 562', -2302],
      ['Category 562', -3403],
    ] as const) {
      const id = randomUUID();
      staged.db
        .insert(schema.bankSyncCandidate)
        .values({
          id,
          sourceId,
          accountId: account.id,
          dedupeKey: id,
          date: '2026-10-20',
          amountCents,
          currency: 'EUR',
          memo,
        })
        .run();
      staged.db
        .insert(schema.inboxItem)
        .values({
          id,
          kind: 'import',
          title: 'Bankumsatz prüfen',
          refType: 'bank-sync-candidate',
          refId: id,
          createdAt: '2026-10-20T08:00:00Z',
        })
        .run();
    }
  } finally {
    staged.close();
  }
  const balance = async () => {
    const response = await request.get(origin + '/api/accounts');
    expect(response.ok()).toBe(true);
    const accounts = (await response.json()).accounts as { id: string; balanceCents: number }[];
    return accounts.find((row) => row.id === account.id)!.balanceCents;
  };
  const writes: string[] = [];
  const reads: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.startsWith('/api/') && req.method() === 'GET')
      reads.push(new URL(req.url()).pathname);
    if (
      new URL(req.url()).pathname.startsWith('/api/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method())
    )
      writes.push(req.method());
  });
  await page.goto(`/konten/pruefen?bankSource=${sourceId}`);
  await expect(page.locator('.bank-inbox-row')).toHaveCount(3);
  await expect(page.getByText('3 offen · 0 von 3 geprüft')).toBeVisible();
  await expect(page.getByTestId('inbox-row').filter({ hasText: 'Merge 562' })).toContainText(
    'Mit Buchung',
  );
  await expect(page.getByTestId('inbox-row').filter({ hasText: 'Rule 562' })).toContainText(
    'Regel: Synthetic rule 562',
  );
  await expect(page.getByTestId('inbox-row').filter({ hasText: 'Category 562' })).toContainText(
    'Kategorie prüfen',
  );
  expect(writes).toEqual([]);
  expect(
    reads.some(
      (path) => path.includes('/matches') || path.includes('/assignment-rules/candidates/'),
    ),
  ).toBe(false);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    const smallTargets = await page
      .locator('.kinbox button, .kinbox summary, .kinbox .bank-select')
      .evaluateAll((nodes) =>
        nodes
          .filter(
            (node) =>
              node.getBoundingClientRect().height > 0 && node.getBoundingClientRect().height < 44,
          )
          .map((node) => node.textContent),
      );
    expect(smallTargets).toEqual([]);
    await page.screenshot({
      path: `test-results/issue-562-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  const mergeRow = page.getByTestId('inbox-row').filter({ hasText: 'Merge 562' });
  await mergeRow.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Buchung übernehmen' })).toBeVisible();
  expect(writes).toEqual([]);
  await page
    .getByRole('dialog', { name: 'Buchung übernehmen' })
    .getByRole('button', { name: 'Abbrechen' })
    .click();
  await expect(page.getByText('3 offen · 0 von 3 geprüft')).toBeVisible();
  expect(writes).toEqual([]);

  for (const [index, memo, expectedBalance] of [
    [1, 'Merge 562', 98799],
    [2, 'Rule 562', 96497],
    [3, 'Category 562', 93094],
  ] as const) {
    const row = page.getByTestId('inbox-row').filter({ hasText: memo });
    const accept = async () => {
      await row.getByRole('button', { name: 'Übernehmen', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Buchung übernehmen' });
      if (memo === 'Merge 562')
        await dialog.getByRole('button', { name: /Mit Buchung .* zusammenführen/ }).click();
      else {
        if (memo === 'Category 562')
          await dialog.getByRole('combobox', { name: 'Kategorie' }).selectOption(category.id);
        await dialog.getByRole('button', { name: 'Als Buchung bestätigen' }).click();
      }
      await expect(page.getByText(`${3 - index} offen · ${index} von 3 geprüft`)).toBeVisible();
      expect(await balance()).toBe(expectedBalance);
    };
    await accept();
    await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(page.getByText(`${4 - index} offen · ${index - 1} von 3 geprüft`)).toBeVisible();
    expect(await balance()).toBe(index === 1 ? 98799 : index === 2 ? 98799 : 96497);
    await accept();
  }
  const ambiguousId = randomUUID();
  const ambiguous = openDatabase(databasePath);
  try {
    for (const memo of ['Possible A 562', 'Possible B 562'])
      createBooking(
        ambiguous.db,
        {
          accountId: account.id,
          date: '2026-10-20',
          amountCents: -5505,
          memo,
          status: 'confirmed',
          splits: [{ amountCents: -5505, categoryId: category.id }],
        },
        { actor: 'synthetic-562' },
      );
    ambiguous.db
      .insert(schema.bankSyncCandidate)
      .values({
        id: ambiguousId,
        sourceId,
        accountId: account.id,
        dedupeKey: ambiguousId,
        date: '2026-10-20',
        amountCents: -5505,
        currency: 'EUR',
        memo: 'Ambiguous 562',
      })
      .run();
    ambiguous.db
      .insert(schema.inboxItem)
      .values({
        id: ambiguousId,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        refType: 'bank-sync-candidate',
        refId: ambiguousId,
      })
      .run();
  } finally {
    ambiguous.close();
  }
  await page.reload();
  const ambiguousRow = page.getByTestId('inbox-row').filter({ hasText: 'Ambiguous 562' });
  await expect(ambiguousRow).toContainText('Vorschlag prüfen · mehrere mögliche Buchungen');
  const writesBeforeAmbiguous = writes.length;
  await ambiguousRow.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Buchung übernehmen' })).toBeVisible();
  expect(writes).toHaveLength(writesBeforeAmbiguous);
  await page
    .getByRole('dialog', { name: 'Buchung übernehmen' })
    .getByRole('button', { name: 'Abbrechen' })
    .click();
  expect(writes).toHaveLength(writesBeforeAmbiguous);
});
