import { accountBankReview, bankPreviewControl, toast } from './ledger-helpers';

import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17', bankingConfigured: true });

test('K5: safe source-backed rule preview is read-only until confirmation and uses one Undo', async ({
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
  const longPayee =
    'Synthetic safe merchant with an exceptionally long invoice and payment reference';
  const longRule = 'Synthetic explicit rule with a long household allocation description';
  const { account } = await post('/accounts', {
    name: 'Synthetic Account with a long descriptive household current account label',
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const { group } = await post('/categories/groups', { name: 'Synthetic group' });
  const { category } = await post('/categories', {
    name: 'Synthetic category',
    class: 'need',
    groupId: group.id,
  });
  await post('/assignment-rules', {
    name: longRule,
    enabled: true,
    automatic: true,
    match: { mode: 'all', conditions: [{ type: 'contains', text: 'Synthetic safe' }] },
    actions: { categoryId: category.id },
  });
  const consentId = randomUUID(),
    sourceId = randomUUID();
  const opened = openDatabase(databasePath);
  try {
    opened.db
      .insert(schema.bankSyncConsent)
      .values({
        id: consentId,
        initiator: 'synthetic',
        stateHash: randomUUID(),
        label: 'Synthetic source',
        expiresAt: '2027-01-01T00:00:00Z',
        nextRunAt: '2027-01-01T00:00:00Z',
      })
      .run();
    opened.db
      .insert(schema.bankSyncAccount)
      .values({
        id: sourceId,
        consentId,
        secret: 'synthetic-unused',
        label: 'Synthetic source account',
        currency: 'EUR',
        accountId: account.id,
      })
      .run();
    for (const memo of [longPayee, 'Synthetic ambiguous']) {
      const id = randomUUID();
      opened.db
        .insert(schema.bankSyncCandidate)
        .values({
          id,
          sourceId,
          accountId: account.id,
          dedupeKey: id,
          date: '2026-09-17',
          amountCents: -1201,
          currency: 'EUR',
          memo,
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
          createdAt: '2026-09-17T12:00:00Z',
        })
        .run();
    }
  } finally {
    opened.close();
  }
  await page.goto(`/konten/pruefen?bankSource=${sourceId}`);
  await expect(page.locator('.bank-inbox-row')).toHaveCount(2);
  const redesign = (await page.locator('[data-budget-redesign="1"]').count()) > 0;
  const shortcut = page.getByRole('button', { name: /Alle sicheren bestätigen/ });
  await expect(shortcut).toHaveCount(redesign ? 1 : 0);
  if (!redesign) return;
  await expect(shortcut).toHaveText('Alle sicheren bestätigen (0)');
  const originalViewport = page.viewportSize()!;
  for (const path of [`/konten/pruefen?bankSource=${sourceId}`, `/konten/${account.id}`]) {
    await page.goto(path);
    if (!path.startsWith('/konten/pruefen')) await accountBankReview(page);
    for (const width of [390, 768, 871, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const row = page.locator('.bank-v1-row').filter({ hasText: longPayee });
      await expect(row).toBeVisible();
      await expect(row.locator('.bank-v1-payee strong')).toHaveText(longPayee);
      await expect(row.locator('.bank-v1-payee strong')).toHaveCSS('display', 'block');
      if (path.startsWith('/konten/pruefen')) {
        if (width >= 768) await expect(page.getByLabel('Datumssortierung')).toBeVisible();
        const toolbar = page.locator('.konten-frame-inbox .konten-view-bar');
        const layout = await toolbar.evaluate((element) => {
          const controls = [
            ...element.querySelectorAll<HTMLElement>('button, select, summary'),
          ].filter((control) => control.getClientRects().length > 0);
          const insideViewport = controls.every((control) => {
            const box = control.getBoundingClientRect();
            return box.left >= 0 && box.right <= innerWidth;
          });
          const readableSegments = [...element.querySelectorAll('.inbox-segments button')].every(
            (button) => {
              const range = document.createRange();
              range.selectNodeContents(button);
              const text = range.getBoundingClientRect(),
                box = button.getBoundingClientRect();
              return text.left >= box.left && text.right <= box.right;
            },
          );
          return { insideViewport, readableSegments };
        });
        expect(layout).toEqual({ insideViewport: true, readableSegments: true });
        await expect(
          toolbar.getByRole('button', { name: /Alle sicheren bestätigen/ }),
        ).toBeVisible();
        await expect(toolbar.getByLabel('Auswahl (0)', { exact: true })).toBeVisible();
      }

      const geometry = await row.evaluate((element) => {
        const within = (child: Element, parent: Element) => {
          const a = child.getBoundingClientRect(),
            b = parent.getBoundingClientRect();
          return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
        };
        const payee = element.querySelector('.bank-v1-payee')!;
        const amount = element.querySelector('.bank-v1-amount')!;
        const action = element.querySelector('.bank-v1-action')!;
        const payeeText = element.querySelector('.bank-v1-payee strong')!;
        const date = element.querySelector('.bank-v1-payee > span')!;
        const a = payeeText.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(amount);
        const money = text.getBoundingClientRect(),
          moneyCell = amount.getBoundingClientRect();
        return {
          payee: within(payeeText, payee),
          date: within(date, payee),
          amount: money.left >= moneyCell.left && money.right <= moneyCell.right,
          action: within(action.querySelector('button')!, action),
          separate:
            a.right <= money.left ||
            a.left >= money.right ||
            a.bottom <= money.top ||
            a.top >= money.bottom,
          page: document.documentElement.scrollWidth <= innerWidth,
        };
      });
      expect(geometry).toEqual({
        payee: true,
        date: true,
        amount: true,
        action: true,
        separate: true,
        page: true,
      });
      if (width >= 768 && path.startsWith('/konten/pruefen'))
        await expect(row.getByRole('checkbox')).toBeVisible();
    }
  }
  await page.setViewportSize(originalViewport);
  await page.goto(`/konten/pruefen?bankSource=${sourceId}`);
  await expect(shortcut).toHaveText('Alle sicheren bestätigen (0)');

  const writes: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') writes.push(new URL(req.url()).pathname);
  });
  const safe = page.locator('.bank-inbox-row').filter({ hasText: 'Synthetic safe' });
  await (await bankPreviewControl(safe)).click();
  const candidate = page.getByRole('dialog', { name: 'Buchung übernehmen' });
  await expect(candidate.getByText(longRule, { exact: true })).toBeVisible();
  await expect(candidate).toContainText(longPayee);
  await expect(candidate).toContainText(account.name);
  await candidate.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(shortcut).toHaveText('Alle sicheren bestätigen (1)');
  for (const width of [390, 768, 871, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const suggestion = safe.locator('.bank-suggestion-pill');
    await expect(suggestion).toContainText(longRule);
    const bounds = await suggestion.evaluate((element) => {
      const pill = element.getBoundingClientRect();
      const cell = element.closest('td')!.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(element);
      const content = text.getBoundingClientRect();
      return {
        width: pill.width,
        within: pill.left >= cell.left && pill.right <= cell.right && content.right <= cell.right,
      };
    });
    expect(bounds.width).toBeGreaterThanOrEqual(100);
    expect(bounds.within).toBe(true);
  }
  await page.setViewportSize(originalViewport);

  await shortcut.click();
  const preview = page.getByRole('dialog', { name: 'Bankauswahl prüfen' });
  await expect(preview).toContainText('1 ausgewählt · 1 bestätigen · 0 übersprungen');
  await expect(
    preview.getByRole('list', { name: 'Auswirkung der sicheren Vorschläge' }),
  ).toContainText('−12,01 €');
  await preview.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(writes).toEqual([]);
  await shortcut.click();
  await preview.getByRole('button', { name: 'Auswahl jetzt ausführen' }).click();
  await expect(page.locator('.bank-inbox-row')).toHaveCount(1);
  await expect(toast(page)).toContainText('1 Bankzeilen bestätigt · 0 übersprungen.');
  await expect(toast(page).getByRole('button', { name: 'Rückgängig' })).toHaveCount(1);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('.bank-inbox-row')).toHaveCount(2);
  expect(writes).toEqual(['/api/bank-sync/inbox/bulk', '/api/undo']);
  const accounts = await (await request.get(origin + '/api/accounts')).json();
  expect(accounts.accounts.find((row: { id: string }) => row.id === account.id).balanceCents).toBe(
    10000,
  );
});
