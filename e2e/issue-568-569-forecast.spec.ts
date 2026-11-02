import AxeBuilder from '@axe-core/playwright';
import { withShellControls } from './shell-actions';
import { openDatabase, schema } from '@budget/db';
import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });
const TODAY = '2026-09-17';
interface Seed {
  accountId: string;
  debitId: string;
}
async function seed(request: APIRequestContext, origin: string): Promise<Seed> {
  async function post<T>(path: string, data: unknown): Promise<T> {
    const response = await request.post(`${origin}/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json() as Promise<T>;
  }
  const { account } = await post<{ account: { id: string } }>('/accounts', {
    name: 'Synthetic forecast account',
    type: 'checking',
    openingDate: TODAY,
    openingBalanceCents: 100000,
  });
  const { payment } = await post<{ payment: { id: string } }>('/expected', {
    name: 'Synthetic debit',
    kind: 'outflow',
    accountId: account.id,
    rhythm: 'monthly',
    dueDay: 27,
    startDate: '2026-09-27',
    endDate: '2026-09-27',
    validFrom: TODAY,
    dateShift: 'none',
    amountCents: 30000,
  });
  await post('/expected', {
    name: 'Synthetic salary',
    kind: 'inflow',
    accountId: account.id,
    incomeTypeId: 'income-salary',
    rhythm: 'monthly',
    dueDay: 7,
    startDate: '2026-10-07',
    endDate: '2026-10-07',
    validFrom: TODAY,
    dateShift: 'none',
    amountCents: 9000,
  });
  return { accountId: account.id, debitId: payment.id };
}
async function hit(target: Locator, minimum: number) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  const r = await target.evaluate((element) => {
    const b = element.getBoundingClientRect();
    const owner = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      left: b.left,
      right: b.right,
      top: b.top,
      bottom: b.bottom,
      width: b.width,
      height: b.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      owned: owner === element || (owner !== null && element.contains(owner)),
    };
  });
  expect(r.width).toBeGreaterThanOrEqual(minimum);
  expect(r.height).toBeGreaterThanOrEqual(minimum);
  expect(r.left).toBeGreaterThanOrEqual(0);
  expect(r.right).toBeLessThanOrEqual(r.viewportWidth);
  expect(r.top).toBeGreaterThanOrEqual(0);
  expect(r.bottom).toBeLessThanOrEqual(r.viewportHeight);
  expect(r.owned).toBe(true);
}
async function chartGeometry(chart: Locator) {
  await expect(chart.getByTestId('liquidity-mark-heute')).toHaveText('HEUTE');
  // Small real salary9000 must not be suppressed by the25000c large-movement table cutoff.
  await expect(chart.getByTestId('liquidity-mark-gehalt')).toHaveText('GEHALT 07.10.');
  await expect(chart.getByTestId('liquidity-lowpoint')).toHaveAttribute('data-day', '2026-09-27');
  await expect(chart.getByTestId('liquidity-lowpoint')).toHaveAttribute('data-cents', '70000');
  await chart.page().evaluate(() => document.fonts.ready);
  const geometry = await chart.evaluate((element) => {
    const rect = (node: Element) => {
      const r = node.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const svg = element.querySelector('svg[data-testid="liquidity-chart"]')!;
    const low = element.querySelector('[data-testid="liquidity-lowpoint"]')!;
    return {
      svg: rect(svg),
      texts: [...low.querySelectorAll('text')].map(rect),
      dot: rect(low.querySelector('circle')!),
      markers: [
        ...element.querySelectorAll(
          '[data-testid="liquidity-mark-heute"], [data-testid="liquidity-mark-gehalt"]',
        ),
      ].map(rect),
      forecast: rect(element.querySelector('.l-forecast')!),
    };
  });
  expect(geometry.texts).toHaveLength(2);
  expect(geometry.markers).toHaveLength(2);
  for (const text of [...geometry.texts, ...geometry.markers]) {
    expect(text.width).toBeGreaterThan(0);
    expect(text.height).toBeGreaterThan(0);
    expect(text.left).toBeGreaterThanOrEqual(geometry.svg.left);
    expect(text.right).toBeLessThanOrEqual(geometry.svg.right);
    expect(text.top).toBeGreaterThanOrEqual(geometry.svg.top);
    expect(text.bottom).toBeLessThanOrEqual(geometry.svg.bottom);
  }
  expect(geometry.texts[0]!.top).toBeGreaterThanOrEqual(geometry.dot.bottom);
  expect(geometry.texts[0]!.top).toBeGreaterThanOrEqual(geometry.forecast.bottom);
  expect(geometry.texts[1]!.top).toBeGreaterThanOrEqual(geometry.texts[0]!.bottom);
  for (const marker of geometry.markers)
    expect(marker.bottom).toBeLessThanOrEqual(geometry.forecast.top);
  const [today, salary] = geometry.markers;
  expect(
    today!.right <= salary!.left ||
      salary!.right <= today!.left ||
      today!.bottom <= salary!.top ||
      salary!.bottom <= today!.top,
  ).toBe(true);
  return geometry;
}
function moneyState(databasePath: string) {
  const opened = openDatabase(databasePath);
  try {
    return {
      bookings: opened.db.select().from(schema.booking).all(),
      rules: opened.db.select().from(schema.expectedPayment).all(),
      versions: opened.db.select().from(schema.expectedPaymentVersion).all(),
    };
  } finally {
    opened.close();
  }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function photo(page: Page, scope: string, name: string, info: TestInfo) {
  await expect(page.locator(scope)).toHaveCount(1);
  expect((await new AxeBuilder({ page }).include(scope).analyze()).violations).toEqual([]);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}
async function scene(
  page: Page,
  ids: Seed,
  databasePath: string,
  profile: 'desktop' | 'configured',
  theme: 'light' | 'dark',
  info: TestInfo,
) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'budget-liquidity-selection',
      JSON.stringify({ horizon: '12m', levers: ['trim-variable'] }),
    );
  });
  const before = moneyState(databasePath);
  const writes: Array<{ path: string; body: unknown }> = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
      writes.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
  });
  await page.goto('/?monat=2026-08&period=month');
  await page.evaluate((value) => {
    document.documentElement.dataset['theme'] = value;
  }, theme);
  const card = page.getByRole('region', { name: 'Kontoprognose · 35 Tage' });
  await expect(card.locator('.heute-forecast-low')).toHaveAttribute('data-cents', '70000');
  await expect(card.locator('.heute-forecast-low')).toHaveAttribute('data-day', '2026-09-27');
  await expect(card.locator('.heute-forecast-low')).toContainText('700,00 €');
  await expect(card).toContainText('Stand heute · 17.09.2026 · ohne Stellschrauben');
  await expect(page.getByTestId('heute-month-note')).toContainText('August');
  const compactGeometry = await chartGeometry(card.locator('.rf-chart'));
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const minimum = coarse ? 44 : 24;
  await photo(page, '.heute-compact-forecast', `forecast-card-${profile}-${theme}`, info);
  const details = card.getByRole('link', { name: 'Details zur Kontoprognose für 35 Tage' });
  await hit(details, minimum);
  await details.click();
  await expect(page).toHaveURL(/\/plan\/prognose\?.*horizon=35d/);
  const search = new URL(page.url()).searchParams;
  expect(search.get('horizon')).toBe('35d');
  expect(search.has('levers')).toBe(true);
  expect(search.get('levers')).toBe('');
  await expect(
    page.getByRole('heading', { name: 'Budget-Konten · nächste 35 Tage' }),
  ).toBeVisible();
  await expect(page.getByTestId('liq-low')).toHaveText('700,00 €');
  await expect(page.getByTestId('liq-scenario-basis')).not.toContainText(
    'Vorschau mit aktiver Stellschraube',
  );
  const tools = page.locator('details.rf-tools');
  const summary = tools.locator(':scope > summary');
  await expect(tools).not.toHaveAttribute('open');
  const detailGeometry = await chartGeometry(page.locator('.liquidity-report .rf-chart'));
  const collapsed = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    coarse: matchMedia('(pointer: coarse)').matches,
    rawTouch: navigator.maxTouchPoints,
  }));
  if (profile === 'desktop') {
    expect(collapsed.width).toBe(1440);
    expect(collapsed.height).toBe(900);
    expect(collapsed.documentHeight).toBeLessThanOrEqual(2700);
  } else expect(collapsed.width).toBe(390);
  const horizons = page.getByRole('group', { name: 'Prognosezeitraum' }).getByRole('button');
  await expect(horizons).toHaveCount(4);
  for (const horizon of await horizons.all()) await hit(horizon, minimum);
  await photo(page, '.liquidity-report', `forecast-detail-${profile}-${theme}`, info);
  expect(writes).toEqual([]);
  await hit(summary, minimum);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(tools).toHaveAttribute('open');
  const draft = page.getByRole('textbox', { name: 'Ereignis', exact: true });
  await hit(draft, minimum);
  await draft.fill('Synthetic draft');
  await hit(summary, minimum);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(tools).not.toHaveAttribute('open');
  await page.keyboard.press('Enter');
  await expect(tools).toHaveAttribute('open');
  await expect(draft).toHaveValue('Synthetic draft');
  const profileMenu = page.locator('.m-profile');
  const profileSummary = profileMenu.locator(':scope > summary');
  const hasAvatar = await profileSummary.isVisible();
  if (profile === 'configured') {
    const entry = hasAvatar
      ? profileSummary
      : page.locator('.m-head').getByRole('button', { name: 'Suchen', exact: true });
    await hit(entry, minimum);
  }
  await withShellControls(page, async ({ kind, container, privacy }) => {
    if (profile === 'configured') {
      if (kind === 'avatar') await expect(profileMenu).toHaveAttribute('open');
      else await expect(container!).toBeVisible();
    }
    await hit(privacy, minimum);
    await privacy.click();
    await expect(page.getByTestId('liq-low')).not.toContainText(/\d/);
    await expect(draft).toHaveValue('Synthetic draft');
    await privacy.click();
    await expect(page.getByTestId('liq-low')).toHaveText('700,00 €');
  });
  if (profile === 'configured') {
    if (hasAvatar) await expect(profileMenu).not.toHaveAttribute('open');
    else await expect(page.getByRole('dialog', { name: 'Suchen', exact: true })).toBeHidden();
  }
  const strike = page.getByRole('button', {
    name: 'Diesmal streichen: Synthetic debit, 27.09.',
    exact: true,
  });
  await hit(strike, minimum);
  // Start at the disclosure, then reach the row action through the real native tab order.
  await summary.focus();
  for (let tab = 0; tab < 64; tab++) {
    await page.keyboard.press('Tab');
    if (await strike.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(strike).toBeFocused();
  const skippedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/expected/${ids.debitId}/skip`,
  );
  await page.keyboard.press('Enter');
  const skipped = await skippedResponse;
  expect(skipped.status()).toBe(200);
  const skipResult = (await skipped.json()) as { groupId: string };
  await expect(page.getByTestId('liq-low')).toHaveText('1.000,00 €');
  const undo = page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true });
  await hit(undo, minimum);
  const undoneResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/undo',
  );
  await undo.click();
  expect((await undoneResponse).status()).toBe(200);
  await expect(page.getByTestId('liq-low')).toHaveText('700,00 €');
  expect(writes).toEqual([
    { path: `/api/expected/${ids.debitId}/skip`, body: { dueDate: '2026-09-27' } },
    { path: '/api/undo', body: { groupId: skipResult.groupId } },
  ]);
  // Unskip is an existing PaymentPage action, not a fabricated forecast button.
  await hit(strike, minimum);
  await strike.click();
  await expect(page.getByTestId('liq-low')).toHaveText('1.000,00 €');
  await page.goto(`/plan/erwartet/${ids.debitId}?monat=2026-09`);
  await expect(page.getByRole('heading', { name: 'Synthetic debit', exact: true })).toBeVisible();
  const restore = page.getByRole('button', { name: 'Wiederherstellen', exact: true });
  await hit(restore, minimum);
  const restoredResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/expected\/occurrences\/[a-f0-9-]+\/unskip$/.test(new URL(response.url()).pathname),
  );
  await restore.click();
  expect((await restoredResponse).status()).toBe(200);
  await page.goto('/plan/prognose?horizon=35d&levers=');
  await expect(page.getByTestId('liq-low')).toHaveText('700,00 €');
  await expect(page.getByTestId('liquidity-lowpoint')).toHaveAttribute('data-day', '2026-09-27');
  expect(writes).toHaveLength(4);
  expect(writes[2]).toEqual({
    path: `/api/expected/${ids.debitId}/skip`,
    body: { dueDate: '2026-09-27' },
  });
  expect(writes[3]?.path).toMatch(/^\/api\/expected\/occurrences\/[a-f0-9-]+\/unskip$/);
  expect(moneyState(databasePath)).toEqual(before);
  const opened = openDatabase(databasePath);
  try {
    expect(
      opened.db
        .select()
        .from(schema.auditLog)
        .all()
        .filter((row) => row.groupId === skipResult.groupId).length,
    ).toBeGreaterThan(0);
  } finally {
    opened.close();
  }
  const artifact = info.outputPath(`forecast-${profile}-${theme}.json`);
  await writeFile(
    artifact,
    JSON.stringify(
      {
        profile,
        theme,
        engine: page.context().browser()!.browserType().name(),
        project: info.project.name,
        ...collapsed,
        compactGeometry,
        detailGeometry,
        financial: {
          beforeCents: 70000,
          skippedCents: 100000,
          restoredCents: 70000,
          lowDay: '2026-09-27',
          ruleUnchanged: true,
          bookingCount: 0,
          skipGroupId: skipResult.groupId,
        },
        writes,
      },
      null,
      2,
    ),
  );
  await info.attach('Forecast geometry and actual skip Undo unskip', {
    path: artifact,
    contentType: 'application/json',
  });
}
for (const profile of ['desktop', 'configured'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`Forecast35d ${profile} ${theme} retains real card/detail parity, controls and skip Undo unskip`, async ({
      page,
      request,
      browser,
      isolatedLedger,
      ledgerToday,
    }, info) => {
      const ids = await seed(request, isolatedLedger.origin);
      if (profile === 'configured') {
        const inherited = page.viewportSize();
        expect(inherited).not.toBeNull();
        await page.setViewportSize({ width: 390, height: inherited!.height });
        await scene(page, ids, isolatedLedger.databasePath, profile, theme, info);
        return;
      }
      const context = await browser.newContext({
        baseURL: isolatedLedger.origin,
        storageState: isolatedLedger.storageState,
        viewport: { width: 1440, height: 900 },
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      });
      try {
        const desktop = await context.newPage();
        await desktop.clock.setFixedTime(new Date(`${ledgerToday}T12:00:00+02:00`));
        await scene(desktop, ids, isolatedLedger.databasePath, profile, theme, info);
      } finally {
        await context.close();
      }
    });
  }
