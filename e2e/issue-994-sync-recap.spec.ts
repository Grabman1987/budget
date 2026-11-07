import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { test } from './isolated-ledger';
import { bankPreviewControl, toast, MIN_TARGET_PX } from './ledger-helpers';
import { BankSync } from '../apps/server/src/bank-sync/service';
import { bankSecretBox } from '../apps/server/src/bank-sync/secrets';
import type { BankProvider } from '../apps/server/src/bank-sync/provider';

test.use({ ledgerToday: '2026-09-17', bankingConfigured: true });

const recapTest = test.extend<{ recapSource: string }>({
  recapSource: async ({ request, isolatedLedger }, use) => {
    const { origin, databasePath } = isolatedLedger;
    const post = async (path: string, data: unknown) => {
      const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const { account } = await post('/accounts', {
      name: 'Synthetisches Haushaltskonto',
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 10000,
    });
    const { account: second } = await post('/accounts', {
      name: 'Synthetisches Zweitkonto',
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 20000,
    });
    const { group } = await post('/categories/groups', { name: 'Synthetische Gruppe' });
    const { category } = await post('/categories', {
      name: 'Synthetischer Alltag',
      class: 'need',
      groupId: group.id,
    });
    await post('/assignment-rules', {
      name: 'Synthetischer Alltag',
      enabled: true,
      automatic: true,
      match: { mode: 'all', conditions: [{ type: 'contains', text: 'Synthetic new' }] },
      actions: { categoryId: category.id },
    });
    const sourceId = randomUUID(),
      secondSourceId = randomUUID(),
      consentId = randomUUID();
    const box = bankSecretBox('ab'.repeat(32));
    let now = new Date('2026-09-16T06:00:00.000Z');
    let fresh = false;
    const oldRow = {
      reference: 'old',
      date: '2026-09-15',
      amountCents: -301,
      currency: 'EUR',
      memo: 'Synthetic older open',
    };
    const provider: BankProvider = {
      institutions: async () => [],
      authorize: async () => '',
      session: async () => {
        throw new Error('Unused synthetic authorization');
      },
      transactions: async (uid) => ({
        rows:
          uid === 'second'
            ? []
            : [
                oldRow,
                ...(fresh
                  ? [
                      {
                        ...oldRow,
                        reference: 'new-a',
                        memo: 'Synthetic new A',
                        amountCents: -1201,
                      },
                      {
                        ...oldRow,
                        reference: 'new-b',
                        memo: 'Synthetic new B',
                        amountCents: -2302,
                      },
                    ]
                  : []),
              ],
        skippedInvalid: 0,
        skippedOutOfWindow: 0,
      }),
      balance: async () => null,
    };
    const opened = openDatabase(databasePath);
    try {
      opened.db
        .insert(schema.bankSyncConsent)
        .values({
          id: consentId,
          initiator: 'synthetic',
          stateHash: randomUUID(),
          label: 'Synthetische Bank',
          expiresAt: '2027-01-01T00:00:00Z',
          validUntil: '2027-01-01T00:00:00Z',
          nextRunAt: now.toISOString(),
          status: 'active',
          secret: box.seal('synthetic-session', consentId),
        })
        .run();
      for (const [id, accountId, uid] of [
        [sourceId, account.id, 'first'],
        [secondSourceId, second.id, 'second'],
      ])
        opened.db
          .insert(schema.bankSyncAccount)
          .values({
            id,
            consentId,
            secret: box.seal(uid!, id!),
            label: 'Synthetische Quelle',
            currency: 'EUR',
            accountId,
            fromDate: '2026-09-01',
          })
          .run();
      const service = new BankSync(opened.db, provider, box, origin, () => now);
      service.setPolicy(consentId, false);
      await service.tick();
      fresh = true;
      now = new Date('2026-09-17T06:00:00.000Z');
      await service.tick();
    } finally {
      opened.close();
    }

    await use(sourceId);
  },
});

const balances = async (request: APIRequestContext, origin: string) =>
  (await (await request.get(origin + '/api/accounts')).json()).accounts.map(
    (row: { id: string; balanceCents: number }) => [row.id, row.balanceCents],
  );

async function openBatch(page: Page, sourceId: string) {
  await page.goto(`/konten/pruefen?bankSource=${sourceId}&bankRecap=2026-09-17T06%3A00%3A00.000Z`);
  await expect(page.locator('.bank-inbox-row')).toHaveCount(2);
  await expect(page.locator('main')).not.toContainText('Synthetic older open');
  await expect(page.locator('main')).toContainText('Neue Umsätze aus dem Abruf');
  await expect(page.locator('.kinbox')).toContainText('2 offen');
}

for (const theme of ['light', 'dark']) {
  recapTest(
    `read-only per-account recap in ${theme}`,
    async ({ page, request, isolatedLedger, recapSource }, info) => {
      const before = await balances(request, isolatedLedger.origin);
      const writes: string[] = [];
      page.on('request', (req) => {
        if (req.method() === 'POST') writes.push(new URL(req.url()).pathname);
      });
      await page.goto(`/konten/pruefen?bankSource=${recapSource}`);
      await expect(page.locator('[data-budget-redesign="1"]')).toBeVisible();
      const recap = page.getByRole('region', { name: 'Rückblick nach Bankabruf' });
      await expect(recap).toContainText('3 abgerufen · 0 verknüpft · 2 neu vorgemerkt');
      await expect(recap).toContainText('Synthetisches Zweitkonto');
      await expect(recap).toContainText('Keine neuen Umsätze dieses Abrufs offen.');
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await recap.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const bounds = await recap
        .getByRole('link', { name: 'Neue Umsätze prüfen (2)' })
        .boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      await page.screenshot({
        path: info.outputPath(`sync-recap-${info.project.name}-${theme}.png`),
        fullPage: true,
      });
      expect(writes).toEqual([]);
      expect(await balances(request, isolatedLedger.origin)).toEqual(before);
    },
  );
}

for (const action of ['cancel', 'confirm'] as const) {
  recapTest(
    `bulk ${action} stays inside the exact fetch`,
    async ({ page, request, isolatedLedger, recapSource }) => {
      const before = await balances(request, isolatedLedger.origin);
      const writes: string[] = [];
      page.on('request', (req) => {
        if (req.method() === 'POST') writes.push(new URL(req.url()).pathname);
      });
      await openBatch(page, recapSource);
      for (const memo of ['Synthetic new A', 'Synthetic new B']) {
        const row = page.locator('.bank-inbox-row').filter({ hasText: memo });
        // Exercise native keyboard activation; the individual flow below covers pointer input.
        await (await bankPreviewControl(row)).press('Enter');
        const dialog = page.getByRole('dialog', { name: 'Buchung übernehmen' });
        await expect(dialog).toContainText('Synthetischer Alltag');
        await dialog.getByRole('button', { name: 'Schließen', exact: true }).press('Enter');
        await expect(dialog).not.toBeVisible();
      }
      const shortcut = page.getByRole('button', { name: 'Alle sicheren bestätigen (2)' });
      await expect(shortcut).toBeEnabled();
      await shortcut.press('Enter');
      const preview = page.getByRole('dialog', { name: 'Bankauswahl prüfen' });
      await expect(preview).toContainText('2 ausgewählt · 2 bestätigen · 0 übersprungen');
      expect(writes).toEqual([]);
      expect(await balances(request, isolatedLedger.origin)).toEqual(before);
      if (action === 'cancel') {
        await preview.getByRole('button', { name: 'Abbrechen', exact: true }).press('Enter');
        await expect(preview).not.toBeVisible();
        expect(writes).toEqual([]);
        expect(await balances(request, isolatedLedger.origin)).toEqual(before);
        return;
      }
      await preview.getByRole('button', { name: 'Auswahl jetzt ausführen' }).press('Enter');
      await expect(page.locator('.bank-inbox-row')).toHaveCount(0);
      await toast(page).getByRole('button', { name: 'Rückgängig' }).press('Enter');
      await expect(page.locator('.bank-inbox-row')).toHaveCount(2);
      expect(await balances(request, isolatedLedger.origin)).toEqual(before);
    },
  );
}

recapTest(
  'recap link opens new rows for individual confirmation and preserves older work',
  async ({ page, request, isolatedLedger, recapSource }) => {
    const before = await balances(request, isolatedLedger.origin);
    await page.goto(`/konten/pruefen?bankSource=${recapSource}`);
    const recap = page.getByRole('region', { name: 'Rückblick nach Bankabruf' });
    await recap.getByRole('link', { name: 'Neue Umsätze prüfen (2)' }).click();
    await expect(page.locator('.bank-inbox-row')).toHaveCount(2);
    const one = page.locator('.bank-inbox-row').filter({ hasText: 'Synthetic new A' });
    await (await bankPreviewControl(one)).click();
    const dialog = page.getByRole('dialog', { name: 'Buchung übernehmen' });
    await dialog.getByRole('button', { name: 'Als Buchung bestätigen', exact: true }).click();
    await expect(page.locator('.bank-inbox-row')).toHaveCount(1);
    await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.locator('.bank-inbox-row')).toHaveCount(2);
    expect(await balances(request, isolatedLedger.origin)).toEqual(before);
    await page.getByRole('link', { name: 'Alle Aufgaben dieser Quelle', exact: true }).click();
    await expect(page.locator('.bank-inbox-row')).toHaveCount(3);
  },
);
