import { withShellControls } from './shell-actions';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });
interface Row {
  id: string;
  name: string;
  balanceCents: number;
  manualValueCents: number | null;
  reviewStatus: { state: string; dueOn: string | null; checkedOn: string | null };
}
async function write(page: Page, origin: string, path: string, data: unknown, method = 'POST') {
  const response = await page.request.fetch(origin + '/api' + path, {
    method,
    data,
    headers: { origin },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<{ account: Row; groupId: string }>;
}
async function seed(page: Page, origin: string) {
  const result = new Map<string, Row>();
  for (const [key, type, openingDate, onBudget] of [
    ['budget', 'checking', '2026-09-03', true],
    ['card', 'credit_card', '2026-09-03', true],
    ['loan', 'loan', '2026-08-17', false],
    ['manual', 'p2p', '2026-08-17', false],
    ['quiet', 'checking', '2026-01-01', true],
    ['empty', 'checking', '2026-01-01', true],
  ] as const) {
    const { account } = await write(page, origin, '/accounts', {
      name: `Synthetic ${key}`,
      type,
      onBudget,
      openingDate,
      openingBalanceCents: 10000,
    });
    result.set(key, account);
    if (key !== 'empty')
      await write(page, origin, '/bookings', {
        type: 'booking',
        accountId: account.id,
        date: openingDate,
        amountCents: -100,
        status: 'confirmed',
      });
  }
  await write(page, origin, `/accounts/${result.get('quiet')!.id}/reconciliation`, {
    date: '2026-01-02',
    statementBalanceCents: 9900,
  });
  return result;
}
async function read(page: Page) {
  const response = await page.request.get('/api/accounts');
  expect(response.ok()).toBe(true);
  return (await response.json()) as { accounts: Row[] };
}
async function countParity(page: Page, count: number) {
  const listed = await read(page);
  expect(listed.accounts.filter((a) => a.reviewStatus.state === 'due')).toHaveLength(count);
  const response = await page.request.get('/api/heute');
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as { accountReminders: { accountId: string }[] };
  expect(data.accountReminders.map((a) => a.accountId).sort()).toEqual(
    listed.accounts
      .filter((a) => a.reviewStatus.state === 'due')
      .map((a) => a.id)
      .sort(),
  );
  await page.goto('/konten');
  await expect(page.locator('.kcheck.is-stale')).toHaveCount(count);
  await page.goto('/');
  const source = page
    .getByRole('region', { name: 'Zu tun' })
    .locator('.attention-row')
    .filter({ hasText: `${count} Konten warten auf Prüfung` });
  await expect(source).toHaveCount(1);
  return source;
}

test('shared due badges and Heute count follow real completion, backdated activity, manual value and undo', async ({
  page,
  isolatedLedger,
}) => {
  test.setTimeout(90_000); // One bounded real-route check/value/undo and cross-page parity scenario.
  const rows = await seed(page, isolatedLedger.origin);
  const budget = rows.get('budget')!;
  const manual = rows.get('manual')!;
  await countParity(page, 4);
  await page.goto(`/konten/${budget.id}?pruefen=reconcile`);
  const dialog = page.getByRole('dialog', { name: `Kontostand prüfen · ${budget.name}` });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Saldo laut Bank', { exact: true }).fill('99');
  await dialog.getByRole('button', { name: /Festschreiben/ }).click();
  await expect(dialog).toBeHidden();
  const check = (await (
    await page.request.get(`/api/accounts/${budget.id}/reconciliations`)
  ).json()) as { reconciliations: { id: string; date: string }[] };
  expect(check.reconciliations[0]?.date).toBe('2026-09-17');
  await countParity(page, 3);
  const backdated = await write(page, isolatedLedger.origin, '/bookings', {
    type: 'booking',
    accountId: budget.id,
    date: '2026-09-03',
    amountCents: -50,
    status: 'pending',
  });
  // New activity makes the fresh check unreviewed, but its next fourteen-day deadline is future.
  expect((await read(page)).accounts.find((a) => a.id === budget.id)).toMatchObject({
    balanceCents: 9850,
    reviewStatus: { state: 'unreviewed', dueOn: '2026-10-01' },
  });
  await countParity(page, 3);
  await write(page, isolatedLedger.origin, '/undo', { groupId: backdated.groupId });
  expect((await read(page)).accounts.find((a) => a.id === budget.id)).toMatchObject({
    balanceCents: 9900,
    reviewStatus: { state: 'checked' },
  });
  await page.goto(`/konten/${manual.id}`);
  await page.getByRole('button', { name: 'Wert aktualisieren', exact: true }).click();
  const valueDialog = page.getByRole('dialog', { name: `Wert aktualisieren · ${manual.name}` });
  await valueDialog.getByLabel('Wert in EUR').fill('125,01');
  await valueDialog.getByRole('button', { name: 'Wert speichern', exact: true }).click();
  await expect(valueDialog).toBeHidden();
  await expect(page.getByText(/Letzter Wert: 125,01 €/)).toBeVisible();
  expect((await read(page)).accounts.find((a) => a.id === manual.id)).toMatchObject({
    balanceCents: 9900,
    manualValueCents: 12501,
    reviewStatus: { state: 'checked' },
  });
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect(page.getByText(/Letzter Wert: 99,00 €/)).toBeVisible();
  await countParity(page, 3);
  expect(
    (await read(page)).accounts.find((a) => a.id === rows.get('quiet')!.id)?.reviewStatus.state,
  ).toBe('checked');
  expect(
    (await read(page)).accounts.find((a) => a.id === rows.get('empty')!.id)?.reviewStatus.state,
  ).toBe('inactive');
});

const resolvedTheme = (page: Page) =>
  page.evaluate(() => {
    const selected = document.documentElement.dataset['theme'];
    return selected === 'light' || selected === 'dark'
      ? selected
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  });
async function theme(page: Page, value: 'light' | 'dark') {
  if ((await resolvedTheme(page)) === value) return;
  if (page.viewportSize()!.width === 390) {
    await withShellControls(
      page,
      async ({ theme: control }) => {
        await expect(control).toHaveAccessibleName(
          value === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
        );
        await control.tap();
      },
      true,
    );
  } else
    await page
      .locator('.sidebar-foot')
      .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
      .click();
  await expect.poll(() => resolvedTheme(page)).toBe(value);
}
async function inspect(page: Page, info: TestInfo, label: string) {
  for (const value of ['light', 'dark'] as const) {
    await page.goto('/konten');
    await theme(page, value);
    await expect(page.locator('.kcheck.is-stale')).toHaveCount(4);
    const quiet = page
      .locator('.ktable .krow')
      .filter({ has: page.getByRole('link', { name: /^Synthetic quiet / }) });
    await expect(quiet.locator('.kcheck')).toHaveAttribute('data-review-state', 'checked');
    await expect(quiet.locator('.kcheck')).not.toHaveClass(/is-stale/);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      scrollTo(0, 0);
      await document.fonts.ready;
    });
    await page.screenshot({
      path: info.outputPath(`review-overview-${label}-${value}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    const source = await countParity(page, 4);
    const review = source.getByRole('link', { name: 'Prüfen', exact: true });
    if (page.viewportSize()!.width === 390) {
      const box = (await review.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await review.click();
    await expect(page).toHaveURL(/\/konten\/pruefen#account-reminder-title$/);
    await expect(page.locator('.account-reminder')).toHaveCount(4);
    await expect(page.locator('.account-reminders')).toContainText(
      'Prüfung fällig seit 17.09.2026',
    );
    for (const control of await page.locator('.account-reminder a').all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      scrollTo(0, 0);
      await document.fonts.ready;
    });
    await page.screenshot({
      path: info.outputPath(`review-reminders-${label}-${value}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.goto('/einstellungen/profil');
    const setting = page.getByRole('region', { name: 'Kontoprüfung · Erinnerung' });
    await expect(setting).toContainText('nach 14 Tagen');
    await expect(setting).toContainText('nach einem Kalendermonat');
    await expect(setting.getByRole('spinbutton')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await info.attach(`review-${label}-${value}-runtime`, {
      body: JSON.stringify({
        viewport: page.viewportSize(),
        engine: page.context().browser()!.browserType().name(),
        project: info.project.name,
        label,
        theme: await resolvedTheme(page),
        themePreference: await page.locator('html').getAttribute('data-theme'),
        ...(await page.evaluate(() => ({
          coarse: matchMedia('(pointer: coarse)').matches,
          touch: navigator.maxTouchPoints,
          dpr: devicePixelRatio,
        }))),
      }),
      contentType: 'application/json',
    });
  }
}

test('fixed review states, calendar dates and one source row are accessible in both themes and actual phone/desktop contexts', async ({
  page,
  browser,
  isolatedLedger,
  baseURL,
}, info) => {
  test.setTimeout(120_000); // Four changed pages, two themes, and a separate real desktop layout context.
  await seed(page, isolatedLedger.origin);
  await inspect(page, info, info.project.name);
  if (browser.browserType().name() === 'webkit') {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      colorScheme: 'light',
      baseURL,
      storageState: await page.context().storageState(),
    });
    try {
      const actual = await desktop.newPage();
      await actual.clock.setFixedTime(new Date('2026-09-17T12:00:00+02:00'));
      await inspect(actual, info, 'webkit-desktop-layout1440');
    } finally {
      await desktop.close();
    }
  }
});
