import AxeBuilder from '@axe-core/playwright';
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  openDatabase,
  schema,
} from '@budget/db';
import type { StatementIntakeView, StatementReceiptLinksPage } from '@budget/domain';
import { expect, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { syntheticColumnarPayslipPdf } from '../apps/server/src/payslips/testing';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-20' });
async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme });
  await page.reload();
  const resolved = () =>
    page.evaluate(
      () =>
        document.documentElement.dataset['theme'] ||
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    );
  if ((await resolved()) !== theme) {
    if (page.viewportSize()!.width < 768) {
      const menu = page.locator('.m-profile > summary');
      await menu.click();
      await page
        .locator('.m-profile')
        .getByRole('button', {
          name: theme === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
          exact: true,
        })
        .click();
      await menu.click();
    } else
      await page
        .locator('.sidebar-foot')
        .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
        .click();
  }
  await expect.poll(resolved).toBe(theme);
}
async function hit(control: Locator) {
  await control.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  const geometry = await control.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      ownsCenter: element.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      ),
    };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.ownsCenter).toBe(true);
  return geometry;
}

for (const theme of ['light', 'dark'] as const)
  test(`740 original PDF links, cancellation and real group Undo/Redo in ${theme}`, async ({
    page,
    isolatedLedger,
  }, info) => {
    const { origin, databasePath } = isolatedLedger,
      opened = openDatabase(databasePath);
    const accountId = randomUUID(),
      groupId = randomUUID(),
      categoryId = randomUUID(),
      ctx = { actor: 'synthetic-browser-740' };
    try {
      accounts.create(
        opened.db,
        {
          id: accountId,
          name: 'Belegkonto Muster',
          type: 'credit_card',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-01-01',
          openingBalanceCents: 100000,
        },
        ctx,
      );
      createEntity(opened.db, schema.categoryGroup, { id: groupId, name: 'Synthetic group' }, ctx);
      categories.create(
        opened.db,
        { id: categoryId, groupId, name: 'Synthetic expenses', class: 'need' },
        ctx,
      );
      const ids = [-1251, -5749].map((amountCents, index) =>
        createBooking(
          opened.db,
          {
            accountId,
            date: '2026-09-17',
            amountCents,
            memo: `Musterbeleg ${index + 1}`,
            splits: [{ amountCents, categoryId }],
          },
          ctx,
        ),
      );
      const financial = () =>
        JSON.stringify(
          [
            schema.account,
            schema.booking,
            schema.bookingSplit,
            schema.transfer,
            schema.expectedPayment,
            schema.expectedPaymentVersion,
          ].map((table) => opened.db.select().from(table).all()),
        );
      const before = financial();
      await page.goto(`/konten/${accountId}`);
      await setTheme(page, theme);
      const launch = page.getByRole('button', { name: 'Abrechnung hochladen', exact: true });
      await launch.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Abrechnung prüfen' });
      const bytes = await syntheticColumnarPayslipPdf(
        [
          [{ x: 40, text: `Rechnungsnummer: SYNTHETIC-740-${theme}` }],
          [{ x: 40, text: 'Rechnungtdaium: 01.10.2026' }],
          [
            { x: 40, text: 'Total Neto' },
            { x: 280, text: 'MwSt Betrag' },
            { x: 440, text: 'Toial Bruto in EUR' },
          ],
          [
            { x: 40, text: 'Gesamt Firmensumme' },
            { x: 250, text: '100,00', right: true },
            { x: 410, text: '20,00', right: true },
            { x: 520, text: '120,00', right: true },
          ],
        ],
        '',
      );
      await page
        .getByRole('dialog', { name: 'Abrechnung hochladen' })
        .getByLabel('Abrechnungs-PDF auswählen', { exact: true })
        .setInputFiles({ name: 'synthetic-740.pdf', mimeType: 'application/pdf', buffer: bytes });
      const summary = dialog.getByText('Vorhandene Buchungen mit diesem PDF verknüpfen', {
        exact: true,
      });
      await summary.click();
      const panel = dialog.locator('details').filter({
        has: page
          .locator('summary')
          .filter({ hasText: /^Vorhandene Buchungen mit diesem PDF verknüpfen$/ }),
      });
      const first = panel.getByRole('checkbox', { name: /Anhängen:.*Musterbeleg 1/ }),
        second = panel.getByRole('checkbox', { name: /Anhängen:.*Musterbeleg 2/ });
      await expect(first).toBeEnabled();
      await expect(second).toBeEnabled();
      const geometry = [await hit(first), await hit(second)];
      await first.focus();
      await page.keyboard.press('Space');
      await second.check();
      await expect(
        panel.getByRole('region', { name: 'Auswahl vor dem Speichern' }).getByRole('listitem'),
      ).toHaveCount(2);
      const intakeResponse = await page.request.get(
        `${origin}/api/statement-intake?accountId=${accountId}`,
      );
      expect(intakeResponse.status()).toBe(200);
      const intake = ((await intakeResponse.json()) as { intakes: StatementIntakeView[] })
        .intakes[0]!;
      const read = async () => {
        const response = await page.request.get(
          `${origin}/api/statement-intake/${intake.id}/booking-links`,
        );
        expect(response.status()).toBe(200);
        return (await response.json()) as StatementReceiptLinksPage;
      };
      expect((await read()).attached).toEqual([]);
      // Explicit discard is a local operation, with no new audit entries.
      const auditBefore = opened.db.select().from(schema.auditLog).all();
      await panel.getByRole('button', { name: 'Auswahl verwerfen', exact: true }).click();
      await expect(first).not.toBeChecked();
      await expect(second).not.toBeChecked();
      expect(opened.db.select().from(schema.auditLog).all()).toEqual(auditBefore);
      await first.check();
      await second.check();
      const save = panel.getByRole('button', { name: 'Verknüpfungen speichern', exact: true });
      geometry.push(await hit(save));
      await save.focus();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByText(
          'Verknüpfungen gespeichert. Beträge und Buchungsdaten bleiben unverändert.',
        ),
      ).toBeVisible();
      expect((await read()).attached.map((row) => row.bookingId).sort()).toEqual([...ids].sort());
      expect(financial()).toBe(before);
      const undo = dialog.getByRole('button', { name: 'Rückgängig', exact: true });
      geometry.push(await hit(undo));
      await undo.click();
      await expect.poll(async () => (await read()).attached.length).toBe(0);
      const redo = dialog.getByRole('button', { name: 'Wiederholen', exact: true });
      await redo.click();
      await expect
        .poll(async () => (await read()).attached.map((row) => row.bookingId).sort())
        .toEqual([...ids].sort());
      const detach = panel.getByRole('checkbox', { name: /Verknüpfung lösen:.*Musterbeleg 1/ });
      await detach.check();
      await save.click();
      await expect
        .poll(async () => (await read()).attached.map((row) => row.bookingId))
        .toEqual([ids[1]]);
      await dialog.getByRole('button', { name: 'Rückgängig', exact: true }).click();
      await expect
        .poll(async () => (await read()).attached.map((row) => row.bookingId).sort())
        .toEqual([...ids].sort());
      expect(financial()).toBe(before);
      const download = panel.getByRole('link', { name: 'Gespeichertes Original herunterladen' });
      expect(await download.getAttribute('href')).toBe(
        `/api/receipts/${intake.receiptId}/download`,
      );
      const original = await page.request.get(origin + (await download.getAttribute('href'))!);
      expect(original.status()).toBe(200);
      expect(await original.body()).toEqual(bytes);
      expect(opened.db.select().from(schema.receipt).all()).toHaveLength(1);
      await page.keyboard.press('Control+Shift+H');
      await expect(panel).not.toContainText('12,51');
      await expect(panel).not.toContainText('57,49');
      await page.keyboard.press('Control+Shift+H');
      await expect(panel).toContainText('12,51');
      expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
        [],
      );
      expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await summary.evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.screenshot({ path: info.outputPath(`740-${theme}.png`), fullPage: true });
      await writeFile(
        info.outputPath('740-evidence.json'),
        JSON.stringify(
          {
            project: info.project.name,
            theme,
            ids,
            sourceHash: intake.sha256,
            attached: (await read()).attached,
            geometry,
            financialUnchanged: financial() === before,
          },
          null,
          2,
        ),
      );
    } finally {
      opened.close();
    }
  });
