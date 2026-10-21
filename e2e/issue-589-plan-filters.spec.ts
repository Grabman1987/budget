import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { eq } from 'drizzle-orm';
import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-15' });
interface Seed {
  accountId: string;
  donorId: string;
  recipientId: string;
  missingId: string;
}
interface Budget {
  summary: { envelopes: Array<{ categoryId: string; availableCents: number }> };
  budgetMoney: { coverCapCents: number };
}

async function seed(request: APIRequestContext, origin: string): Promise<Seed> {
  async function write<T>(path: string, data: unknown, method = 'POST'): Promise<T> {
    const response = await request.fetch(`${origin}/api${path}`, {
      method,
      data,
      headers: { origin },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json() as Promise<T>;
  }
  const { account } = await write<{ account: { id: string } }>('/accounts', {
    name: 'Synthetic filter account',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 100000,
  });
  const { group } = await write<{ group: { id: string } }>('/categories/groups', {
    name: 'Synthetic filters',
  });
  async function category(name: string) {
    const response = await write<{ category: { id: string } }>('/categories', {
      name,
      groupId: group.id,
      class: 'need',
      stage: 2,
    });
    return response.category.id;
  }
  const donorId = await category('Synthetic Donor');
  const recipientId = await category('Synthetic Recipient');
  await category('Synthetic Empty');
  await write(
    `/categories/${recipientId}/target`,
    { validFrom: '2026-10', target: { kind: 'monthly', amountCents: 8000 } },
    'PUT',
  );
  await write(
    '/budget/2026-10/assigned',
    { items: [{ categoryId: donorId, assignedCents: 10000 }] },
    'PUT',
  );
  await write('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-10',
    amountCents: -3000,
    categoryId: recipientId,
    status: 'pending',
  });
  const { id: missingId } = await write<{ id: string }>('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-11',
    amountCents: -150,
    status: 'pending',
    memo: 'Synthetic missing classification',
  });
  return { accountId: account.id, donorId, recipientId, missingId };
}

async function hit(target: Locator, minimum: number) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  const bounds = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const owner = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      owned: owner === element || (owner !== null && element.contains(owner)),
    };
  });
  expect(bounds.width).toBeGreaterThanOrEqual(minimum);
  expect(bounds.height).toBeGreaterThanOrEqual(minimum);
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
  expect(bounds.owned).toBe(true);
}
async function budget(page: Page): Promise<Budget> {
  const response = await page.request.get('/api/budget/2026-10');
  expect(response.status()).toBe(200);
  return response.json() as Promise<Budget>;
}
async function balance(page: Page, accountId: string) {
  const response = await page.request.get('/api/accounts');
  expect(response.status()).toBe(200);
  const data = (await response.json()) as { accounts: Array<{ id: string; balanceCents: number }> };
  return data.accounts.find((row) => row.id === accountId)?.balanceCents;
}

async function scene(
  page: Page,
  ids: Seed,
  databasePath: string,
  profile: 'desktop' | 'configured',
  theme: 'light' | 'dark',
  info: TestInfo,
) {
  const clickPlanControl = async (target: Locator) => {
    // Keep mobile controls above the fixed tabbar before normal pointer actionability checks.
    if (profile === 'configured')
      await target.evaluate((element) =>
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }),
      );
    await target.click();
  };
  const writes: Array<{ path: string; body: unknown }> = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
      writes.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
  });
  await page.goto('/plan/monat?monat=2026-10');
  await page.evaluate((value) => {
    document.documentElement.dataset['theme'] = value;
  }, theme);
  const filters = page.getByRole('group', { name: 'Kategoriefilter', exact: true });
  await expect(filters.getByRole('button', { name: 'Alle (3)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    filters.getByRole('button', { name: 'Unterfinanziert (1)', exact: true }),
  ).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Überzogen (1)', exact: true })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Verfügbar (1)', exact: true })).toBeVisible();
  await expect(
    filters.getByRole('button', { name: 'Ohne Kategorie (1)', exact: true }),
  ).toBeVisible();
  const combined = page.locator('summary[aria-controls="plan-chip-panel-2"]');
  await expect(combined).toHaveText('2 vorgemerkt / ohne Kategorie');
  await expect(combined).toHaveAttribute(
    'title',
    'Buchungen mit vorgemerktem Status oder mindestens einem Anteil ohne Kategorie. Jede Buchung wird einmal gezählt.',
  );
  await clickPlanControl(page.locator(`.pname[data-category-id="${ids.recipientId}"]`));
  await expect(
    page.getByRole('heading', { name: 'Synthetic Recipient', exact: true }),
  ).toBeVisible();
  const initial = await page.locator('.plan-filterbar').evaluate((element) => ({
    viewport: { width: innerWidth, height: innerHeight },
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    scrollWidth: document.documentElement.scrollWidth,
    beforeGrid:
      element.closest('.plan')!.querySelector('.ptable')!.getBoundingClientRect().top -
      element.closest('.plan')!.getBoundingClientRect().top,
    controls: [...element.querySelectorAll('input, .plan-filter-segments button, summary')].map(
      (control) => {
        const rect = control.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      },
    ),
  }));
  expect(initial.controls).toHaveLength(7);
  expect(initial.scrollWidth).toBeLessThanOrEqual(initial.viewport.width);
  if (profile === 'desktop') {
    expect(initial.viewport).toEqual({ width: 1440, height: 900 });
    expect(initial.pointerCoarse).toBe(false);
    expect(initial.beforeGrid).toBeLessThanOrEqual(120);
    expect(Math.max(...initial.controls.map((rect) => rect.top))).toBeLessThan(
      Math.min(...initial.controls.map((rect) => rect.bottom)),
    );
    await expect(page.getByRole('complementary', { name: 'Plan-Inspektor' })).toBeVisible();
  } else expect(initial.viewport.width).toBe(390);
  for (const target of await page
    .locator('.plan-filterbar input, .plan-filter-segments button, .plan-filterbar summary')
    .all())
    await hit(target, profile === 'configured' ? 44 : 24);
  const options = page.locator('.plan-filterbar summary');
  await options.focus();
  await options.press('Enter');
  await expect(page.getByRole('group', { name: 'Ansicht', exact: true })).toBeVisible();
  await options.press('Escape');
  await expect(options).toBeFocused();
  const axe = await new AxeBuilder({ page })
    .include('.plan')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.locator('.plan-filterbar').scrollIntoViewIfNeeded();
  const image = info.outputPath(`plan-filters-${profile}-${theme}.png`);
  await page.screenshot({ path: image, fullPage: true, animations: 'disabled' });
  await info.attach('Plan filter controls', { path: image, contentType: 'image/png' });

  await page.goto('/plan/monat?monat=2026-10&ansicht=triage');
  await page.evaluate((value) => {
    document.documentElement.dataset['theme'] = value;
  }, theme);
  await expect(page.locator('tr.pgroup .grp-title')).toHaveText('Überzogen');
  await expect(page.locator('.ptable .pname')).toHaveCount(1);
  await clickPlanControl(options);
  const views = page.getByRole('group', { name: 'Ansicht', exact: true });
  await expect(views.locator('[aria-pressed="true"]')).toHaveCount(0);
  await clickPlanControl(views.getByRole('button', { name: 'Gruppen', exact: true }));
  await expect(page.locator('.ptable .pname')).toHaveCount(3);
  expect(new URL(page.url()).searchParams.has('ansicht')).toBe(false);
  await page.goto('/plan/monat?monat=2026-10&ansicht=triage');
  await page.evaluate((value) => {
    document.documentElement.dataset['theme'] = value;
  }, theme);
  await expect(page.locator('tr.pgroup .grp-title')).toHaveText('Überzogen');
  await clickPlanControl(options);
  await clickPlanControl(views.getByRole('button', { name: 'Zeit', exact: true }));
  await expect(page.locator('.ptable .pname')).toHaveCount(3);
  expect(new URL(page.url()).searchParams.has('ansicht')).toBe(false);
  await clickPlanControl(options);
  await clickPlanControl(views.getByRole('button', { name: 'Gruppen', exact: true }));

  const search = page.getByRole('searchbox', { name: 'Kategorie suchen' });
  await search.fill('Recipient');
  await expect(filters.getByRole('button', { name: 'Alle (1)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(new URL(page.url()).searchParams.get('q')).toBe('Recipient');
  await filters.getByRole('button', { name: 'Überzogen (1)', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('filter')).toBe('overspent');
  await expect(page.locator('.plan-filter-cover')).toBeVisible();
  await page.goBack();
  await expect(filters.getByRole('button', { name: 'Alle (1)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goForward();
  await expect(filters.getByRole('button', { name: 'Überzogen (1)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await page.evaluate((value) => {
    document.documentElement.dataset['theme'] = value;
  }, theme);
  await expect(search).toHaveValue('Recipient');
  await expect(filters.getByRole('button', { name: 'Überzogen (1)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await filters.getByRole('button', { name: 'Ohne Kategorie (1)', exact: true }).click();
  const missing = page.getByRole('region', { name: 'Buchungen ohne Kategorie' });
  await expect(
    missing.getByRole('link', { name: 'Synthetic missing classification', exact: true }),
  ).toBeVisible();
  await expect(missing).toContainText('−1,50 €');
  await expect(search).toBeDisabled();
  await page.keyboard.press('Control+Shift+H');
  await expect(missing).toContainText('•••');
  await expect(missing).not.toContainText('1,50');
  await page.keyboard.press('Control+Shift+H');
  await missing
    .getByRole('link', { name: 'Synthetic missing classification', exact: true })
    .click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/konten/buchungen');
  expect(new URL(page.url()).searchParams.get('buchung')).toBe(ids.missingId);
  await page.goBack();
  await expect(missing).toBeVisible();
  expect(writes).toEqual([]);

  await filters.getByRole('button', { name: 'Alle (1)', exact: true }).click();
  await search.fill('');
  await filters.getByRole('button', { name: 'Überzogen (1)', exact: true }).click();
  const before = await budget(page);
  expect(
    before.summary.envelopes.find((row) => row.categoryId === ids.donorId)?.availableCents,
  ).toBe(10000);
  expect(
    before.summary.envelopes.find((row) => row.categoryId === ids.recipientId)?.availableCents,
  ).toBe(-3000);
  expect(before.budgetMoney.coverCapCents).toBeGreaterThanOrEqual(3000);
  expect(await balance(page, ids.accountId)).toBe(96850);
  await page.getByLabel('Quelle für alle Überziehungen', { exact: true }).selectOption(ids.donorId);
  const [covered] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/budget/2026-10/move',
    ),
    page.getByRole('button', { name: 'Alle aus Synthetic Donor decken', exact: true }).click(),
  ]);
  expect(covered.status()).toBe(200);
  const result = (await covered.json()) as { groupId: string };
  const after = await budget(page);
  expect(
    after.summary.envelopes.find((row) => row.categoryId === ids.donorId)?.availableCents,
  ).toBe(7000);
  expect(
    after.summary.envelopes.find((row) => row.categoryId === ids.recipientId)?.availableCents,
  ).toBe(0);
  expect(await balance(page, ids.accountId)).toBe(96850);
  expect(writes).toEqual([
    { path: '/api/budget/2026-10/move', body: { coverAll: true, fromId: ids.donorId } },
  ]);
  const opened = openDatabase(databasePath);
  try {
    expect(
      opened.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.groupId, result.groupId))
        .all().length,
    ).toBeGreaterThan(0);
  } finally {
    opened.close();
  }
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await budget(page)).summary.envelopes.find((row) => row.categoryId === ids.recipientId)
          ?.availableCents,
    )
    .toBe(-3000);
  const restored = await budget(page);
  expect(
    restored.summary.envelopes.find((row) => row.categoryId === ids.donorId)?.availableCents,
  ).toBe(10000);
  expect(await balance(page, ids.accountId)).toBe(96850);
  expect(writes.map((write) => write.path)).toEqual(['/api/budget/2026-10/move', '/api/undo']);
  const evidence = info.outputPath(`plan-filters-${profile}-${theme}.json`);
  await writeFile(
    evidence,
    JSON.stringify(
      {
        ...initial,
        profile,
        theme,
        engine: page.context().browser()!.browserType().name(),
        project: info.project.name,
        cover: {
          before: [10000, -3000],
          after: [7000, 0],
          restored: [10000, -3000],
          accountBalanceCents: 96850,
          groupId: result.groupId,
        },
      },
      null,
      2,
    ),
  );
  await info.attach('Plan filter geometry and real cover', {
    path: evidence,
    contentType: 'application/json',
  });
}

for (const profile of ['desktop', 'configured'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`Plan filters ${profile} ${theme} retain search/history, source links and actual cover Undo`, async ({
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
