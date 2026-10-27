import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase, schema } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });
const period = '2026-08..2026-08';
const spendingPath = '/reports/ausgaben';
const wealthPath = '/reports/vermoegen-schulden';
async function inspect(page: Page, info: TestInfo, label: string) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'desktop') {
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      1800,
    );
  }
  if (info.project.name !== 'desktop') {
    const controls = page.locator('.report-view-switch button:visible');
    expect(await controls.count()).toBeGreaterThanOrEqual(2);
    for (const control of await controls.all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }
  await page.screenshot({ path: info.outputPath(`${label}.png`), animations: 'disabled' });
}
async function privacy(page: Page) {
  const profile = page.locator('.m-profile > summary');
  const phone = await profile.isVisible();
  if (phone) await profile.click();
  await page.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
  if (phone) await profile.click();
}
function seedPayees(path: string) {
  const opened = openDatabase(path);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents) VALUES ('giro','Synthetic budget','checking','budget',1,'2026-08-01',100000);
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
      INSERT INTO category (id,group_id,name,class,kind) VALUES ('need','g','Synthetic need','need','variable'),('want','g','Synthetic want','want','variable');
      INSERT INTO payee (id,name) VALUES ('a','Synthetic recipient A'),('b','Synthetic recipient B');
    `);
    for (const [payeeId, amountCents, categoryId] of [
      ['a', -10001, 'need'],
      ['a', 501, 'need'],
      ['b', -20000, 'want'],
    ] as const) {
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          payeeId,
          date: '2026-08-15',
          amountCents,
          splits: [{ categoryId, amountCents }],
        },
        { actor: 'synthetic-622' },
      );
    }
  } finally {
    opened.close();
  }
}
function seedWealth(path: string) {
  const opened = openDatabase(path);
  try {
    opened.db
      .insert(schema.account)
      .values([
        {
          id: 'cash',
          name: 'Synthetic cash',
          type: 'checking',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-08-01',
          openingBalanceCents: 100000,
        },
        {
          id: 'debt',
          name: 'Synthetic debt',
          type: 'loan',
          role: 'debt',
          onBudget: false,
          openingDate: '2026-08-01',
          openingBalanceCents: -20000,
        },
        {
          id: 'depot',
          name: 'Synthetic depot',
          type: 'brokerage',
          role: 'investment',
          onBudget: false,
          openingDate: '2026-08-01',
        },
        {
          id: 'usd',
          name: 'Synthetic USD',
          type: 'checking',
          role: 'investment',
          onBudget: false,
          openingDate: '2026-08-01',
          openingBalanceCents: 10000,
          currency: 'USD',
        },
      ])
      .run();
    opened.db
      .insert(schema.security)
      .values({ id: 'estimated', name: 'Synthetic cost fallback', kind: 'stock', currency: 'EUR' })
      .run();
    opened.db
      .insert(schema.holding)
      .values({
        id: 'h',
        accountId: 'depot',
        securityId: 'estimated',
        asOf: '2026-08-01',
        unitsE8: 100000000,
        costBasisCents: 10000,
      })
      .run();
    opened.db
      .insert(schema.fxRate)
      .values({ date: '2026-08-01', currency: 'USD', rateMicro: 900000 })
      .run();
  } finally {
    opened.close();
  }
}

test('622 fixed-period payee cents, refund/detail and filters survive canonical view switches', async ({
  page,
  isolatedLedger,
}, info) => {
  seedPayees(isolatedLedger.databasePath);
  const response = await page.request.get(
    `${isolatedLedger.origin}/api/reports/payees?period=${period}`,
  );
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    totalSpendCents: 29500,
    bookingCount: 3,
    rows: expect.arrayContaining([
      expect.objectContaining({ payeeId: 'a', amountCents: 9500 }),
      expect.objectContaining({ payeeId: 'b', amountCents: 20000 }),
    ]),
  });
  await page.goto(`/reports/empfaenger?zeitraum=${period}`);
  await expect(page.getByTestId('payee-total')).toHaveText('295,00 €');
  for (const theme of ['light', 'dark']) {
    await page.goto(
      `${spendingPath}?zeitraum=${period}&darstellung=gruppen&empfaenger=a&exakt=true&gruppen=%5B%22g%22%5D`,
    );
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await expect(page.getByTestId('sa-consumption')).toHaveText('295,00 €');
    await expect(page.getByTestId('report-verdict')).toContainText('Konsum');
    await inspect(page, info, `spending-groups-${theme}`);
    const views = page.getByRole('group', { name: 'Ansicht der Ausgabenanalyse', exact: true });
    await views.getByRole('button', { name: 'Empfänger', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('payee-total')).toHaveText('295,00 €');
    await expect(page.getByTestId('spending-analysis')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Buchungen · Synthetic recipient A', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.payee-bookings tbody tr')).toHaveCount(2);
    await expect(
      page.locator('.payee-row-button').filter({ hasText: 'Synthetic recipient A' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(new URL(page.url()).searchParams.get('zeitraum')).toBe(period);
    expect(new URL(page.url()).searchParams.get('empfaenger')).toBe('a');
    expect(new URL(page.url()).searchParams.get('exakt')).toBe('true');
    expect(new URL(page.url()).searchParams.get('gruppen')).toBe('["g"]');
    await inspect(page, info, `spending-payees-${theme}`);
    await privacy(page);
    await expect(page.getByTestId('payee-total')).toContainText('•••');
    await expect(page.getByTestId('payee-total')).not.toContainText('295,00');
    await privacy(page);
    await views.getByRole('button', { name: 'Gruppen und Kategorien', exact: true }).click();
    await expect(page.getByTestId('sa-consumption')).toHaveText('295,00 €');
    await page.goBack();
    await expect(page.getByTestId('payee-total')).toHaveText('295,00 €');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Buchungen · Synthetic recipient A', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('group', { name: 'Zeitraum', exact: true })
      .getByRole('button', { name: '3M', exact: true })
      .click();
    await expect(page.getByTestId('payee-total')).toHaveText('295,00 €');
    expect(new URL(page.url()).searchParams.get('empfaenger')).toBeNull();
  }
});

for (const theme of ['light', 'dark']) {
  test(`623 each fixed-date wealth view preserves literal FX/debt cents, estimates, CSV and unavailable states (${theme})`, async ({
    page,
    isolatedLedger,
  }, info) => {
    seedWealth(isolatedLedger.databasePath);
    const checks = [
      [
        '/api/assets-debts-history',
        {
          change: { endCents: 99000 },
          months: [
            expect.objectContaining({
              netCents: 99000,
              assetsCents: 119000,
              debtsCents: -20000,
              incomplete: true,
            }),
          ],
        },
      ],
      ['/api/networth-history', { chain: { nowCents: 99000 } }],
      ['/api/overview/whole-picture', { totals: { endCents: 99000 } }],
    ] as const;
    for (const [api, expected] of checks) {
      const response = await page.request.get(`${isolatedLedger.origin}${api}?period=${period}`);
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject(expected);
    }
    // Independent cents: 100000 EUR cash - 20000 debt + 10000 cost fallback + 9000 converted USD.
    await page.goto(`/reports/vermoegen?zeitraum=${period}`);
    await expect(page.getByTestId('wh-figure')).toContainText('990,00 €');
    await page.goto(`/reports/gesamtuebersicht?zeitraum=${period}`);
    await expect(
      page.getByTestId('whole-table').locator('tbody tr').first().locator('td').nth(10),
    ).toHaveText('≈990,00 €');
    await page.goto(`${wealthPath}?zeitraum=${period}&monat=2026-08`);
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    for (const [name, body, figure] of [
      ['Vermögen und Schulden', '.assets-debts-report', 'ad-net'],
      ['Vermögensverlauf', '.wealth-history-report', 'wh-figure'],
      ['Gesamtübersicht', '.whole-picture', ''],
    ] as const) {
      await page
        .getByRole('group', { name: 'Ansicht von Vermögen und Schulden', exact: true })
        .getByRole('button', { name, exact: true })
        .click();
      await expect(page.locator(body)).toBeVisible();
      await expect(
        page.locator('.assets-debts-report, .wealth-history-report, .whole-picture'),
      ).toHaveCount(1);
      if (figure) await expect(page.getByTestId(figure)).toContainText('990,00 €');
      else
        await expect(
          page.getByTestId('whole-table').locator('tbody tr').first().locator('td').nth(10),
        ).toHaveText('≈990,00 €');
      await expect(page.locator(body)).toContainText('≈');
      expect(new URL(page.url()).searchParams.get('zeitraum')).toBe(period);
      expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
      if (info.project.name !== 'desktop') {
        const labels = await page
          .getByRole('group', { name: 'Ansicht von Vermögen und Schulden', exact: true })
          .getByRole('button')
          .evaluateAll((buttons) =>
            buttons.map((button) => {
              const range = document.createRange();
              range.selectNodeContents(button);
              const text = range.getBoundingClientRect();
              const box = button.getBoundingClientRect();
              return {
                label: button.textContent,
                text: { left: text.left, right: text.right, top: text.top, bottom: text.bottom },
                button: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
              };
            }),
          );
        expect(labels.map((label) => label.label)).toEqual([
          'Vermögen und Schulden',
          'Vermögensverlauf',
          'Gesamtübersicht',
        ]);
        for (const label of labels) {
          expect(label.text.left).toBeGreaterThanOrEqual(label.button.left);
          expect(label.text.right).toBeLessThanOrEqual(label.button.right);
          expect(label.text.top).toBeGreaterThanOrEqual(label.button.top);
          expect(label.text.bottom).toBeLessThanOrEqual(label.button.bottom);
        }
        for (let first = 0; first < labels.length; first++) {
          for (let second = first + 1; second < labels.length; second++) {
            const a = labels[first]!.text;
            const b = labels[second]!.text;
            expect(
              a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
            ).toBe(true);
          }
        }
        const geometryName = `wealth-selector-${figure || 'whole'}-${theme}.json`;
        const geometryPath = info.outputPath(geometryName);
        writeFileSync(geometryPath, JSON.stringify(labels, null, 2));
        await info.attach(geometryName, { path: geometryPath, contentType: 'application/json' });
      }
      await inspect(page, info, `wealth-${name}-${theme}`);
      await privacy(page);
      if (figure) {
        await expect(page.getByTestId(figure)).toContainText('•••');
        await expect(page.getByTestId(figure)).not.toContainText('990,00');
      } else await expect(page.getByTestId('whole-table')).not.toContainText('990,00');
      await privacy(page);
    }
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV exportieren', exact: true }).click();
    const download = await downloadEvent;
    expect(readFileSync((await download.path())!, 'utf8')).toContain('≈990,00 €');
    await page.goBack();
    await expect(page.getByTestId('wh-figure')).toContainText('990,00 €');
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
    await page.goForward();
    await expect(page.getByTestId('whole-table')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('whole-table')).toBeVisible();
    const opened = openDatabase(isolatedLedger.databasePath);
    try {
      opened.sqlite.exec('DELETE FROM fx_rate');
    } finally {
      opened.close();
    }
    for (const darstellung of ['bilanz', 'verlauf', 'gesamt']) {
      await page.goto(`${wealthPath}?zeitraum=${period}&monat=2026-08&darstellung=${darstellung}`);
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await expect(page.getByRole('alert')).toContainText(
        darstellung === 'gesamt'
          ? 'Gesamtübersicht konnten nicht geladen werden'
          : 'Bewertung nicht verfügbar',
      );
      await expect(page.getByTestId('ad-net')).toHaveCount(0);
      await expect(page.getByTestId('wh-figure')).toHaveCount(0);
      await expect(page.getByTestId('whole-table')).toHaveCount(0);
    }
  });
}
