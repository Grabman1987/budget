import AxeBuilder from '@axe-core/playwright';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  getBooking,
  history,
  openDatabase,
  performStatementAction,
  saveAssignmentRule,
  saveStatementAutomationConfig,
  schema,
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
  [
    cell(0, 'Karte'),
    cell(8, 'Umsatz'),
    cell(16, 'Buchung'),
    cell(24, 'Buchungstext'),
    cell(58, 'Branche'),
    cell(70, 'Betrag'),
    cell(82, 'Kurs'),
    cell(94, 'EUR Betrag'),
  ],
  [
    cell(0, '1111'),
    cell(8, previous ? '30.11.' : '30.12.'),
    cell(16, previous ? '30.11.' : '30.12.'),
    cell(24, previous ? 'Synthetic earlier merchant' : 'Synthetic current merchant'),
    cell(94, previous ? '100,00-' : '70,00-'),
  ],
];
async function setTheme(page: Page, value: 'light' | 'dark') {
  const resolvedTheme = () =>
    page.evaluate(() => {
      const selected = document.documentElement.dataset['theme'];
      return selected === 'light' || selected === 'dark'
        ? selected
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    });
  const current = await resolvedTheme();
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
  await expect.poll(resolvedTheme).toBe(value);
}
async function hit(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const geometry = await control.evaluate((element) => {
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
    test(`741 real card PDF, issued settlement and Undo in ${profile} ${selectedTheme}`, async ({
      page,
      browser,
      isolatedLedger,
    }, info) => {
      const { origin, databasePath } = isolatedLedger;
      const opened = openDatabase(databasePath),
        funding = randomUUID(),
        card = randomUUID(),
        category = randomUUID(),
        group = randomUUID();
      let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
      try {
        accounts.create(
          opened.db,
          {
            id: funding,
            name: 'Muster Einzugskonto',
            type: 'checking',
            role: 'budget',
            onBudget: true,
            openingDate: '2030-11-01',
            openingBalanceCents: 50000,
          },
          ctx,
        );
        accounts.create(
          opened.db,
          {
            id: card,
            name: 'Muster Kreditkarte',
            type: 'credit_card',
            role: 'budget',
            onBudget: true,
            openingDate: '2030-11-01',
            openingBalanceCents: 0,
          },
          ctx,
        );
        createEntity(opened.db, schema.categoryGroup, { id: group, name: 'Muster Ausgaben' }, ctx);
        categories.create(
          opened.db,
          { id: category, groupId: group, name: 'Muster Einkauf', class: 'need' },
          ctx,
        );
        saveAssignmentRule(
          opened.db,
          null,
          {
            name: 'Muster eindeutige Zuordnung',
            enabled: true,
            automatic: true,
            match: {
              mode: 'all',
              conditions: [{ type: 'counterparty', text: 'Synthetic current merchant' }],
            },
            actions: { categoryId: category },
          },
          ctx,
        );
        performStatementAction(
          opened.db,
          {
            operation: 'configure',
            key: 'synthetic-native-settlement-config',
            cardAccountId: card,
            fundingAccountId: funding,
            expectedRevision: null,
            enabled: true,
          },
          ctx,
        );
        const token = createHash('sha256')
          .update(JSON.stringify(['statement-card-v1', card, '1111']))
          .digest('hex');
        saveStatementAutomationConfig(
          opened.db,
          {
            accountId: card,
            expectedRevision: null,
            enabled: true,
            mappedCards: [{ token, accountId: card }],
            scheduledPayment: { mode: 'none' },
          },
          ctx,
        );
        const originalId = createBooking(
          opened.db,
          {
            accountId: card,
            date: '2030-11-30',
            amountCents: -10000,
            status: 'confirmed',
            memo: 'Synthetic earlier merchant',
            splits: [{ categoryId: category, amountCents: -10000 }],
          },
          ctx,
        );
        const laterId = createBooking(
          opened.db,
          {
            accountId: card,
            date: '2031-01-06',
            amountCents: -2300,
            status: 'confirmed',
            memo: 'Synthetic later purchase',
            splits: [{ categoryId: category, amountCents: -2300 }],
          },
          ctx,
        );
        const protectedRows = [originalId, laterId].map((id) => ({
          id,
          row: getBooking(opened.db, id),
          audit: history(opened.db, 'booking', id),
        }));
        const configuredViewport = page.viewportSize();
        expect(configuredViewport).not.toBeNull();
        let active = page;
        if (profile === 'desktop') {
          context = await browser.newContext({
            baseURL: origin,
            storageState: isolatedLedger.storageState,
            viewport: { width: 1440, height: 900 },
            isMobile: false,
            hasTouch: false,
            deviceScaleFactor: 1,
            serviceWorkers: 'block',
          });
          active = await context.newPage();
        } else {
          // Use the actual configured context: WebKit retains the iPhone13's390x664,
          // user agent, touch and scale. Only a non-phone project's geometry is narrowed.
          if (configuredViewport!.width !== 390)
            await active.setViewportSize({ width: 390, height: configuredViewport!.height });
          else expect(active.viewportSize()).toEqual(configuredViewport);
        }
        await active.clock.setFixedTime(new Date('2031-01-10T12:00:00+01:00'));
        const previousPdf = await syntheticColumnarPayslipPdf(rows(true), '');
        const previousResponse = await active.request.post('/api/statement-intake/upload', {
          headers: { origin },
          multipart: {
            accountId: card,
            file: {
              name: 'synthetic-previous-741.pdf',
              mimeType: 'application/pdf',
              buffer: previousPdf,
            },
          },
        });
        expect(previousResponse.status()).toBe(201);
        expect((await previousResponse.json()).automation).toBeUndefined();
        const balances = async () => {
          const response = await active.request.get('/api/accounts?asOf=2031-01-12');
          expect(response.status()).toBe(200);
          const body = (await response.json()) as {
            accounts: { id: string; balanceCents: number }[];
          };
          return [funding, card].map((id) => body.accounts.find((a) => a.id === id)!.balanceCents);
        };
        expect(await balances()).toEqual([50000, -12300]);
        await active.goto(`/konten/${card}`);
        await setTheme(active, selectedTheme);
        const opener = active.getByRole('button', { name: 'Abrechnung hochladen', exact: true });
        await hit(opener);
        await opener.click();
        const pdf = await syntheticColumnarPayslipPdf(rows(false), '');
        const uploaded = active.waitForResponse(
          (response) =>
            response.url().endsWith('/api/statement-intake/upload') &&
            response.request().method() === 'POST',
        );
        await active.getByLabel('Abrechnungs-PDF auswählen').setInputFiles({
          name: 'synthetic-current-741.pdf',
          mimeType: 'application/pdf',
          buffer: pdf,
        });
        const uploadResponse = await uploaded;
        expect(uploadResponse.status()).toBe(201);
        const body = (await uploadResponse.json()) as {
          intake: StatementIntakeView;
          automation: StatementAutomationOutcome;
        };
        expect(body.automation).toMatchObject({
          status: 'saved',
          created: 1,
          matched: 0,
          credits: 0,
          receiptLinks: 3,
          pending: [],
          reasons: [],
        });
        expect(body.intake.sha256).toBe(digest(pdf));
        const dialog = active.getByRole('dialog', { name: 'Abrechnung prüfen' });
        const undoButton = dialog.getByRole('button', { name: 'Rückgängig', exact: true });
        // The ordinary focused-toast interaction pauses its existing dismissal timer while
        // accessible result/receipt evidence is inspected; no timer or app setting is changed.
        await undoButton.focus();
        await expect.poll(balances).toEqual([33000, -2300]);
        const posted = body.automation.items!.map((item) => getBooking(opened.db, item.bookingId)!);
        expect(posted.map((b) => b.amountCents).sort((a, b) => a - b)).toEqual([
          -17000, -7000, 17000,
        ]);
        expect(posted.every((b) => b.status === 'pending' && b.source === 'import')).toBe(true);
        const source = await active.request.get(`/api/receipts/${body.intake.receiptId}/download`);
        expect(source.status()).toBe(200);
        expect((await source.body()).equals(pdf)).toBe(true);
        const result = dialog.getByRole('region', { name: 'Automatisches Verarbeitungsergebnis' });
        await expect(result.getByRole('link', { name: 'Neue Buchung' })).toHaveAttribute(
          'href',
          `/konten/buchungen?konto=${card}&buchung=${body.automation.items!.find((i) => i.role === 'created')!.bookingId}`,
        );
        await expect(result).toContainText(
          'Automatische Validierung ist keine Bestätigung einer tatsächlich ausgeführten Bankzahlung.',
        );
        const amount = dialog.getByLabel('Abrechnungsbetrag', { exact: true });
        await expect(amount).toHaveValue('170,00');
        await active.keyboard.press('Control+Shift+H');
        await expect(amount).toHaveAttribute('type', 'password');
        await expect(amount).toHaveValue('170,00');
        await active.keyboard.press('Control+Shift+H');
        await expect(amount).toHaveJSProperty('type', 'text');
        await expect(amount).toHaveValue('170,00');
        const undoGeometry = await hit(undoButton);
        await expect
          .poll(() => active.evaluate(() => document.documentElement.scrollWidth))
          .toBe(profile === 'desktop' ? 1440 : 390);
        expect(
          (await new AxeBuilder({ page: active }).include('dialog[open]').analyze()).violations,
        ).toEqual([]);
        await active.screenshot({
          path: info.outputPath(`${profile}-${selectedTheme}.png`),
          fullPage: true,
        });
        await undoButton.click();
        await expect.poll(balances).toEqual([50000, -12300]);
        for (const protectedRow of protectedRows) {
          expect(getBooking(opened.db, protectedRow.id)).toEqual(protectedRow.row);
          expect(history(opened.db, 'booking', protectedRow.id)).toEqual(protectedRow.audit);
        }
        // Dismiss the ordinary Redo toast so it cannot cover the retained-source retry.
        const redoButton = dialog.getByRole('button', { name: 'Wiederholen', exact: true });
        await redoButton.focus();
        await redoButton.press('Escape');
        await expect(redoButton).toBeHidden();
        await expect(dialog).toBeVisible();
        // Explicit retained-source retry returns historical undone state; it is not permission to redo.
        const retry = dialog.getByRole('button', {
          name: 'Gespeichertes PDF automatisch prüfen',
          exact: true,
        });
        await hit(retry);
        await retry.click();
        await expect(result).toContainText('Sie wird nicht erneut ausgeführt.');
        await expect(result.getByRole('link')).toHaveCount(0);
        expect(await balances()).toEqual([50000, -12300]);
        expect(
          opened.sqlite.prepare('SELECT count(*) AS n FROM statement_automation_run').get(),
        ).toEqual({ n: 1 });
        expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
        let manualRecovery = false;
        if (profile === 'phone') {
          const unconfiguredCard = randomUUID();
          accounts.create(
            opened.db,
            {
              id: unconfiguredCard,
              name: 'Muster Karte ohne Einrichtung',
              type: 'credit_card',
              role: 'budget',
              onBudget: true,
              openingDate: '2030-11-01',
              openingBalanceCents: 0,
            },
            ctx,
          );
          const financialRows = () =>
            JSON.stringify(
              [
                'booking',
                'booking_split',
                'transfer',
                'statement_settlement',
                'statement_bonus',
              ].map((table) => opened.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()),
            );
          const unchangedMoney = financialRows();
          const unconfiguredPdf = await syntheticColumnarPayslipPdf(
            rows(false).map((line) =>
              line.map((entry) => (entry.text === '1111' ? { ...entry, text: '2222' } : entry)),
            ),
            '',
          );
          await active.goto(`/konten/${unconfiguredCard}`);
          await setTheme(active, selectedTheme);
          await active.getByRole('button', { name: 'Abrechnung hochladen', exact: true }).click();
          const unresolvedUpload = active.waitForResponse(
            (response) =>
              response.url().endsWith('/api/statement-intake/upload') &&
              response.request().method() === 'POST',
          );
          await active.getByLabel('Abrechnungs-PDF auswählen').setInputFiles({
            name: 'synthetic-unconfigured-741.pdf',
            mimeType: 'application/pdf',
            buffer: unconfiguredPdf,
          });
          const unresolvedResponse = await unresolvedUpload;
          expect(unresolvedResponse.status()).toBe(201);
          const unresolved = (await unresolvedResponse.json()) as {
            intake: StatementIntakeView;
            automation: StatementAutomationOutcome;
          };
          expect(unresolved.automation).toMatchObject({
            status: 'review',
            runId: null,
            created: 0,
            matched: 0,
            credits: 0,
            receiptLinks: 0,
          });
          expect(unresolved.automation.reasons).toContain('automation_not_configured');
          const manualDialog = active.getByRole('dialog', { name: 'Abrechnung prüfen' });
          await expect(
            manualDialog.getByRole('region', { name: 'Automatisches Verarbeitungsergebnis' }),
          ).toContainText('Automatische Verarbeitung ist noch nicht eingerichtet.');
          expect(financialRows()).toBe(unchangedMoney);
          // A manual document review is explicit and remains nonmonetary. It does not enable
          // automatic configuration or pretend the unresolved source created any booking.
          for (const [label, value] of [
            ['Abrechnungsnummer', 'SYNTHETIC-MANUAL-741'],
            ['Ausstellungsdatum', '04.01.2031'],
            ['Zeitraum von', '04.12.2030'],
            ['Zeitraum bis', '04.01.2031'],
            ['Einzugsdatum', '12.01.2031'],
            ['Abrechnungsbetrag', '170,00'],
            ['Währung', 'EUR'],
          ] as const)
            await manualDialog.getByLabel(label, { exact: true }).fill(value);
          const saveReview = manualDialog.getByRole('button', {
            name: 'Als geprüft speichern',
            exact: true,
          });
          await expect(saveReview).toBeEnabled();
          await hit(saveReview);
          const reviewedResponse = active.waitForResponse(
            (response) =>
              new URL(response.url()).pathname ===
                `/api/statement-intake/${unresolved.intake.id}/review` &&
              response.request().method() === 'PUT',
          );
          await saveReview.click();
          const savedReview = await reviewedResponse;
          expect(savedReview.status()).toBe(200);
          const reviewed = (await savedReview.json()) as { intake: StatementIntakeView };
          expect(reviewed.intake.status).toBe('reviewed');
          expect(reviewed.intake.reviewed!.fields.reference).toMatchObject({
            value: 'SYNTHETIC-MANUAL-741',
            origin: 'owner',
          });
          await expect(manualDialog).toContainText(
            'Dokumentstand gespeichert. Keine Zahlung oder Buchung erstellt.',
          );
          expect(financialRows()).toBe(unchangedMoney);
          expect(await balances()).toEqual([50000, -12300]);
          expect(
            opened.sqlite
              .prepare('SELECT * FROM statement_automation_config WHERE account_id=?')
              .all(unconfiguredCard),
          ).toEqual([]);
          const retainedUnresolved = await active.request.get(
            `/api/receipts/${unresolved.intake.receiptId}/download`,
          );
          expect(retainedUnresolved.status()).toBe(200);
          expect((await retainedUnresolved.body()).equals(unconfiguredPdf)).toBe(true);
          manualRecovery = true;
        }
        await writeFile(
          info.outputPath('evidence.json'),
          JSON.stringify(
            {
              profile,
              selectedTheme,
              project: info.project.name,
              configuredViewport,
              actualViewport: active.viewportSize(),
              actualUserAgent: await active.evaluate(() => navigator.userAgent),
              manualRecovery,
              bookingLinkDestinationExercised: false,
              realWorker: true,
              issuedCents: 17000,
              laterExpenseCents: 2300,
              postedCents: [-17000, -7000, 17000],
              balancesAfterPosting: [33000, -2300],
              balancesAfterUndo: [50000, -12300],
              protectedHistoryUnchanged: true,
              retainedSourceBytesEqual: true,
              undoGeometry,
              privacyScope: 'untouched editable amount presentation',
              axeScope: 'open statement dialog',
              noRepostAfterUndo: true,
            },
            null,
            2,
          ),
        );
      } finally {
        await context?.close();
        opened.close();
      }
    });

test('741 clicked automatic result opens its persisted booking destination', async ({
  page,
  isolatedLedger,
}, info) => {
  const { origin, databasePath } = isolatedLedger;
  const opened = openDatabase(databasePath);
  const funding = randomUUID(),
    card = randomUUID(),
    category = randomUUID(),
    group = randomUUID();
  try {
    for (const account of [
      {
        id: funding,
        name: 'Muster Link Einzug',
        type: 'checking' as const,
        openingBalanceCents: 50000,
      },
      {
        id: card,
        name: 'Muster Link Karte',
        type: 'credit_card' as const,
        openingBalanceCents: -10000,
      },
    ])
      accounts.create(
        opened.db,
        {
          ...account,
          role: 'budget',
          onBudget: true,
          openingDate: '2030-11-01',
        },
        ctx,
      );
    createEntity(opened.db, schema.categoryGroup, { id: group, name: 'Muster Link Ausgaben' }, ctx);
    categories.create(
      opened.db,
      {
        id: category,
        groupId: group,
        name: 'Muster Link Einkauf',
        class: 'need',
      },
      ctx,
    );
    saveAssignmentRule(
      opened.db,
      null,
      {
        name: 'Muster Link Zuordnung',
        enabled: true,
        automatic: true,
        match: {
          mode: 'all',
          conditions: [{ type: 'counterparty', text: 'Synthetic current merchant' }],
        },
        actions: { categoryId: category },
      },
      ctx,
    );
    performStatementAction(
      opened.db,
      {
        operation: 'configure',
        key: 'synthetic-link-settlement-config',
        cardAccountId: card,
        fundingAccountId: funding,
        expectedRevision: null,
        enabled: true,
      },
      ctx,
    );
    const token = createHash('sha256')
      .update(JSON.stringify(['statement-card-v1', card, '1111']))
      .digest('hex');
    saveStatementAutomationConfig(
      opened.db,
      {
        accountId: card,
        expectedRevision: null,
        enabled: true,
        mappedCards: [{ token, accountId: card }],
        scheduledPayment: { mode: 'none' },
      },
      ctx,
    );
    await page.clock.setFixedTime(new Date('2031-01-10T12:00:00+01:00'));
    const previousPdf = await syntheticColumnarPayslipPdf(rows(true), '');
    const previous = await page.request.post('/api/statement-intake/upload', {
      headers: { origin },
      multipart: {
        accountId: card,
        file: {
          name: 'synthetic-link-previous-741.pdf',
          mimeType: 'application/pdf',
          buffer: previousPdf,
        },
      },
    });
    expect(previous.status()).toBe(201);
    expect((await previous.json()).automation).toBeUndefined();
    await page.goto(`/konten/${card}`);
    await page.getByRole('button', { name: 'Abrechnung hochladen', exact: true }).click();
    const pdf = await syntheticColumnarPayslipPdf(rows(false), '');
    const uploaded = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/statement-intake/upload') &&
        response.request().method() === 'POST',
    );
    await page.getByLabel('Abrechnungs-PDF auswählen').setInputFiles({
      name: 'synthetic-link-current-741.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });
    const response = await uploaded;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as {
      intake: StatementIntakeView;
      automation: StatementAutomationOutcome;
    };
    expect(body.automation).toMatchObject({
      status: 'saved',
      created: 1,
      reasons: [],
      pending: [],
    });
    const created = body.automation.items!.filter((item) => item.role === 'created');
    expect(created).toHaveLength(1);
    const bookingId = created[0]!.bookingId;
    expect(created[0]!.accountId).toBe(card);
    expect(getBooking(opened.db, bookingId)).toMatchObject({
      accountId: card,
      amountCents: -7000,
      memo: 'Synthetic current merchant',
      status: 'pending',
    });
    const dialog = page.getByRole('dialog', { name: 'Abrechnung prüfen' });
    // Dismiss the ordinary Undo toast through its keyboard interaction before navigating.
    const undo = dialog.getByRole('button', { name: 'Rückgängig', exact: true });
    await undo.focus();
    await undo.press('Escape');
    await expect(undo).toBeHidden();
    await expect(dialog).toBeVisible();
    const link = dialog
      .getByRole('region', { name: 'Automatisches Verarbeitungsergebnis' })
      .getByRole('link', { name: 'Neue Buchung', exact: true });
    const destination = `/konten/buchungen?konto=${card}&buchung=${bookingId}`;
    await expect(link).toHaveAttribute('href', destination);
    await link.click();
    await expect(page).toHaveURL(origin + destination);
    const row = page.locator(`[data-booking="${bookingId}"]`);
    await expect(page.locator('[data-booking]')).toHaveCount(1);
    await expect(row).toContainText('Synthetic current merchant');
    await expect(row).toContainText('Muster Link Einkauf');
    await expect(row).toContainText('−70,00');
    await row.getByRole('button', { name: / bearbeiten · / }).click();
    const editor = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Betrag', { exact: true })).toHaveValue('70,00');
    await expect(editor.getByLabel('Notiz', { exact: true })).toHaveValue(
      'Synthetic current merchant',
    );
    await page.screenshot({
      path: info.outputPath('clicked-booking-destination.png'),
      fullPage: true,
    });
    await writeFile(
      info.outputPath('clicked-booking-destination.json'),
      JSON.stringify(
        {
          project: info.project.name,
          viewport: page.viewportSize(),
          bookingId,
          accountId: card,
          clickedHref: destination,
          actualUrl: page.url(),
          persistedAmountCents: -7000,
          visibleEditorAmount: '70,00',
          visibleMemo: 'Synthetic current merchant',
          bookingLinkDestinationExercised: true,
        },
        null,
        2,
      ),
    );
  } finally {
    opened.close();
  }
});
