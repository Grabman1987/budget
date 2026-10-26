import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openDatabase } from '../packages/db/src/client';
import { INCOME_TYPES } from '../packages/db/src/schema/budget';
import { test } from './isolated-ledger';

test('guided month close walks all five steps, undoes the whole plan and keeps an editable close marker', async ({
  page,
  isolatedLedger,
}, info) => {
  const screenshot = async (name: string) => {
    const toastAction = page.locator('.toast.is-open button');
    if (await toastAction.isVisible()) await toastAction.press('Escape');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: 'disabled' });
  };
  const expectNextClear = async () => {
    const next = await page.getByRole('button', { name: 'Weiter', exact: true }).boundingBox();
    const capture = await page.locator('.fab').boundingBox();
    expect(
      next &&
        capture &&
        (next.x + next.width <= capture.x ||
          next.y + next.height <= capture.y ||
          capture.y + capture.height <= next.y),
    ).toBe(true);
  };
  const write = async (method: string, path: string, data: unknown) => {
    const res = await page.request.fetch(`${isolatedLedger.origin}/api${path}`, {
      method,
      data,
      headers: { origin: isolatedLedger.origin },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const { account } = await write('POST', '/accounts', {
    name: 'Musterkonto',
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const { account: manual } = await write('POST', '/accounts', {
    name: 'Musteranlage',
    type: 'p2p',
    openingDate: '2026-09-01',
  });
  const { group } = await write('POST', '/categories/groups', { name: 'Mustergruppe' });
  const { category } = await write('POST', '/categories', {
    name: 'Musterbedarf',
    groupId: group.id,
    class: 'need',
  });
  const { id: inboxBookingId } = await write('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-09-12',
    amountCents: -400,
    splits: [{ amountCents: -400 }],
  });
  await write('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-01',
    amountCents: -50,
    splits: [{ amountCents: -50 }],
  });
  await page.goto('/plan/monat?monat=2026-09');
  await page.locator('.plan-menu summary', { hasText: 'Optionen' }).click();
  await page
    .getByRole('link', { name: 'Monatsabschluss starten oder fortsetzen', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Monatsabschluss · September 2026', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. Prüfen' })).toBeVisible();
  await expect(page.getByTestId('inbox-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Zuordnen', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(editor).toBeVisible();
  // Finish the native entry motion before opening the anchored picker. Pointer retries
  // during that motion can scroll its anchor out of the dialog's clipped body.
  await editor.evaluate(async (dialog) => {
    await Promise.all(dialog.getAnimations().map((animation) => animation.finished));
  });
  await editor.getByLabel('Kategorie', { exact: true }).fill('Musterbedarf');
  await editor
    .getByRole('listbox', { name: 'Kategorie, Vorschläge', exact: true })
    .getByRole('option', { name: /^Musterbedarf(?:\s|$)/ })
    .click();
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === `/api/bookings/${inboxBookingId}`,
  );
  await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
  const saveResponse = await saved;
  expect(saveResponse.request().postDataJSON()).toMatchObject({
    splits: [{ categoryId: category.id }],
  });
  expect(saveResponse.status()).toBe(200);
  expect((await saveResponse.json()).bookings).toMatchObject([
    { id: inboxBookingId, splits: [{ categoryId: category.id }] },
  ]);
  await expect(editor).toBeHidden();
  await expect(page.getByTestId('inbox-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2. Konten abgleichen' })).toBeVisible();
  await screenshot('month-close-accounts.png');
  if (info.project.name === 'mobile') await expectNextClear();
  await page.reload();
  await expect(page.getByRole('heading', { name: '2. Konten abgleichen' })).toBeVisible();
  await page.getByRole('button', { name: 'Kontostand prüfen', exact: true }).click();
  await page.getByLabel('Saldo laut Bank').fill('96');
  await page.getByRole('button', { name: /Festschreiben/ }).click();
  // The previous mutation's onDone clears the shared selected row. Wait for that
  // completion before opening the next account's value editor.
  await expect(page.getByLabel('Saldo laut Bank')).toBeHidden();
  await page.getByRole('button', { name: 'Wert aktualisieren', exact: true }).click();
  await page.getByLabel('Wert in EUR').fill('125');
  await page.getByRole('button', { name: 'Wert speichern', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled();
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Weiter', exact: true }).scrollIntoViewIfNeeded();
    await expectNextClear();
  }
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3. Überzogenes ausgleichen' })).toBeVisible();
  await page.getByRole('button', { name: 'Geld verschieben', exact: true }).click();
  await screenshot('month-close-cover.png');
  await page.getByRole('button', { name: /Decken.*4,00/ }).click();
  await expect(page.getByText('Keine Kategorie ist überzogen.')).toBeVisible();
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Weiter', exact: true }).scrollIntoViewIfNeeded();
    await expectNextClear();
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(`month-close-${scheme}.png`);
  }
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4. Nächsten Monat planen' })).toBeVisible();
  await page.getByLabel('Plan für Musterbedarf').fill('95,50');
  await expect(page.getByTestId('close-plan-remaining')).toContainText('0,00');
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Plan übernehmen · alle', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled();
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect(page.getByTestId('close-plan-remaining')).toContainText('95,50');
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByLabel('Plan für Musterbedarf').fill('95,50');
  await page.getByRole('button', { name: 'Plan übernehmen · alle', exact: true }).click();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(`month-close-plan-${scheme}.png`);
  }
  if (info.project.name === 'mobile') await expectNextClear();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: '5. Ergebnis' })).toBeVisible();
  await page
    .locator('summary', { hasText: 'Monatsbericht, Abweichungen und offene Regeln' })
    .click();
  await expect(
    page.getByRole('article', { name: 'Monats-One-Pager September 2026' }),
  ).toBeVisible();
  await expect(page.getByTestId('month-close-verdict')).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(`month-close-review-${scheme}.png`);
  }
  await page.getByRole('button', { name: 'Monat abschließen', exact: true }).click();
  await expect(
    page.getByText(
      /Stand gespeichert am .*Buchungen bleiben nach den bisherigen Regeln bearbeitbar\./,
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      /Stand gespeichert am .*Buchungen bleiben nach den bisherigen Regeln bearbeitbar\./,
    ),
  ).toBeVisible();
  const state = await page.request.get(`${isolatedLedger.origin}/api/month-close/2026-09`);
  const result = await state.json();
  expect(result.state.currentStep).toBe(5);
  expect(result.state.closedOn).toBe('2026-10-02');
  expect(Number.isFinite(Date.parse(result.state.closedAt))).toBe(true);
  expect(result.state.snapshot.sourceRevision).toBe(result.sourceRevision);
  expect(result.steps.map((s: { status: string }) => s.status)).toEqual([
    'done',
    'done',
    'done',
    'done',
    'done',
  ]);
  const ledger = await page.request.get(`${isolatedLedger.origin}/api/bookings`);
  expect((await ledger.json()).items).toHaveLength(2);
  expect(manual.id).toBeTruthy();
  expect(category.id).toBeTruthy();
  await page.goto('/plan/monat?monat=2026-09');
  await page.locator('.plan-menu summary', { hasText: 'Optionen' }).click();
  await expect(
    page.getByRole('link', { name: 'Monatsabschluss starten oder fortsetzen', exact: true }),
  ).toBeVisible();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  else await page.keyboard.press('Control+k');
  await page
    .getByRole('listbox', { name: 'Suchergebnisse' })
    .getByRole('option', { name: /Monatsabschluss starten/ })
    .click();
  await expect(page.getByRole('heading', { name: '5. Ergebnis' })).toBeVisible();
});

test('quiet accounts are reviewed and confirmed together with one exact grouped Undo', async ({
  page,
  isolatedLedger,
}, info) => {
  const write = async (path: string, data: unknown) => {
    const response = await page.request.post(`${isolatedLedger.origin}/api${path}`, {
      data,
      headers: { origin: isolatedLedger.origin },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const read = async (path: string) => {
    const response = await page.request.get(`${isolatedLedger.origin}/api${path}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const first = (
    await write('/accounts', {
      name: 'Muster Giro ruhig',
      type: 'checking',
      currency: 'EUR',
      openingDate: '2026-09-01',
      openingBalanceCents: 10000,
    })
  ).account;
  const second = (
    await write('/accounts', {
      name: 'Muster Sparen ruhig',
      type: 'savings',
      currency: 'EUR',
      openingDate: '2026-09-01',
      openingBalanceCents: 70000,
    })
  ).account;
  const group = (await write('/categories/groups', { name: 'Muster Ruhe' })).group;
  const category = (
    await write('/categories', { name: 'Muster Bedarf', groupId: group.id, class: 'need' })
  ).category;
  await write('/bookings', {
    type: 'booking',
    accountId: first.id,
    date: '2026-09-10',
    amountCents: 2345,
    status: 'confirmed',
    splits: [{ amountCents: 2345, incomeTypeId: INCOME_TYPES.salary.id }],
  });
  await write('/bookings', {
    type: 'booking',
    accountId: second.id,
    date: '2026-09-11',
    amountCents: -2110,
    status: 'confirmed',
    splits: [{ amountCents: -2110, categoryId: category.id }],
  });
  await page.request
    .put(`${isolatedLedger.origin}/api/budget/2026-09/assigned`, {
      data: { items: [{ categoryId: category.id, assignedCents: 2110 }] },
      headers: { origin: isolatedLedger.origin },
    })
    .then((response) => expect(response.ok()).toBeTruthy());
  for (const [id, balance] of [
    [first.id, 12345],
    [second.id, 67890],
  ] as const) {
    await write(`/accounts/${id}/reconciliation`, {
      date: '2026-09-15',
      statementBalanceCents: balance,
    });
  }
  const snapshot = () => {
    const opened = openDatabase(isolatedLedger.databasePath);
    try {
      return {
        accounts: opened.sqlite.prepare('SELECT * FROM account ORDER BY id').all(),
        bookings: opened.sqlite.prepare('SELECT * FROM booking ORDER BY id').all(),
        splits: opened.sqlite.prepare('SELECT * FROM booking_split ORDER BY id').all(),
        checks: opened.sqlite
          .prepare('SELECT * FROM account_reconciliation WHERE deleted_at IS NULL ORDER BY id')
          .all(),
        audits: opened.sqlite
          .prepare(
            'SELECT id, group_id, entity_type, entity_id, action, undo_of_id FROM audit_log ORDER BY rowid',
          )
          .all() as {
          id: string;
          group_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          undo_of_id: string | null;
        }[],
      };
    } finally {
      opened.close();
    }
  };
  const original = snapshot();
  const reviewed = await read('/month-close/2026-09');
  expect(
    reviewed.unchangedConfirmation.accounts.map(
      (account: { id: string; statementBalanceCents: number }) => [
        account.id,
        account.statementBalanceCents,
      ],
    ),
  ).toEqual([
    [first.id, 12345],
    [second.id, 67890],
  ]);
  await page.goto('/monatsabschluss/2026-09');
  const row = page.locator('.close-unchanged');
  const confirm = row.getByRole('button', { name: 'Gemeinsam bestätigen', exact: true });
  await expect(confirm).toBeEnabled();
  await expect(row).toContainText('123,45');
  await expect(row).toContainText('678,90');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if ((page.viewportSize()?.width ?? 1440) < 768) {
      for (const target of [confirm, ...(await row.getByRole('link').all())]) {
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`month-close-bulk-${scheme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  expect(snapshot()).toEqual(original);
  const posting = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/month-close/2026-09/reconcile-unchanged',
  );
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/month-close/2026-09/reconcile-unchanged',
  );
  await confirm.click();
  expect((await posting).postDataJSON()).toEqual({
    accountIds: [first.id, second.id],
    asOf: reviewed.unchangedConfirmation.asOf,
    revision: reviewed.unchangedConfirmation.revision,
  });
  const response = await saved;
  expect(response.status()).toBe(201);
  const result = await response.json();
  expect(result.changedCount).toBe(2);
  expect(result.reconciliations.map((check: { accountId: string }) => check.accountId)).toEqual([
    first.id,
    second.id,
  ]);
  const checked = snapshot();
  expect(checked.checks).toHaveLength(4);
  for (const [id, balance] of [
    [first.id, 12345],
    [second.id, 67890],
  ] as const) {
    expect((await read(`/accounts/${id}/reconciliations`)).reconciliations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: '2026-09-30',
          statementBalanceCents: balance,
          clearedBalanceCents: balance,
          adjustmentBookingId: null,
        }),
      ]),
    );
  }
  const created = checked.audits.filter((entry) => entry.group_id === result.groupId);
  expect(created).toHaveLength(2);
  expect(created.map((entry) => entry.entity_id).sort()).toEqual(
    result.reconciliations
      .map((check: { reconciliationId: string }) => check.reconciliationId)
      .sort(),
  );
  expect(
    created.every(
      (entry) => entry.entity_type === 'account_reconciliation' && entry.action === 'create',
    ),
  ).toBe(true);
  const undoResponse = page.waitForResponse(
    (answer) =>
      answer.request().method() === 'POST' && new URL(answer.url()).pathname === '/api/undo',
  );
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  const undone = await undoResponse;
  expect(undone.request().postDataJSON()).toEqual({ groupId: result.groupId });
  expect(undone.status()).toBe(200);
  const undoResult = await undone.json();
  const restored = snapshot();
  expect(restored.accounts).toEqual(original.accounts);
  expect(restored.bookings).toEqual(original.bookings);
  expect(restored.splits).toEqual(original.splits);
  expect(restored.checks).toEqual(original.checks);
  expect(restored.audits.slice(0, original.audits.length)).toEqual(original.audits);
  expect(restored.audits).toHaveLength(original.audits.length + 4);
  expect(
    restored.audits
      .filter((entry) => entry.group_id === undoResult.groupId)
      .map((entry) => entry.undo_of_id)
      .sort(),
  ).toEqual(created.map((entry) => entry.id).sort());
});
