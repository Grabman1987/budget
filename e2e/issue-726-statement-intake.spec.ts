import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { syntheticColumnarPayslipPdf } from '../apps/server/src/payslips/testing';
import { test } from './isolated-ledger';
test.use({ ledgerToday: '2026-10-20' });
async function theme(page: Page, value: 'light' | 'dark') {
  const current = await page.evaluate(() =>
    document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light',
  );
  if (current === value) return;
  if (page.viewportSize()!.width === 390) {
    const menu = page.locator('.m-profile > summary');
    await menu.click();
    await page
      .locator('.m-profile')
      .getByRole('button', {
        name: value === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
        exact: true,
      })
      .click();
    await menu.click();
  } else
    await page
      .locator('.sidebar-foot')
      .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
      .click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset['theme']))
    .toBe(value);
}
for (const profile of ['desktop-layout', 'configured-profile'] as const)
  test(`statement document review is isolated, accessible and private in ${profile}`, async ({
    page,
    browser,
    isolatedLedger,
  }, info) => {
    const { origin, databasePath } = isolatedLedger;
    const account = await page.request.post(origin + '/api/accounts', {
      headers: { origin },
      data: {
        name: 'Abrechnung Muster',
        type: 'credit_card',
        openingDate: '2026-01-01',
        openingBalanceCents: -13000,
      },
    });
    expect(account.status()).toBe(201);
    const id = (await account.json()).account.id as string;
    const db = openDatabase(databasePath);
    const snapshot = () =>
      [
        schema.account,
        schema.booking,
        schema.bookingSplit,
        schema.transfer,
        schema.expectedPayment,
        schema.expectedPaymentVersion,
      ].map((t) => db.db.select().from(t).all());
    const before = snapshot();
    const context =
      profile === 'desktop-layout'
        ? await browser.newContext({
            baseURL: origin,
            storageState: await page.context().storageState(),
            viewport: { width: 1440, height: 900 },
            isMobile: false,
            hasTouch: false,
            deviceScaleFactor: 1,
            serviceWorkers: 'block',
          })
        : page.context();
    const active = profile === 'desktop-layout' ? await context.newPage() : page;
    try {
      await active.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'));
      for (const selected of ['light', 'dark'] as const) {
        await active.goto(`/konten/${id}`);
        await theme(active, selected);
        const launch = active.getByRole('button', { name: 'Abrechnung hochladen', exact: true });
        await expect(launch).toBeVisible();
        await launch.focus();
        await active.keyboard.press('Enter');
        const dialog = active.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const bytes = await syntheticColumnarPayslipPdf(
          [
            [{ x: 40, text: `Rechnungsnummer: SYNTHETIC-${profile}-${selected}` }],
            [{ x: 40, text: 'Rechnungtdaium: 01.10.2026' }],
            [
              { x: 40, text: 'Total Neto' },
              { x: 280, text: 'MwSt Betrag' },
              { x: 440, text: 'Toial Bruto in EUR' },
            ],
            [
              { x: 40, text: 'Kartensumme ****1234' },
              { x: 520, text: '70,00', right: true },
            ],
            [
              { x: 40, text: 'Kartensumme ****5678' },
              { x: 520, text: '50,00', right: true },
            ],
            [
              { x: 40, text: 'Gesamt Firmensumme' },
              { x: 250, text: '100,00', right: true },
              { x: 410, text: '20,00', right: true },
              { x: 520, text: '120,00', right: true },
            ],
            [{ x: 40, text: 'Zahlungsform: Bankeinzug / 0 Tage netto' }],
          ],
          '',
        );
        await dialog
          .getByLabel('Abrechnungs-PDF auswählen', { exact: true })
          .setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: bytes });
        await expect(dialog.getByLabel('Abrechnungsbetrag', { exact: true })).toHaveValue('120,00');
        const debit = dialog.getByLabel('Einzugsdatum', { exact: true }),
          save = dialog.getByRole('button', { name: 'Als geprüft speichern', exact: true });
        await expect(debit).toHaveValue('');
        await expect(save).toBeDisabled();
        await expect(dialog).toContainText(
          'Ausstellungsdatum und Zahlungsbedingungen ersetzen es nicht',
        );
        await debit.fill('10.10.2026');
        await debit.press('Tab');
        await expect(save).toBeEnabled();
        await save.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
        const box = await save.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(
          await save.evaluate((e) => {
            const r = e.getBoundingClientRect();
            return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
          }),
        ).toBe(true);
        await save.focus();
        await active.keyboard.press('Enter');
        await expect(
          dialog.getByText('Dokumentstand gespeichert. Keine Zahlung oder Buchung erstellt.', {
            exact: true,
          }),
        ).toBeVisible();
        const undo = dialog.getByRole('button', { name: 'Rückgängig', exact: true });
        await expect(undo).toBeVisible();
        await undo.focus();
        const list = await active.request.get(`${origin}/api/statement-intake?accountId=${id}`);
        expect(list.status()).toBe(200);
        const row = (await list.json()).intakes.find(
          (r: { proposal: { fields: { reference: { value: string } } } }) =>
            r.proposal.fields.reference.value === `SYNTHETIC-${profile}-${selected}`,
        );
        expect(row).toMatchObject({
          status: 'reviewed',
          reviewed: {
            fields: {
              payableCents: { value: 12000, origin: 'printed' },
              debitDate: { value: '2026-10-10', origin: 'owner' },
            },
          },
        });
        const source = await active.request.get(origin + `/api/receipts/${row.receiptId}/download`);
        expect(source.status()).toBe(200);
        expect(await source.body()).toEqual(bytes);
        expect(
          (await new AxeBuilder({ page: active }).include('dialog[open]').analyze()).violations,
        ).toEqual([]);
        expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
        expect(
          await active.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        const undoGeometry = await undo.evaluate((button) => {
          const box = (r: DOMRect) => ({
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          });
          const rect = button.getBoundingClientRect(),
            range = document.createRange();
          range.selectNodeContents(button);
          const text = range.getBoundingClientRect();
          const clipping = [];
          for (let parent = button.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent),
              r = parent.getBoundingClientRect();
            if (/(hidden|clip|auto|scroll)/.test(style.overflowX + ' ' + style.overflowY))
              clipping.push({
                left: r.left + parent.clientLeft,
                top: r.top + parent.clientTop,
                right: r.left + parent.clientLeft + parent.clientWidth,
                bottom: r.top + parent.clientTop + parent.clientHeight,
                x: /(hidden|clip|auto|scroll)/.test(style.overflowX),
                y: /(hidden|clip|auto|scroll)/.test(style.overflowY),
              });
          }
          const toast = button.closest('.toast-body')!.getBoundingClientRect();
          const ownsCorners = (r: DOMRect) =>
            [r.left + 1, r.right - 1].every((x) =>
              [r.top + 1, r.bottom - 1].every((y) =>
                button.contains(document.elementFromPoint(x, y)),
              ),
            );
          const ownsEdges = (r: DOMRect) =>
            [
              [r.left + 1, r.y + r.height / 2],
              [r.right - 1, r.y + r.height / 2],
              [r.x + r.width / 2, r.top + 1],
              [r.x + r.width / 2, r.bottom - 1],
            ].every(([x, y]) => button.contains(document.elementFromPoint(x!, y!)));
          const footer = [...button.closest('dialog')!.querySelectorAll('button')]
            .filter((e) =>
              ['Prüfung wieder öffnen', 'Dokument entfernen', 'Stand neu laden'].includes(
                e.textContent!.trim(),
              ),
            )
            .map((e) => {
              const r = e.getBoundingClientRect();
              const scroll = [];
              for (let parent = e.parentElement; parent; parent = parent.parentElement) {
                if (parent.scrollHeight > parent.clientHeight) {
                  const r = parent.getBoundingClientRect();
                  scroll.push({
                    tag: parent.tagName,
                    className: parent.className,
                    scrollTop: parent.scrollTop,
                    maximum: parent.scrollHeight - parent.clientHeight,
                    clientHeight: parent.clientHeight,
                    rect: box(r),
                  });
                }
              }
              return {
                action: e.textContent!.trim(),
                rect: box(r),
                scroll,
                ownsCentre: e.contains(
                  document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
                ),
                intersectsToast:
                  r.left < toast.right &&
                  r.right > toast.left &&
                  r.top < toast.bottom &&
                  r.bottom > toast.top,
              };
            });
          return {
            button: box(rect),
            text: box(text),
            toast: box(toast),
            footer,
            viewport: { width: innerWidth, height: innerHeight },
            clipping,
            ownsButtonEdges: ownsEdges(rect),
            ownsTextCorners: ownsCorners(text),
            ownsCentre: button.contains(
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
            ),
          };
        });
        await writeFile(
          info.outputPath(`undo-${profile}-${selected}.json`),
          JSON.stringify(undoGeometry, null, 2),
        );
        expect(undoGeometry.button.width).toBeGreaterThanOrEqual(44);
        expect(undoGeometry.button.height).toBeGreaterThanOrEqual(44);
        for (const rect of [undoGeometry.button, undoGeometry.text]) {
          expect(rect.left).toBeGreaterThanOrEqual(0);
          expect(rect.top).toBeGreaterThanOrEqual(0);
          expect(rect.right).toBeLessThanOrEqual(undoGeometry.viewport.width);
          expect(rect.bottom).toBeLessThanOrEqual(undoGeometry.viewport.height);
        }
        expect(undoGeometry.text.left).toBeGreaterThanOrEqual(undoGeometry.button.left);
        expect(undoGeometry.text.right).toBeLessThanOrEqual(undoGeometry.button.right);
        expect(undoGeometry.text.top).toBeGreaterThanOrEqual(undoGeometry.button.top);
        expect(undoGeometry.text.bottom).toBeLessThanOrEqual(undoGeometry.button.bottom);
        expect(undoGeometry.ownsCentre).toBe(true);
        expect(undoGeometry.ownsButtonEdges).toBe(true);
        expect(undoGeometry.ownsTextCorners).toBe(true);
        const footerAfterScroll = [];
        for (const name of ['Prüfung wieder öffnen', 'Dokument entfernen', 'Stand neu laden']) {
          const action = dialog.getByRole('button', { name, exact: true });
          await action.evaluate((e) =>
            e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }),
          );
          const rect = await action.boundingBox();
          const physical = await action.evaluate((e) => {
            const r = e.getBoundingClientRect();
            const scroll = [];
            for (let parent = e.parentElement; parent; parent = parent.parentElement) {
              if (parent.scrollHeight > parent.clientHeight) {
                const r = parent.getBoundingClientRect();
                scroll.push({
                  tag: parent.tagName,
                  className: parent.className,
                  scrollTop: parent.scrollTop,
                  maximum: parent.scrollHeight - parent.clientHeight,
                  clientHeight: parent.clientHeight,
                  rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
                });
              }
            }
            return {
              ownsCentre: e.contains(
                document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
              ),
              scroll,
            };
          });
          const ownsCentre = physical.ownsCentre;
          footerAfterScroll.push({ name, rect, ownsCentre, scroll: physical.scroll });
          await writeFile(
            info.outputPath(`footer-${profile}-${selected}.json`),
            JSON.stringify(footerAfterScroll, null, 2),
          );
          expect(rect!.width).toBeGreaterThanOrEqual(44);
          expect(rect!.height).toBeGreaterThanOrEqual(44);
          expect(rect!.x).toBeGreaterThanOrEqual(0);
          expect(rect!.y).toBeGreaterThanOrEqual(0);
          expect(rect!.x + rect!.width).toBeLessThanOrEqual(active.viewportSize()!.width);
          expect(rect!.y + rect!.height).toBeLessThanOrEqual(active.viewportSize()!.height);
          expect(ownsCentre).toBe(true);
        }
        await capture(active, info, profile, selected);
        await undo.click();
        await expect
          .poll(async () => {
            const response = await active.request.get(`${origin}/api/statement-intake/${row.id}`);
            expect(response.status()).toBe(200);
            const value = (await response.json()).intake;
            return { status: value.status, reviewed: value.reviewed };
          })
          .toEqual({ status: 'pending', reviewed: null });
        await dialog.getByRole('button', { name: 'Stand neu laden', exact: true }).click();
        await expect(dialog.getByLabel('Einzugsdatum', { exact: true })).toHaveValue('');
        await expect(
          dialog.getByRole('button', { name: 'Als geprüft speichern', exact: true }),
        ).toBeDisabled();
        await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
        await active.evaluate(() => {
          localStorage.setItem('budget-amounts-hidden', '1');
        });
        await active.reload();
        await launch.click();
        const history = active.locator('.statement-history-726');
        await history.locator('summary').click();
        await expect(history).not.toContainText('120,00');
        await expect(history).toContainText('•••');
        await active.evaluate(() => localStorage.removeItem('budget-amounts-hidden'));
        await active.reload();
        expect(snapshot()).toEqual(before);
      }
    } finally {
      db.close();
      if (profile === 'desktop-layout') await context.close();
    }
  });
async function capture(page: Page, info: TestInfo, profile: string, selected: string) {
  const runtime = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    deviceScaleFactor: devicePixelRatio,
    coarse: matchMedia('(pointer: coarse)').matches,
    rawMaxTouchPoints: navigator.maxTouchPoints,
    rawSystemTheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    selectedTheme: document.documentElement.dataset['theme'],
  }));
  const name = `statement-${profile}-${selected}`;
  await page.screenshot({
    path: info.outputPath(name + '.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await writeFile(
    info.outputPath(name + '.json'),
    JSON.stringify(
      {
        engine: page.context().browser()!.browserType().name(),
        project: info.project.name,
        profile,
        selected,
        actions: 'Playwright file chooser, focus/Enter/click; no physical touch claim',
        scope: 'Open statement dialog Axe; six financial tables unchanged; synthetic PDF only',
        ...runtime,
      },
      null,
      2,
    ),
  );
}
