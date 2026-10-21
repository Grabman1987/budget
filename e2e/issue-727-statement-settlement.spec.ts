import AxeBuilder from '@axe-core/playwright';
import {
  accounts,
  categories,
  createEntity,
  createBooking,
  getBooking,
  history,
  openDatabase,
  schema,
  stageStatementIntake,
  mutateStatementIntake,
} from '@budget/db';
import { parseStatementText, type StatementSettlementState } from '@budget/domain';
import { expect, type Page, type Locator } from '@playwright/test';
import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { digest, storeReceipt } from '../apps/server/src/receipts/files';
import { syntheticPayslipPdf } from '../apps/server/src/payslips/testing';
import { test } from './isolated-ledger';
test.use({ ledgerToday: '2026-10-11' });
const ctx = { actor: 'synthetic-native-727' };
async function theme(page: Page, dark: boolean) {
  const current = await page.evaluate(() => document.documentElement.dataset['theme'] === 'dark');
  if (current === dark) return;
  if (page.viewportSize()!.width === 390) {
    const summary = page.locator('.m-profile > summary');
    await summary.click();
    await page
      .locator('.m-profile')
      .getByRole('button', { name: dark ? 'Dunkle Blaupause' : 'Heller Zeichenfilm', exact: true })
      .click();
    await summary.click();
  } else
    await page
      .locator('.sidebar-foot')
      .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
      .click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset['theme'] === 'dark'))
    .toBe(dark);
}
async function hit(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  const geometry = await button.evaluate((element) => {
    const r = element.getBoundingClientRect(),
      range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      textLeft: text.left,
      textRight: text.right,
      textTop: text.top,
      textBottom: text.bottom,
      hit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport.width);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.textTop).toBeGreaterThanOrEqual(geometry.top);
  expect(geometry.textBottom).toBeLessThanOrEqual(geometry.bottom);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport.height);
  expect(geometry.textLeft).toBeGreaterThanOrEqual(geometry.left);
  expect(geometry.textRight).toBeLessThanOrEqual(geometry.right);
  expect(geometry.hit).toBe(true);
  return geometry;
}
for (const profile of ['desktop', 'phone'] as const)
  for (const selected of ['light', 'dark'] as const)
    test(`727 issued statement and independent credit in ${profile} ${selected}`, async ({
      page,
      browser,
      isolatedLedger,
    }, info) => {
      const { origin, databasePath } = isolatedLedger;
      const bonusFlow =
        (profile === 'desktop' && selected === 'dark') ||
        (profile === 'phone' && selected === 'light');
      const db = openDatabase(databasePath),
        funding = randomUUID(),
        card = randomUUID(),
        categoryId = randomUUID(),
        groupId = randomUUID();
      accounts.create(
        db.db,
        {
          id: funding,
          name: 'Muster Gegenkonto',
          type: 'checking',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-09-01',
          openingBalanceCents: 50000,
        },
        ctx,
      );
      accounts.create(
        db.db,
        {
          id: card,
          name: 'Muster Kreditkarte',
          type: 'credit_card',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-09-01',
          openingBalanceCents: 0,
        },
        ctx,
      );
      createEntity(db.db, schema.categoryGroup, { id: groupId, name: 'Muster Ausgaben' }, ctx);
      categories.create(
        db.db,
        { id: categoryId, groupId, name: 'Musteraufwand', class: 'need' },
        ctx,
      );
      const original = createBooking(
        db.db,
        {
          accountId: card,
          date: '2026-09-20',
          amountCents: bonusFlow ? -8000 : -10000,
          status: 'confirmed',
          splits: [{ amountCents: bonusFlow ? -8000 : -10000, categoryId }],
        },
        ctx,
      );
      const newer = bonusFlow
        ? null
        : createBooking(
            db.db,
            {
              accountId: card,
              date: '2026-10-05',
              amountCents: -3000,
              status: 'pending',
              splits: [{ amountCents: -3000, categoryId }],
            },
            ctx,
          );
      const originalBefore = getBooking(db.db, original),
        originalHistory = history(db.db, 'booking', original);
      const newerBefore = newer ? getBooking(db.db, newer) : null,
        newerHistory = newer ? history(db.db, 'booking', newer) : null;
      const lines = [
        'Rechnungsnummer: SYNTHETIC-727',
        'Rechnungsdatum: 01.10.2026',
        'Abrechnungszeitraum: 01.09.2026 - 30.09.2026',
        `Abrechnungsbetrag: ${bonusFlow ? '78,75' : '100,00'} EUR`,
      ];
      const bytes = await syntheticPayslipPdf(lines, ''),
        sha256 = digest(bytes);
      await storeReceipt(join(dirname(databasePath), 'receipts'), bytes);
      const staged = stageStatementIntake(
        db.db,
        {
          accountId: card,
          sha256,
          sizeBytes: bytes.length,
          filename: 'synthetic-statement.pdf',
          proposal: parseStatementText(lines.join('\n'), sha256),
        },
        ctx,
      ).intake;
      const source = mutateStatementIntake(
        db.db,
        staged.id,
        staged,
        'review',
        {
          facts: {
            reference: 'SYNTHETIC-727',
            issueDate: '2026-10-01',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            payableCents: bonusFlow ? 7875 : 10000,
            currency: 'EUR',
            debitDate: '2026-10-10',
            accountHint: null,
          },
        },
        ctx,
      ).intake;
      const context = await browser.newContext({
        baseURL: origin,
        storageState: await page.context().storageState(),
        viewport:
          profile === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
        deviceScaleFactor: profile === 'desktop' ? 1 : 3,
        isMobile: profile === 'phone',
        hasTouch: profile === 'phone',
        serviceWorkers: 'block',
      });
      const active = await context.newPage();
      const balance = async () => {
        const response = await active.request.get(origin + '/api/accounts?asOf=2026-10-11');
        expect(response.status()).toBe(200);
        const data = (await response.json()) as {
          accounts: { id: string; balanceCents: number }[];
        };
        return {
          funding: data.accounts.find((a) => a.id === funding)!.balanceCents,
          card: data.accounts.find((a) => a.id === card)!.balanceCents,
        };
      };
      const state = async () => {
        const response = await active.request.get(
          origin + `/api/statement-settlements?cardAccountId=${card}`,
        );
        expect(response.status()).toBe(200);
        return (await response.json()) as StatementSettlementState;
      };
      try {
        expect(await balance()).toEqual(
          bonusFlow ? { funding: 50000, card: -8000 } : { funding: 50000, card: -13000 },
        );
        await active.goto(`/konten/${card}`);
        await theme(active, selected === 'dark');
        await active.getByRole('button', { name: 'Abrechnung hochladen', exact: true }).click();
        await active.locator('.statement-history-726 > summary').click();
        await active.getByRole('button', { name: /SYNTHETIC-727/ }).click();
        const dialog = active.getByRole('dialog');
        await expect(dialog.getByLabel('Abrechnungsbetrag', { exact: true })).toHaveValue(
          bonusFlow ? '78,75' : '100,00',
        );
        await expect(dialog.getByLabel('Einzugsdatum', { exact: true })).toHaveValue('10.10.2026');
        const originalResponse = await active.request.get(
          origin + `/api/receipts/${source.receiptId}/download`,
        );
        expect(originalResponse.status()).toBe(200);
        expect(digest(await originalResponse.body())).toBe(sha256);
        const entry = dialog.getByRole('button', { name: 'Abrechnungsausgleich', exact: true });
        await entry.focus();
        await active.keyboard.press('Enter');
        await expect(dialog).toHaveAccessibleName('Abrechnungsausgleich');
        await dialog.getByLabel('Ausgleich von Konto', { exact: true }).selectOption(funding);
        await dialog
          .getByLabel('Ausgleich für neue Abrechnungen aktivieren', { exact: true })
          .check();
        const configure = dialog.getByRole('button', {
          name: 'Ausgleichseinstellung speichern',
          exact: true,
        });
        await hit(configure);
        await configure.click();
        await expect.poll(async () => (await state()).config?.enabled).toBe(true);
        expect(await balance()).toEqual(
          bonusFlow ? { funding: 50000, card: -8000 } : { funding: 50000, card: -13000 },
        );
        // Real global shortcut: hidden presentation must preserve the untouched editable draft.
        const printedAmount = dialog.locator('p').filter({ hasText: 'Ausgestellter Zahlbetrag:' });
        const amountInput = dialog.getByLabel('Geprüfter Bonusbetrag', { exact: true });
        const draftBeforePrivacy = await amountInput.inputValue();
        await expect(printedAmount).toContainText(bonusFlow ? '78,75' : '100,00');
        await active.keyboard.press('Control+Shift+H');
        await expect(printedAmount).toContainText('•••');
        await expect(printedAmount).not.toContainText(bonusFlow ? '78,75' : '100,00');
        await expect(amountInput).toHaveAttribute('type', 'password');
        await expect(amountInput).toHaveValue(draftBeforePrivacy);
        await active.keyboard.press('Control+Shift+H');
        await expect(printedAmount).toContainText(bonusFlow ? '78,75' : '100,00');
        await expect
          .poll(() => amountInput.evaluate((input) => (input as HTMLInputElement).type))
          .toBe('text');
        await expect(amountInput).toHaveValue(draftBeforePrivacy);
        // checkVisibility matches pinned Playwright visibility semantics for closed details.
        // Offscreen layout targets still require44px; viewport/hit ownership is proved by hit().
        const controlGeometry = await dialog
          .locator('button,input,select,summary,a.btn')
          .evaluateAll((elements) =>
            elements
              .filter((element) => element.checkVisibility())
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  tag: element.tagName,
                  type: element.getAttribute('type'),
                  width: rect.width,
                  height: rect.height,
                };
              }),
          );
        expect(controlGeometry.length).toBeGreaterThan(0);
        for (const control of controlGeometry) {
          expect(control.width).toBeGreaterThanOrEqual(44);
          expect(control.height).toBeGreaterThanOrEqual(44);
        }
        if (bonusFlow) {
          await dialog.getByLabel('Geprüfter Bonusbetrag', { exact: true }).fill('1,25');
          const date = dialog.getByLabel('Datum der Gutschrift', { exact: true });
          await expect(date).toHaveAttribute('inputmode', 'text');
          await date.fill('10.10.2026');
          // fill verifies form handling, not a physical OS keyboard.
          await dialog
            .getByLabel('Behandlung des Bonus', { exact: true })
            .selectOption('gross_then_credit');
          await dialog.getByLabel(/Musteraufwand.*80,00.*bestätigt/).check();
          await dialog.getByLabel('Bonusanteil · Musteraufwand', { exact: true }).fill('1,25');
          await dialog
            .getByLabel('Bestehende Gutschriften geprüft; keine doppelte Zuordnung', {
              exact: true,
            })
            .check();
          await dialog
            .getByLabel('Gebühren und andere Anpassungen ausdrücklich geprüft', { exact: true })
            .check();
          await dialog
            .getByRole('button', { name: 'Bonusnachweis annehmen · ohne Buchung', exact: true })
            .click();
          await expect.poll(async () => (await state()).bonuses[0]?.state).toBe('ready');
          expect(await balance()).toEqual({ funding: 50000, card: -8000 });
          const create = dialog.getByRole('button', { name: 'Gutschrift erstellen', exact: true });
          await hit(create);
          await create.click();
          await expect.poll(balance).toEqual({ funding: 50000, card: -7875 });
        }
        await dialog
          .getByRole('button', { name: 'Abrechnung annehmen · ohne Buchung', exact: true })
          .click();
        await expect.poll(async () => (await state()).settlements[0]?.state).toBe('open');
        expect(await balance()).toEqual(
          bonusFlow ? { funding: 50000, card: -7875 } : { funding: 50000, card: -13000 },
        );
        const createTransfer = dialog.getByRole('button', {
          name: 'Umbuchung erstellen',
          exact: true,
        });
        await hit(createTransfer);
        await createTransfer.click();
        await expect
          .poll(balance)
          .toEqual(bonusFlow ? { funding: 42125, card: 0 } : { funding: 40000, card: -3000 });
        const toastUndo = dialog.getByRole('button', { name: 'Rückgängig', exact: true });
        const undoGeometry = await hit(toastUndo);
        await expect
          .poll(() => active.evaluate(() => document.documentElement.scrollWidth))
          .toBe(profile === 'desktop' ? 1440 : 390);
        expect((await new AxeBuilder({ page: active }).analyze()).violations).toEqual([]);
        const screenshot = info.outputPath(`${profile}-${selected}.png`);
        await active.screenshot({ path: screenshot, fullPage: true });
        async function undo(label: string) {
          const button = dialog.getByRole('button', { name: label, exact: true });
          await hit(button);
          active.once('dialog', (confirmation) => void confirmation.accept());
          await button.click();
        }
        if (bonusFlow && profile === 'desktop') {
          await undo('Erstellte Gutschrift rückgängig machen');
          await expect.poll(balance).toEqual({ funding: 42125, card: -125 });
          await dialog
            .getByRole('button', { name: 'Aktuellen Ausgleichsstand laden', exact: true })
            .click();
          await undo('Erstellte Zahlung rückgängig machen');
          await expect.poll(balance).toEqual({ funding: 50000, card: -8000 });
        } else {
          await undo('Erstellte Zahlung rückgängig machen');
          await expect
            .poll(balance)
            .toEqual(
              bonusFlow ? { funding: 50000, card: -7875 } : { funding: 50000, card: -13000 },
            );
          if (bonusFlow) {
            await dialog
              .getByRole('button', { name: 'Aktuellen Ausgleichsstand laden', exact: true })
              .click();
            await undo('Erstellte Gutschrift rückgängig machen');
            await expect.poll(balance).toEqual({ funding: 50000, card: -8000 });
          }
        }
        expect(getBooking(db.db, original)).toEqual(originalBefore);
        expect(history(db.db, 'booking', original)).toEqual(originalHistory);
        if (newer) {
          expect(getBooking(db.db, newer)).toEqual(newerBefore);
          expect(history(db.db, 'booking', newer)).toEqual(newerHistory);
        }
        const profileProof = await active.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight },
          dpr: devicePixelRatio,
          coarse: matchMedia('(pointer: coarse)').matches,
          rawTouch: navigator.maxTouchPoints,
        }));
        expect(profileProof.viewport).toEqual(
          profile === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
        );
        expect(profileProof.dpr).toBe(profile === 'desktop' ? 1 : 3);
        expect(profileProof.coarse).toBe(profile === 'phone');
        await writeFile(
          info.outputPath('safe-proof.json'),
          JSON.stringify(
            {
              profile: selected + '-' + profile,
              profileProof,
              bonusFlow,
              financialBalances: await balance(),
              originalUnchanged: true,
              newerUnchanged: !bonusFlow,
              undoGeometry,
              privacyValidated: true,
              controlGeometry,
              qualification:
                'Synthetic real API/DB/UI. No physical keyboard/touch or whole-document visibility claim.',
            },
            null,
            2,
          ),
        );
      } finally {
        await context.close();
        db.close();
      }
    });
