import { captureCloseControl, captureSaveControl } from './ledger-helpers';
import {
  redesignLoaded,
  bankPreviewControl,
  toast,
  captureFlagControl,
  categoryLineControl,
  contactShareControl,
} from './ledger-helpers';
import { openHeuteReview } from './heute-visual-fixture';
import AxeBuilder from '@axe-core/playwright';
import { eur } from '../apps/web/src/ledger/format';
import type { LiquidityReportView } from '../apps/web/src/reports/liquidity-api';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test } from './isolated-ledger';
import { sampleTest } from './sample';

test.use({ ledgerToday: '2026-10-09' });

async function evidence(page: Page, info: TestInfo, name: string, scope: Locator) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const file = info.outputPath(`${name}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        sha,
        worktreeChanges: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }),
        viewport: page.viewportSize(),
        reducedMotion: await page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
        theme: name,
        browser: info.project.use.browserName ?? 'chromium',
        aria: await scope.ariaSnapshot(),
      },
      null,
      2,
    ),
  );
  await info.attach(name, { path: file, contentType: 'application/json' });
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: !name.startsWith('booking'),
  });
}

test('German date, arithmetic, defaults, height and visible save persist exact cents', async ({
  page,
  request,
  baseURL,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const headers = { origin: baseURL! };
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Kasse Muster',
    type: 'cash',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
  const { category } = await post('/categories', {
    groupId: group.id,
    name: 'Bedarf Muster',
    kind: 'variable',
    class: 'need',
  });
  const { payee } = await post('/payees', { name: 'Laden Muster', defaultCategoryId: category.id });
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    payeeId: payee.id,
    date: '2026-10-01',
    amountCents: -321,
  });
  await openHeuteReview(page, '/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  const amount = dialog.getByLabel('Betrag', { exact: true });
  const date = dialog.getByLabel('Datum', { exact: true });
  const save = captureSaveControl(dialog);
  await expect(amount).toBeFocused();
  await expect(date).toHaveValue('09.10.2026');
  await amount.fill('1.234,56+0,01');
  await amount.press('Enter');
  await expect(amount).toHaveValue('1.234,57');
  const receiver = dialog.getByLabel('Empfänger', { exact: true });
  await expect(receiver).toBeFocused();
  await receiver.fill('Laden Mus');
  await expect(
    dialog.getByRole('option', { name: 'Laden Muster Bedarf Muster', exact: true }),
  ).toBeVisible();
  await receiver.press('Enter');
  await expect(dialog.getByLabel('Bezahlt von', { exact: true })).toHaveValue(account.id);
  await expect(dialog.getByLabel('Kategorie', { exact: true })).toHaveValue(category.name);
  await expect(dialog.getByRole('button', { name: 'Bestätigt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.getByRole('button', { name: 'Bestätigt', exact: true })).toBeDisabled();
  await date.fill('07.10.2026');
  await date.press('Tab');
  await expect(dialog.getByLabel('Budgetmonat')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, theme);
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport({ ratio: 1 });
    // A default category adds Available and suggestion rows; Mehr remains in the body scroller.
    await dialog
      .locator('.kmore > summary')
      .evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await expect(dialog.locator('.kmore > summary')).toBeInViewport({ ratio: 1 });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport({ ratio: 1 });
    await dialog.locator('.bk-body').evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(amount).toBeInViewport({ ratio: 1 });
    await expect(date).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByLabel('Kategorie', { exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    if (page.viewportSize()!.width < 768) {
      // #995: the redesign keeps a sheet inset; rollback retains its full-screen capture.
      const topInset = (await redesignLoaded(page)) ? 24 : 0;
      expect(box!.y).toBe(topInset);
      expect(box!.height).toBe(
        (await page.evaluate(() => window.visualViewport!.height)) - topInset,
      );
      const small = await dialog
        .locator('button, input, textarea, select, summary')
        .evaluateAll((els) =>
          els
            .filter((el) => el.getClientRects().length)
            .map((el) => ({
              name: el.getAttribute('aria-label') ?? el.textContent,
              width: el.getBoundingClientRect().width,
              height: el.getBoundingClientRect().height,
            }))
            .filter((box) => box.width < 44 || box.height < 44),
        );
      expect(small).toEqual([]);
    }
    expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
    await evidence(page, info, `booking-${theme}`, dialog);
  }
  // Expanded content and the phone save action remain reachable in the body scroller.
  await dialog.locator('.kmore > summary').click();
  await dialog.getByLabel('Notiz').fill('Synthetische Abnahme');
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport({ ratio: 1 });
  await evidence(page, info, 'booking-dark-expanded', dialog);
  await save.click();
  await expect(dialog).toBeHidden();
  const bookings = (await (await request.get('/api/bookings')).json()).items;
  const saved = bookings.filter((b: { memo: string }) => b.memo === 'Synthetische Abnahme');
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    date: '2026-10-07',
    amountCents: -123457,
    accountId: account.id,
    payeeId: payee.id,
    status: 'confirmed',
  });
  expect(saved[0].splits).toEqual([
    expect.objectContaining({ categoryId: category.id, amountCents: -123457 }),
  ]);
});

test('keyboard reaches labelled controls, traps focus, cancels and returns to opener', async ({
  page,
  request,
  baseURL,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  const response = await request.post('/api/accounts', {
    headers: { origin: baseURL! },
    data: {
      name: 'Giro Muster',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 0,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const groupResponse = await request.post('/api/categories/groups', {
    headers: { origin: baseURL! },
    data: { name: 'Tastatur Muster' },
  });
  expect(groupResponse.ok()).toBe(true);
  const { group } = await groupResponse.json();
  const categoryResponse = await request.post('/api/categories', {
    headers: { origin: baseURL! },
    data: { name: 'Kategorie Tastatur', groupId: group.id, class: 'need' },
  });
  expect(categoryResponse.ok()).toBe(true);
  await openHeuteReview(page, '/');
  if (await redesignLoaded(page)) {
    // Finish the month-detail navigation before taking a keyboard opener from its shell.
    await expect(page).toHaveURL((url) => url.pathname === '/heute/details/month');
    await expect(page.getByTestId('heute-lead-value')).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }
  const opener = page
    .getByRole('link', { name: /^(Buchung|Buchung erfassen)$/ })
    .filter({ visible: true })
    .first();
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  const amount = dialog.getByLabel('Betrag', { exact: true });
  await expect(amount).toBeFocused();
  await amount.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.press('Enter');
  await expect(amount).toBeFocused();
  await dialog.getByLabel('Kategorie', { exact: true }).fill('Kategorie Tastatur');
  await dialog.getByRole('option', { name: /^Kategorie Tastatur/ }).click();
  await amount.fill('12,34');
  if (await redesignLoaded(page)) {
    const phone = page.viewportSize()!.width < 768;
    const targets = [
      ...(!phone ? [dialog.getByRole('button', { name: 'Vorgemerkt', exact: true })] : []),
      dialog.getByLabel('Empfänger', { exact: true }),
      ...(phone
        ? [
            dialog.getByLabel('Kategorie', { exact: true }),
            dialog.getByLabel('Vorschläge und Verfügbarkeit', { exact: true }),
            await categoryLineControl(dialog),
            dialog.getByLabel('Bezahlt von'),
          ]
        : []),
      dialog.getByLabel('Datum', { exact: true }),
      dialog.getByLabel('Datum im Kalender'),
    ];
    for (const target of targets) {
      await page.keyboard.press('Tab');
      await expect(target).toBeFocused();
    }
    const calendar = dialog.getByLabel('Datum im Kalender');
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press('Tab');
      if (!(await calendar.evaluate((node) => document.activeElement === node))) break;
    }
    await expect(dialog.getByLabel('Wiederholen')).toBeFocused();
    for (const target of [
      ...(phone
        ? [dialog.getByRole('button', { name: 'Vorgemerkt', exact: true })]
        : [
            dialog.getByLabel('Bezahlt von'),
            dialog.getByLabel('Kategorie', { exact: true }),
            dialog
              .getByRole('group', { name: 'Vorschläge' })
              .getByRole('button', { name: 'Kategorie Tastatur' }),
            await categoryLineControl(dialog),
          ]),
      dialog.getByLabel('Notiz'),
      await contactShareControl(dialog),
      ...((page.viewportSize()?.width ?? 1440) < 768
        ? []
        : [dialog.getByRole('button', { name: 'Abbrechen', exact: true })]),
      ...(phone ? [captureSaveControl(dialog)] : []),
      dialog.getByRole('button', { name: 'Speichern und neu', exact: true }),
      ...(!phone ? [captureSaveControl(dialog)] : []),
      ...(phone ? [dialog.getByRole('button', { name: 'Blatt schließen', exact: true })] : []),
      dialog.getByRole('button', { name: 'Datei anhängen', exact: true }),
      ...(phone
        ? [
            dialog.getByRole('button', { name: 'Foto aufnehmen', exact: true }),
            dialog.locator('.kmore > summary'),
            captureCloseControl(dialog),
            ...['Ausgabe', 'Einnahme', 'Umbuchung'].map((name) =>
              dialog.getByRole('button', { name, exact: true }),
            ),
            amount,
          ]
        : []),
    ]) {
      await page.keyboard.press('Tab');
      await expect(target).toBeFocused();
    }
    await page.keyboard.press('Shift+Tab');
    if (phone) {
      for (const target of [
        ...['Geteilt durch', 'Mal', 'Minus', 'Plus'].map((name) =>
          dialog.getByRole('button', { name, exact: true }),
        ),
        dialog.getByRole('button', { name: 'Umbuchung', exact: true }),
        dialog.getByRole('button', { name: 'Einnahme', exact: true }),
        dialog.getByRole('button', { name: 'Ausgabe', exact: true }),
        captureCloseControl(dialog),
        dialog.locator('.kmore > summary'),
        dialog.getByRole('button', { name: 'Foto aufnehmen', exact: true }),
        dialog.getByRole('button', { name: 'Datei anhängen', exact: true }),
        dialog.getByRole('button', { name: 'Blatt schließen', exact: true }),
        dialog.getByRole('button', { name: 'Speichern und neu', exact: true }),
        captureSaveControl(dialog),
      ]) {
        await expect(target).toBeFocused();
        await page.keyboard.press('Shift+Tab');
      }
    } else await expect(captureSaveControl(dialog)).toBeFocused();
  } else {
    await amount.press('Tab');
    await expect(dialog.getByLabel('Empfänger', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Bezahlt von')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Vorgemerkt' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Datum', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    const calendar = dialog.getByLabel('Datum im Kalender');
    await expect(calendar).toBeFocused();
    // Native date segments can retain focus within the same input before its next control.
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press('Tab');
      if (!(await calendar.evaluate((node) => document.activeElement === node))) break;
    }
    await expect(dialog.getByLabel('Wiederholen')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Kategorie', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(await contactShareControl(dialog)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      dialog
        .getByRole('group', { name: 'Vorschläge' })
        .getByRole('button', { name: 'Kategorie Tastatur' }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(await categoryLineControl(dialog)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Notiz')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.locator('.kmore > summary')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Speichern und neu' })).toBeFocused();
    const save = captureSaveControl(dialog);
    await page.keyboard.press('Tab');
    await expect(save).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(await captureFlagControl(dialog, 'Markierung: keine')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(save).toBeFocused();
    await page.keyboard.press('Tab');
    for (const name of ['Ausgabe', 'Einnahme', 'Umbuchung', 'Schließen']) {
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name, exact: true })).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(amount).toBeFocused();
  }
  const motion = await dialog.evaluate((el) =>
    [el, ...el.querySelectorAll('*')].flatMap((node) => {
      const style = getComputedStyle(node);
      return [style.animationDuration, style.transitionDuration]
        .flatMap((value) => value.split(',').map(parseFloat))
        .filter((seconds) => seconds > 0.000011);
    }),
  );
  expect(motion).toEqual([]);
  expect(
    await dialog.evaluate(
      (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    ),
  ).toBe(0);
  await amount.press('Escape');
  const ask = dialog.getByRole('alertdialog', { name: 'Eingaben verwerfen?' });
  await expect(ask).toBeVisible();
  const keep = ask.getByRole('button', { name: 'Weiter bearbeiten' });
  await expect(keep).toBeFocused();
  await keep.press('Shift+Tab');
  await expect(ask.getByRole('button', { name: 'Verwerfen', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(keep).toBeFocused();
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await evidence(page, info, 'booking-discard-focus', dialog);
  await keep.press('Enter');
  await expect(ask).toBeHidden();
  await expect(amount).toBeFocused();
  await expect(amount).toHaveValue('12,34');
  await amount.press('Escape');
  await expect(keep).toBeFocused();
  await keep.press('Tab');
  const discard = ask.getByRole('button', { name: 'Verwerfen', exact: true });
  await expect(discard).toBeFocused();
  await discard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect((await (await request.get('/api/bookings')).json()).items).toEqual([]);
});

sampleTest(
  'dark Heute text and chart status remain readable without colour alone',
  async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await openHeuteReview(page, '/');
    await expect(page.getByTestId('liquidity-chart')).toBeVisible();
    const redesign = await redesignLoaded(page);
    await page.goto('/reports/finanzcheck');
    await expect(page).toHaveURL((url) =>
      redesign
        ? url.pathname === '/reports/onepager' &&
          url.searchParams.get('darstellung') === 'finanzcheck'
        : url.pathname === '/',
    );
    if (redesign) await openHeuteReview(page, '/');
    else await page.goto('/');
    const response = await page.request.get('/api/liquidity?horizon=35d');
    expect(response.ok()).toBe(true);
    const forecast = (await response.json()) as LiquidityReportView;
    if (!forecast.available || !forecast.report)
      throw new Error('Synthetic current forecast must be available');
    const chart = page.getByTestId('liquidity-chart');
    await expect(chart).toBeVisible();
    const inspection = chart.locator('..');
    await inspection.focus();
    for (let i = 0; i < 40; i++) await inspection.press('ArrowRight');
    await expect(page.locator('.chart-tooltip')).toContainText('Mit Ereignissen');
    await expect(page.locator('.chart-tooltip')).toContainText(
      eur(forecast.report.points.at(-1)!.balanceCents),
    );
    await expect(page.getByTestId('heute-wealth-history').locator('.l-actual').first()).toHaveCSS(
      'stroke-dasharray',
      'none',
    );
    await expect(chart.locator('.l-forecast')).toHaveCSS('stroke-dasharray', '7px, 5px');
    await openHeuteReview(page, '/');
    await expect(page.getByTestId('liquidity-chart')).toBeVisible();
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await evidence(page, info, 'heute-dark', page.locator('main'));
  },
);

test.describe('safe bank preview recovery', () => {
  test.use({ bankingConfigured: true });
  test('an additional eligible rule invalidates an open preview despite unchanged selected revisions', async ({
    page,
    request,
    isolatedLedger,
  }) => {
    const { origin, databasePath } = isolatedLedger;
    const post = async (path: string, data: unknown) => {
      const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const { account } = await post('/accounts', {
      name: 'Synthetic stale preview account',
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: 10000,
    });
    const { group } = await post('/categories/groups', { name: 'Synthetic stale preview group' });
    const { category } = await post('/categories', {
      name: 'Synthetic stale preview category',
      class: 'need',
      groupId: group.id,
    });
    const ruleInput = {
      enabled: true,
      automatic: true,
      match: { mode: 'all', conditions: [{ type: 'contains', text: 'Synthetic stale preview' }] },
      actions: { categoryId: category.id },
    };
    await post('/assignment-rules', { ...ruleInput, name: 'Synthetic first automatic rule' });
    const sourceId = randomUUID(),
      consentId = randomUUID(),
      id = randomUUID();
    const opened = openDatabase(databasePath);
    try {
      opened.db
        .insert(schema.bankSyncConsent)
        .values({
          id: consentId,
          initiator: 'synthetic',
          stateHash: randomUUID(),
          label: 'Synthetic preview source',
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
          label: 'Synthetic preview source account',
          currency: 'EUR',
          accountId: account.id,
        })
        .run();
      opened.db
        .insert(schema.bankSyncCandidate)
        .values({
          id,
          sourceId,
          accountId: account.id,
          dedupeKey: id,
          date: '2026-10-09',
          amountCents: -1201,
          currency: 'EUR',
          memo: 'Synthetic stale preview',
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
          createdAt: '2026-10-09T12:00:00Z',
        })
        .run();
    } finally {
      opened.close();
    }
    const readCandidate = async () => {
      const response = await request.get(origin + '/api/assignment-rules/candidates/' + id);
      expect(response.ok()).toBe(true);
      return response.json();
    };
    await page.goto(`/konten/pruefen?bankSource=${sourceId}`);
    const row = page.locator('.bank-inbox-row').filter({ hasText: 'Synthetic stale preview' });
    await (await bankPreviewControl(row)).click();
    const candidate = page.getByRole('dialog', { name: 'Buchung übernehmen' });
    await expect(
      candidate.getByText('Synthetic first automatic rule', { exact: true }),
    ).toBeVisible();
    await candidate.getByRole('button', { name: 'Schließen', exact: true }).click();
    const shortcut = page.getByRole('button', { name: /Alle sicheren bestätigen/ });
    const writes: string[] = [];
    page.on('request', (req) => {
      const path = new URL(req.url()).pathname;
      if (req.method() === 'POST' && ['/api/bank-sync/inbox/bulk', '/api/undo'].includes(path))
        writes.push(path);
    });
    if (!(await redesignLoaded(page))) {
      await expect(shortcut).toHaveCount(0);
      expect((await (await request.get(origin + '/api/bookings')).json()).items).toEqual([]);
      expect(writes).toEqual([]);
      return;
    }
    await expect(shortcut).toHaveText('Alle sicheren bestätigen (1)');
    await shortcut.click();
    const preview = page.getByRole('dialog', { name: 'Bankauswahl prüfen' });
    await expect(preview).toContainText('1 ausgewählt · 1 bestätigen · 0 übersprungen');
    const before = await readCandidate();
    await post('/assignment-rules', { ...ruleInput, name: 'Synthetic second automatic rule' });
    const after = await readCandidate();
    expect(after.candidateRevision).toBe(before.candidateRevision);
    expect(
      after.suggestions.find((rule: { id: string }) => rule.id === before.suggestions[0].id)
        .revision,
    ).toBe(before.suggestions[0].revision);
    expect(
      after.suggestions.filter(
        (rule: { automatic: boolean; unavailable: boolean }) => rule.automatic && !rule.unavailable,
      ),
    ).toHaveLength(2);
    const execute = preview.getByRole('button', { name: 'Auswahl jetzt ausführen' });
    // The normal provider refresh sees both rules although neither stored revision changed.
    const ambiguousRefresh = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/assignment-rules/candidates/' + id &&
        response.status() === 200,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await ambiguousRefresh;
    await expect(shortcut).toHaveText('Alle sicheren bestätigen (0)');
    await expect(preview.getByRole('alert')).toContainText('nicht mehr aktuell');
    await expect(execute).toBeDisabled();
    expect(writes).toEqual([]);
    expect((await (await request.get(origin + '/api/bookings')).json()).items).toEqual([]);
    // Restoring eligibility cannot silently re-authorize the old confirmation.
    const rules = await (await request.get(origin + '/api/assignment-rules')).json();
    const second = rules.rules.find(
      (rule: { name: string }) => rule.name === 'Synthetic second automatic rule',
    );
    const removed = await request.delete(origin + '/api/assignment-rules/' + second.id, {
      headers: { origin },
    });
    expect(removed.ok()).toBe(true);
    const refreshed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/assignment-rules/candidates/' + id &&
        response.status() === 200,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await refreshed;
    await expect(shortcut).toHaveText('Alle sicheren bestätigen (1)');
    await expect(execute).toBeDisabled();
    await preview.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await shortcut.click();
    await expect(execute).toBeEnabled();
    await execute.click();
    await expect(row).toHaveCount(0);
    await expect(toast(page)).toContainText('1 Bankzeilen bestätigt');
    await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(row).toBeVisible();
    expect(writes).toEqual(['/api/bank-sync/inbox/bulk', '/api/undo']);
    expect((await (await request.get(origin + '/api/bookings')).json()).items).toEqual([]);
    const accounts = await (await request.get(origin + '/api/accounts')).json();
    expect(
      accounts.accounts.find((row: { id: string }) => row.id === account.id).balanceCents,
    ).toBe(10000);
  });
});
