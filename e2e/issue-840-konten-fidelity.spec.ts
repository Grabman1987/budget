import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { pickCategory } from './ledger-helpers';

test.use({ ledgerToday: '2026-09-17', bankingConfigured: true });

test('K1–K5: synthetic desktop and phone views retain read-only entry paths', async ({
  browser,
  request,
  isolatedLedger,
}, info) => {
  const { origin, databasePath, storageState } = isolatedLedger;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { group } = await post('/categories/groups', { name: 'Muster Alltag' });
  const { category } = await post('/categories', {
    groupId: group.id,
    name: 'Muster Einkauf',
    class: 'need',
  });
  const accounts = [];
  for (const [name, type, cents] of [
    ['Muster Bargeld', 'cash', 15683],
    ['Muster Zahlungskonto', 'checking', 146527],
    ['Muster Rücklage', 'savings', 382145],
    ['Muster Karte A', 'credit_card', -24531],
    ['Muster Karte B', 'credit_card', -14689],
    ['Muster Darlehen', 'loan', -1289456],
    ['Muster Anlagekonto', 'checking', 218932],
  ] as const) {
    const { account } = await post('/accounts', {
      name,
      type,
      onBudget: type !== 'loan' && name !== 'Muster Anlagekonto',
      openingDate: '2026-08-01',
      openingBalanceCents: cents,
    });
    accounts.push(account);
  }
  const account = accounts[1]!;
  for (const [index, amountCents] of [-1357, -2816, 10035, -3200, -1250, -7604].entries())
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `2026-09-${String(16 - index).padStart(2, '0')}`,
      amountCents,
      payeeName: `Muster Empfänger ${index + 1}`,
      memo: index === 2 ? 'Muster Erstattung' : '',
      status: index < 2 ? 'pending' : 'confirmed',
      splits: [{ categoryId: category.id, amountCents }],
    });
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-09-22',
    amountCents: -5600,
    payeeName: 'Muster kommende Zahlung',
    splits: [{ categoryId: category.id, amountCents: -5600 }],
  });
  const sourceId = randomUUID(),
    consentId = randomUUID();
  const opened = openDatabase(databasePath);
  try {
    opened.db
      .insert(schema.bankSyncConsent)
      .values({
        id: consentId,
        initiator: 'synthetic',
        stateHash: randomUUID(),
        label: 'Muster Bankquelle',
        status: 'active',
        lastSuccessAt: '2026-09-17T05:12:00Z',
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
        label: 'Muster Bankquelle',
        currency: 'EUR',
        accountId: account.id,
      })
      .run();
    for (let index = 0; index < 6; index++) {
      const id = randomUUID();
      opened.db
        .insert(schema.bankSyncCandidate)
        .values({
          id,
          sourceId,
          accountId: account.id,
          dedupeKey: id,
          date: '2026-09-17',
          amountCents: -1321 - index * 253,
          currency: 'EUR',
          memo: `Muster Quellumsatz ${index + 1}`,
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
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      baseURL: origin,
      storageState,
      viewport: { width, height: width === 1440 ? 900 : 844 },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-09-17T12:00:00+02:00'));
      const writes: string[] = [],
        errors: string[] = [];
      page.on('request', (req) => {
        if (
          new URL(req.url()).pathname.startsWith('/api/') &&
          !['GET', 'HEAD'].includes(req.method())
        )
          writes.push(req.method() + ' ' + new URL(req.url()).pathname);
      });
      page.on('pageerror', (error) => errors.push(error.message));
      for (const [view, path, selector] of [
        ['overview', '/konten', '.account-overview-577'],
        ['account', `/konten/${account.id}`, '.kacct'],
        ['bookings', '/konten/buchungen', '.kview'],
        ['pruefen', `/konten/pruefen?teil=umsaetze&bankSource=${sourceId}`, '.kinbox'],
        ['booking-dialog', `/konten/${account.id}?panel=buchung`, 'dialog[open]'],
      ]) {
        await page.goto(path!);
        await page.waitForLoadState('networkidle');
        await expect(page.locator(selector!).first()).toBeVisible();
        await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        if (
          width === 1440 &&
          ['account', 'bookings'].includes(view!) &&
          (await page.locator('[data-budget-redesign="1"]').count()) > 0
        ) {
          const heights = await page
            .locator('.ktx tr[data-booking]')
            .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
          expect(heights).toHaveLength(6);
          expect(heights.every((height) => height >= 44 && height <= 50)).toBe(true);
        }
        if (view === 'booking-dialog') {
          const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
          await dialog.getByLabel('Betrag', { exact: true }).fill('13,57');
          await dialog.getByLabel('Empfänger', { exact: true }).fill('Muster Einkauf');
          await pickCategory(dialog, category.name);
          await dialog.getByLabel('Notiz', { exact: true }).fill('Muster Wocheneinkauf');
          if (width === 390 && (await page.locator('[data-budget-redesign="1"]').count()) > 0)
            expect(
              (await dialog.getByLabel('Betrag', { exact: true }).boundingBox())!.width,
            ).toBeGreaterThanOrEqual(160);
        }
        const output =
          info.project.name === 'desktop' ? process.env['BUDGET_KONTEN_EVIDENCE_DIR'] : undefined;
        const file = output
          ? join(output, `${view}-${width}-light.png`)
          : info.outputPath(`${view}-${width}-light.png`);
        mkdirSync(dirname(file), { recursive: true });
        await page.screenshot({ path: file, animations: 'disabled' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
});
