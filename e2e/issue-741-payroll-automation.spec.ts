import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  accounts,
  createBooking,
  createEntity,
  getBooking,
  history,
  openDatabase,
  readPayslipPayoutAssociation,
  schema,
  setPayslipSourceConfig,
} from '@budget/db';
import type { PayslipAutomationOutcome } from '@budget/domain';
import { expect, type Locator, type Page } from '@playwright/test';
import { syntheticPayslipPdf, syntheticWageRows } from '../apps/server/src/payslips/testing';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-03' });
const ctx = { actor: 'synthetic-payroll-native-741' };
type Uploaded = { id: string; duplicate: boolean; automation: PayslipAutomationOutcome };
async function theme(page: Page, desired: 'light' | 'dark') {
  const resolved = () =>
    page.evaluate(() => {
      const explicit = document.documentElement.dataset['theme'];
      return explicit === 'light' || explicit === 'dark'
        ? explicit
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    });
  if ((await resolved()) !== desired) {
    if (page.viewportSize()!.width === 390) {
      const menu = page.locator('.m-profile > summary');
      await menu.click();
      await page
        .locator('.m-profile')
        .getByRole('button', {
          name: desired === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
          exact: true,
        })
        .click();
      await menu.click();
    } else
      await page
        .locator('.sidebar-foot')
        .getByRole('button', {
          name: 'Hell/Dunkel umschalten',
          exact: true,
        })
        .click();
  }
  await expect.poll(resolved).toBe(desired);
}
async function hit(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      ownsCenter: element.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      ),
    };
  });
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.viewportWidth);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.viewportHeight);
  expect(box.ownsCenter).toBe(true);
  return box;
}
async function choose(page: Page, pdf: Buffer): Promise<Uploaded> {
  const opener = page.getByRole('button', { name: 'Gehaltszettel hochladen', exact: true });
  await hit(opener);
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Gehaltszettel hochladen', exact: true });
  const responseReady = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/payslip-intake/upload') &&
      response.request().method() === 'POST',
  );
  const chooserReady = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Gehaltszettel hochladen', exact: true }).click();
  const chooser = await chooserReady;
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles({
    name: 'synthetic-payroll-741.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  const response = await responseReady;
  expect(response.status()).toBe(201);
  return response.json() as Promise<Uploaded>;
}
function seed(databasePath: string, linked = false) {
  const opened = openDatabase(databasePath),
    accountId = randomUUID(),
    payeeId = randomUUID();
  accounts.create(
    opened.db,
    {
      id: accountId,
      name: 'Muster Gehaltskonto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2025-01-01',
      openingBalanceCents: 50000,
    },
    ctx,
  );
  createEntity(opened.db, schema.payee, { id: payeeId, name: 'Muster Arbeitgeber' }, ctx);
  setPayslipSourceConfig(
    opened.db,
    { salaryAccountId: accountId, automation: { payeeId }, wageTypes: {} },
    ctx,
  );
  const originalId = createBooking(
    opened.db,
    {
      accountId,
      payeeId,
      date: linked ? '2026-09-30' : '2026-08-31',
      amountCents: linked ? 297500 : 12345,
      status: 'confirmed',
      memo: 'Synthetic preserved payout',
      splits: linked
        ? [
            { categoryId: null, amountCents: 287500, incomeTypeId: 'income-salary' },
            { categoryId: null, amountCents: 10000, incomeTypeId: 'income-refund' },
          ]
        : [{ categoryId: null, amountCents: 12345, incomeTypeId: 'income-salary' }],
    },
    ctx,
  );
  return {
    opened,
    accountId,
    originalId,
    original: getBooking(opened.db, originalId),
    originalHistory: history(opened.db, 'booking', originalId),
  };
}

for (const profile of ['desktop', 'phone'] as const)
  for (const selectedTheme of ['light', 'dark'] as const)
    test(`741 actual payroll PDF, persisted payout and financial Undo in ${profile} ${selectedTheme}`, async ({
      browser,
      isolatedLedger,
    }, info) => {
      const seeded = seed(isolatedLedger.databasePath);
      const viewport =
        profile === 'desktop'
          ? { width: 1440, height: 900 }
          : {
              width: 390,
              height:
                info.project.use.viewport?.width === 390 ? info.project.use.viewport.height : 844,
            };
      let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
      let failed = false;
      let failure: unknown;
      try {
        context = await browser.newContext({
          baseURL: isolatedLedger.origin,
          storageState: isolatedLedger.storageState,
          viewport,
          isMobile: profile === 'phone',
          hasTouch: profile === 'phone',
          deviceScaleFactor: profile === 'phone' ? 3 : 1,
        });
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date('2026-10-03T12:00:00+02:00'));
        await page.goto('/reports/gehalt?monat=2026-09');
        await theme(page, selectedTheme);
        const balances = async () => {
          const reply = await page.request.get('/api/accounts?asOf=2026-10-03');
          expect(reply.status()).toBe(200);
          const body = (await reply.json()) as { accounts: { id: string; balanceCents: number }[] };
          return body.accounts.find((account) => account.id === seeded.accountId)!.balanceCents;
        };
        expect(await balances()).toBe(62345);
        const pdf = await syntheticPayslipPdf(syntheticWageRows, ''),
          result = await choose(page, pdf);
        expect(result.automation).toMatchObject({ status: 'booked', reason: 'unambiguous_source' });
        const dialog = page.getByRole('dialog', { name: 'Gehaltszettel hochladen', exact: true });
        const undo = dialog.getByRole('button', { name: 'Rückgängig', exact: true });
        // Ordinary focus pauses the existing toast expiry; it does not change any timer.
        await undo.focus();
        const payout = getBooking(seeded.opened.db, result.automation.bookingId!)!;
        expect(payout).toMatchObject({
          amountCents: 297500,
          accountId: seeded.accountId,
          date: '2026-09-30',
          status: 'pending',
        });
        expect(payout.splits).toMatchObject([
          { amountCents: 287500, incomeTypeId: 'income-salary' },
          { amountCents: 10000, incomeTypeId: 'income-refund' },
        ]);
        expect(await balances()).toBe(359845);
        const read = async () => {
          const reply = await page.request.get(`/api/payslip-intake/${result.id}`);
          expect(reply.status()).toBe(200);
          return reply.json() as Promise<{
            status: string;
            receiptId: string;
            payout: { payslipId: string; bookingId: string; accountId: string } | null;
          }>;
        };
        const saved = await read();
        expect(saved.payout).toEqual({
          payslipId: result.automation.payslipId,
          bookingId: payout.id,
          accountId: seeded.accountId,
        });
        expect((await read()).payout).toEqual(saved.payout);
        const source = await page.request.get(`/api/receipts/${saved.receiptId}/download`);
        expect(source.status()).toBe(200);
        expect((await source.body()).equals(pdf)).toBe(true);
        const link = dialog.getByRole('link', {
          name: 'Gespeicherte Auszahlung öffnen',
          exact: true,
        });
        await expect(link).toHaveAttribute(
          'href',
          `/konten/buchungen?konto=${seeded.accountId}&buchung=${payout.id}`,
        );
        // Keep the real Undo toast available. A screenshot is not an unobstructed-link claim;
        // the separate route scenario dismisses that toast and actually clicks the link.
        const linkSize = await link.evaluate((element) => {
          const r = element.getBoundingClientRect();
          return { width: r.width, height: r.height };
        });
        expect(linkSize.width).toBeGreaterThanOrEqual(44);
        expect(linkSize.height).toBeGreaterThanOrEqual(44);
        expect(
          (await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations,
        ).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const screenshot = info.outputPath(`payroll-result-${profile}-${selectedTheme}.png`);
        await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
        await info.attach('payroll-result', { path: screenshot, contentType: 'image/png' });
        await hit(undo);
        await undo.click();
        await expect.poll(balances).toBe(62345);
        await expect(
          dialog.getByRole('link', { name: 'Gespeicherte Auszahlung öffnen', exact: true }),
        ).toHaveCount(0);
        expect(await read()).toMatchObject({ status: 'pending', payout: null });
        expect(readPayslipPayoutAssociation(seeded.opened.db, result.id)).toBeNull();
        expect(getBooking(seeded.opened.db, seeded.originalId)).toEqual(seeded.original);
        expect(history(seeded.opened.db, 'booking', seeded.originalId)).toEqual(
          seeded.originalHistory,
        );
        // Re-upload through the actual endpoint: same bytes must never redo undone money.
        const repeated = await page.request.post('/api/payslip-intake/upload', {
          headers: { origin: isolatedLedger.origin },
          multipart: {
            automation: 'eligible',
            file: { name: 'same-source.pdf', mimeType: 'application/pdf', buffer: pdf },
          },
        });
        expect(repeated.status()).toBe(201);
        expect(await repeated.json()).toMatchObject({
          duplicate: true,
          automation: { status: 'unchanged', reason: 'duplicate_source', groupId: null },
        });
        expect(await balances()).toBe(62345);
        expect(await read()).toMatchObject({ status: 'pending', payout: null });
        const runtime = await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight },
          dpr: devicePixelRatio,
          maxTouchPoints: navigator.maxTouchPoints,
          coarse: matchMedia('(pointer: coarse)').matches,
          themePreference: document.documentElement.dataset['theme'] ?? null,
          resolvedTheme:
            document.documentElement.dataset['theme'] === 'dark' ||
            (document.documentElement.dataset['theme'] !== 'light' &&
              matchMedia('(prefers-color-scheme: dark)').matches)
              ? 'dark'
              : 'light',
        }));
        expect(runtime.viewport).toEqual(viewport);
        expect(runtime.resolvedTheme).toBe(selectedTheme);
        const path = info.outputPath('payroll-source-payout-proof.json');
        await writeFile(
          path,
          JSON.stringify(
            {
              source: 'synthetic-only',
              engine: browser.browserType().name(),
              project: info.project.name,
              profile,
              runtime,
              linkSize,
              sourceBytesPreserved: true,
              salaryCents: 287500,
              reimbursementCents: 10000,
              payoutCents: 297500,
              balances: [62345, 359845, 62345],
              groupedUndoReached: true,
              duplicateDidNotRepost: true,
              clickedPayoutDestination: false,
              unobstructedPayoutLinkClaim: false,
              physicalTouchClaim: false,
              privacyToggleExercised: false,
            },
            null,
            2,
          ),
        );
        await info.attach('payroll-source-payout-proof', { path, contentType: 'application/json' });
      } catch (error) {
        failed = true;
        failure = error;
      } finally {
        try {
          await context?.close();
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
        try {
          seeded.opened.close();
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
      }
      if (failed) throw failure;
    });

test('741 links an existing payout, opens its actual booking route and reloads it without changing existing money', async ({
  page,
  isolatedLedger,
}) => {
  const seeded = seed(isolatedLedger.databasePath, true);
  try {
    await page.goto('/reports/gehalt?monat=2026-09');
    const pdf = await syntheticPayslipPdf(syntheticWageRows, ''),
      result = await choose(page, pdf);
    expect(result.automation).toMatchObject({ status: 'linked', bookingId: seeded.originalId });
    const dialog = page.getByRole('dialog', { name: 'Gehaltszettel hochladen', exact: true });
    const undo = dialog.getByRole('button', { name: 'Rückgängig', exact: true });
    await undo.focus();
    // Dismiss only the focused toast using its real Escape handler, before leaving the page.
    await undo.press('Escape');
    const link = dialog.getByRole('link', { name: 'Gespeicherte Auszahlung öffnen', exact: true });
    await hit(link);
    await link.click();
    await expect(page).toHaveURL(
      new RegExp(`/konten/buchungen\\?konto=${seeded.accountId}&buchung=${seeded.originalId}$`),
    );
    await expect(
      page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true }),
    ).toBeVisible();
    const current = await page.request.get(`/api/payslip-intake/${result.id}`);
    expect(current.status()).toBe(200);
    expect(await current.json()).toMatchObject({
      payout: { bookingId: seeded.originalId, accountId: seeded.accountId },
    });
    expect(getBooking(seeded.opened.db, seeded.originalId)).toEqual(seeded.original);
    expect(history(seeded.opened.db, 'booking', seeded.originalId)).toEqual(seeded.originalHistory);
  } finally {
    seeded.opened.close();
  }
});
