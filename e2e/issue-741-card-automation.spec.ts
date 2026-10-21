import AxeBuilder from '@axe-core/playwright';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  accounts, categories, createBooking, createEntity, getBooking, history, openDatabase,
  performStatementAction, saveAssignmentRule, saveStatementAutomationConfig, schema,
} from '@budget/db';
import type { StatementAutomationOutcome, StatementIntakeView } from '@budget/domain';
import { expect, type Locator, type Page } from '@playwright/test';
import { syntheticColumnarPayslipPdf } from '../apps/server/src/payslips/testing';
import { digest } from '../apps/server/src/receipts/files';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2031-01-10' });
const ctx = { actor: 'synthetic-native-741' };
const cell = (column: number, text: string) => ({ x: 40 + column * 5, text });
const rows = (previous: boolean) => [
  [cell(0, `Datum ${previous ? '04.12.2030' : '04.01.2031'}`)],
  [cell(0, `Datum nächste Umsatznachricht ${previous ? '04.01.2031' : '04.02.2031'}`)],
  [cell(0, `Wird eingezogen am ${previous ? '12.12.2030' : '12.01.2031'}`)],
  [cell(0, previous ? 'Saldo 100,00-' : 'Saldo 170,00-')],
  [cell(0, 'Karte'), cell(8, 'Umsatz'), cell(16, 'Buchung'), cell(24, 'Buchungstext'),
    cell(58, 'Branche'), cell(70, 'Betrag'), cell(82, 'Kurs'), cell(94, 'EUR Betrag')],
  [cell(0, '1111'), cell(8, previous ? '30.11.' : '30.12.'), cell(16, previous ? '30.11.' : '30.12.'),
    cell(24, previous ? 'Synthetic earlier merchant' : 'Synthetic current merchant'), cell(94, previous ? '100,00-' : '70,00-')],
];
async function setTheme(page: Page, value: 'light' | 'dark') {
  const resolvedTheme = () => page.evaluate(() => {
    const selected = document.documentElement.dataset['theme'];
    return selected === 'light' || selected === 'dark' ? selected
      : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const current = await resolvedTheme();
  if (current === value) return;
  if (page.viewportSize()!.width === 390) {
    const menu = page.locator('.m-profile > summary');
    await menu.click();
    await page.locator('.m-profile').getByRole('button', {
      name: value === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm', exact: true,
    }).click();
    await menu.click();
  } else await page.locator('.sidebar-foot').getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true }).click();
  await expect.poll(resolvedTheme).toBe(value);
}
async function hit(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const geometry = await control.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      ownsCenter: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.ownsCenter).toBe(true);
  return geometry;
}

for (const profile of ['desktop', 'phone'] as const)
  for (const selectedTheme of ['light', 'dark'] as const)
    test(`741 real card PDF, issued settlement and Undo in ${profile} ${selectedTheme}`, async ({ page, browser, isolatedLedger }, info) => {
      const { origin, databasePath } = isolatedLedger;
      const opened = openDatabase(databasePath), funding = randomUUID(), card = randomUUID(),
        category = randomUUID(), group = randomUUID();
      let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
      try {
        accounts.create(opened.db, { id: funding, name: 'Muster Einzugskonto', type: 'checking', role: 'budget', onBudget: true,
          openingDate: '2030-11-01', openingBalanceCents: 50000 }, ctx);
        accounts.create(opened.db, { id: card, name: 'Muster Kreditkarte', type: 'credit_card', role: 'budget', onBudget: true,
          openingDate: '2030-11-01', openingBalanceCents: 0 }, ctx);
        createEntity(opened.db, schema.categoryGroup, { id: group, name: 'Muster Ausgaben' }, ctx);
        categories.create(opened.db, { id: category, groupId: group, name: 'Muster Einkauf', class: 'need' }, ctx);
        saveAssignmentRule(opened.db, null, { name: 'Muster eindeutige Zuordnung', enabled: true, automatic: true,
          match: { mode: 'all', conditions: [{ type: 'counterparty', text: 'Synthetic current merchant' }] },
          actions: { categoryId: category } }, ctx);
        performStatementAction(opened.db, { operation: 'configure', key: 'synthetic-native-settlement-config',
          cardAccountId: card, fundingAccountId: funding, expectedRevision: null, enabled: true }, ctx);
        const token = createHash('sha256').update(JSON.stringify(['statement-card-v1', card, '1111'])).digest('hex');
        saveStatementAutomationConfig(opened.db, { accountId: card, expectedRevision: null, enabled: true,
          mappedCards: [{ token, accountId: card }], scheduledPayment: { mode: 'none' } }, ctx);
        const originalId = createBooking(opened.db, { accountId: card, date: '2030-11-30', amountCents: -10000,
          status: 'confirmed', memo: 'Synthetic earlier merchant', splits: [{ categoryId: category, amountCents: -10000 }] }, ctx);
        const laterId = createBooking(opened.db, { accountId: card, date: '2031-01-06', amountCents: -2300,
          status: 'confirmed', memo: 'Synthetic later purchase', splits: [{ categoryId: category, amountCents: -2300 }] }, ctx);
        const protectedRows = [originalId, laterId].map((id) => ({ id, row: getBooking(opened.db, id), audit: history(opened.db, 'booking', id) }));
        context = await browser.newContext({ baseURL: origin, storageState: await page.context().storageState(),
          viewport: profile === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
          isMobile: profile === 'phone', hasTouch: profile === 'phone', deviceScaleFactor: 1 });
        const active = await context.newPage();
        await active.clock.setFixedTime(new Date('2031-01-10T12:00:00+01:00'));
        const previousPdf = await syntheticColumnarPayslipPdf(rows(true), '');
        const previousResponse = await active.request.post('/api/statement-intake/upload', {
          headers: { origin }, multipart: { accountId: card,
            file: { name: 'synthetic-previous-741.pdf', mimeType: 'application/pdf', buffer: previousPdf } },
        });
        expect(previousResponse.status()).toBe(201);
        expect((await previousResponse.json()).automation).toBeUndefined();
        const balances = async () => {
          const response = await active.request.get('/api/accounts?asOf=2031-01-12');
          expect(response.status()).toBe(200);
          const body = await response.json() as { accounts: { id: string; balanceCents: number }[] };
          return [funding, card].map((id) => body.accounts.find((a) => a.id === id)!.balanceCents);
        };
        expect(await balances()).toEqual([50000, -12300]);
        await active.goto(`/konten/${card}`);
        await setTheme(active, selectedTheme);
        const opener = active.getByRole('button', { name: 'Abrechnung hochladen', exact: true });
        await hit(opener); await opener.click();
        const pdf = await syntheticColumnarPayslipPdf(rows(false), '');
        const uploaded = active.waitForResponse((response) => response.url().endsWith('/api/statement-intake/upload') && response.request().method() === 'POST');
        await active.getByLabel('Abrechnungs-PDF auswählen').setInputFiles({ name: 'synthetic-current-741.pdf', mimeType: 'application/pdf', buffer: pdf });
        const uploadResponse = await uploaded;
        expect(uploadResponse.status()).toBe(201);
        const body = await uploadResponse.json() as { intake: StatementIntakeView; automation: StatementAutomationOutcome };
        expect(body.automation).toMatchObject({ status: 'saved', created: 1, matched: 0, credits: 0,
          receiptLinks: 3, pending: [], reasons: [] });
        expect(body.intake.sha256).toBe(digest(pdf));
        const dialog = active.getByRole('dialog', { name: 'Abrechnung prüfen' });
        const undoButton = dialog.getByRole('button', { name: 'Rückgängig', exact: true });
        // The ordinary focused-toast interaction pauses its existing dismissal timer while
        // accessible result/receipt evidence is inspected; no timer or app setting is changed.
        await undoButton.focus();
        await expect.poll(balances).toEqual([33000, -2300]);
        const posted = body.automation.items!.map((item) => getBooking(opened.db, item.bookingId)!);
        expect(posted.map((b) => b.amountCents).sort((a, b) => a - b)).toEqual([-17000, -7000, 17000]);
        expect(posted.every((b) => b.status === 'pending' && b.source === 'import')).toBe(true);
        const source = await active.request.get(`/api/receipts/${body.intake.receiptId}/download`);
        expect(source.status()).toBe(200);
        expect((await source.body()).equals(pdf)).toBe(true);
        const result = dialog.getByRole('region', { name: 'Automatisches Verarbeitungsergebnis' });
        await expect(result.getByRole('link', { name: 'Neue Buchung' })).toHaveAttribute('href',
          `/konten/buchungen?konto=${card}&buchung=${body.automation.items!.find((i) => i.role === 'created')!.bookingId}`);
        await expect(result).toContainText('Automatische Validierung ist keine Bestätigung einer tatsächlich ausgeführten Bankzahlung.');
        const amount = dialog.getByLabel('Abrechnungsbetrag', { exact: true });
        await expect(amount).toHaveValue('170,00');
        await active.keyboard.press('Control+Shift+H');
        await expect(amount).toHaveAttribute('type', 'password');
        await expect(amount).toHaveValue('170,00');
        await active.keyboard.press('Control+Shift+H');
        await expect(amount).toHaveAttribute('type', 'text');
        await expect(amount).toHaveValue('170,00');
        const undoGeometry = await hit(undoButton);
        await expect.poll(() => active.evaluate(() => document.documentElement.scrollWidth)).toBe(profile === 'desktop' ? 1440 : 390);
        expect((await new AxeBuilder({ page: active }).include('dialog[open]').analyze()).violations).toEqual([]);
        await active.screenshot({ path: info.outputPath(`${profile}-${selectedTheme}.png`), fullPage: true });
        await undoButton.click();
        await expect.poll(balances).toEqual([50000, -12300]);
        for (const protectedRow of protectedRows) {
          expect(getBooking(opened.db, protectedRow.id)).toEqual(protectedRow.row);
          expect(history(opened.db, 'booking', protectedRow.id)).toEqual(protectedRow.audit);
        }
        // Explicit retained-source retry returns historical undone state; it is not permission to redo.
        const retry = dialog.getByRole('button', { name: 'Gespeichertes PDF automatisch prüfen', exact: true });
        await hit(retry); await retry.click();
        await expect(result).toContainText('Sie wird nicht erneut ausgeführt.');
        await expect(result.getByRole('link')).toHaveCount(0);
        expect(await balances()).toEqual([50000, -12300]);
        expect(opened.sqlite.prepare('SELECT count(*) AS n FROM statement_automation_run').get()).toEqual({ n: 1 });
        expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
        await writeFile(info.outputPath('evidence.json'), JSON.stringify({ profile, selectedTheme,
          realWorker: true, issuedCents: 17000, laterExpenseCents: 2300, postedCents: [-17000, -7000, 17000],
          balancesAfterPosting: [33000, -2300], balancesAfterUndo: [50000, -12300], protectedHistoryUnchanged: true,
          retainedSourceBytesEqual: true, undoGeometry, privacyScope: 'untouched editable amount presentation',
          axeScope: 'open statement dialog', noRepostAfterUndo: true }, null, 2));
      } finally {
        await context?.close();
        opened.close();
      }
    });
