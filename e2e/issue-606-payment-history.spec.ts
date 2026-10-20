import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });
type Detail = {
  history: Array<{ occurrenceId: string; dueDate: string; deviationCents: number | null }>;
  future: Array<{
    occurrenceId: string | null;
    dueDate: string;
    expectedAmountCents: number;
    source: string;
  }>;
};

async function post<T>(page: Page, origin: string, path: string, data: unknown, status = 200) {
  const response = await page.request.post(origin + '/api' + path, { data, headers: { origin } });
  expect(response.status(), await response.text()).toBe(status);
  return response.json() as Promise<T>;
}
async function detail(page: Page, id: string): Promise<Detail> {
  const response = await page.request.get(`/api/expected/${id}/detail`);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  return response.json() as Promise<Detail>;
}
async function seed(page: Page, origin: string) {
  const { account } = await post<{ account: { id: string } }>(
    page,
    origin,
    '/accounts',
    {
      name: 'Synthetic payment account',
      type: 'checking',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 10000,
    },
    201,
  );
  const { payment } = await post<{ payment: { id: string } }>(
    page,
    origin,
    '/expected',
    {
      name: 'Synthetic monthly payment',
      kind: 'outflow',
      accountId: account.id,
      amountCents: 1234,
      rhythm: 'monthly',
      dueDay: 20,
      startDate: '2026-01-01',
      validFrom: '2026-01-01',
    },
    201,
  );
  const rows = await detail(page, payment.id);
  const august = rows.history.find((r) => r.dueDate === '2026-08-20')!;
  expect(august).toBeTruthy();
  const booked = await post<{ id: string }>(
    page,
    origin,
    '/bookings',
    {
      type: 'booking',
      accountId: account.id,
      date: '2026-08-20',
      amountCents: -1334,
      status: 'confirmed',
    },
    201,
  );
  await post(page, origin, `/expected/occurrences/${august.occurrenceId}/link`, {
    bookingId: booked.id,
  });
  return { accountId: account.id, paymentId: payment.id };
}

test('direct detail retains real signed history, default three, fourth-term version inspection and exact undo', async ({
  page,
  isolatedLedger,
}) => {
  test.setTimeout(60_000); // Existing real version dialog/save/undo plus a separate annual preview.
  const { accountId, paymentId } = await seed(page, isolatedLedger.origin);
  const before = await detail(page, paymentId);
  expect(before.history.find((r) => r.dueDate === '2026-08-20')?.deviationCents).toBe(-100);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET')
      writes.push(request.method() + ' ' + new URL(request.url()).pathname);
  });
  await page.goto(`/plan/erwartet/${paymentId}`);
  const history = page.getByRole('list', {
    name: 'Vergangene Fälligkeiten von Synthetic monthly payment',
  });
  const august = history.locator('li', { hasText: '20.08.2026' });
  await expect(august.locator('.xp-occ-amt')).toContainText('−12,34 €');
  await expect(august.locator('.xp-occ-actual')).toContainText('−13,34 €');
  await expect(august.locator('.xp-occ-delta')).toContainText('−1,00 €');
  await expect(august.getByRole('link', { name: /Buchung 20.08.2026/ })).toHaveAttribute(
    'href',
    /buchung=/,
  );
  const future = page.getByRole('list', {
    name: 'Kommende Fälligkeiten von Synthetic monthly payment',
  });
  await expect(future.locator('li')).toHaveCount(3);
  expect(await detail(page, paymentId)).toEqual(before);
  expect(writes).toEqual([]);

  const { payment: versioned } = await post<{ payment: { id: string } }>(
    page,
    isolatedLedger.origin,
    '/expected',
    {
      name: 'Synthetic version proof',
      kind: 'inflow',
      accountId,
      amountCents: 100000,
      rhythm: 'monthly',
      dueDay: 28,
      startDate: '2026-12-28',
    },
    201,
  );
  await page.goto(`/plan/erwartet/${versioned.id}`);
  await page.getByRole('button', { name: 'Weitere Termine', exact: true }).click();
  const march = page.locator('.xp-occ li', { hasText: '28.03.2027' });
  await expect(march).toContainText('1.000,00 €');
  await page.getByRole('button', { name: 'Neue Version', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Neue Version', exact: true });
  await form.getByLabel('Ab Monat').fill('2027-02');
  await form.getByLabel('Neuer Betrag').fill('1200');
  await form.getByRole('button', { name: 'Version speichern', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(march).toContainText('1.200,00 €');
  await expect(page.locator('.xp-occ li', { hasText: '28.01.2027' })).toContainText('1.000,00 €');
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect(march).toContainText('1.000,00 €');
  const restored = await detail(page, versioned.id);
  expect(restored.future.slice(0, 4).map((r) => r.expectedAmountCents)).toEqual([
    100000, 100000, 100000, 100000,
  ]);

  const { payment: annual } = await post<{ payment: { id: string } }>(
    page,
    isolatedLedger.origin,
    '/expected',
    {
      name: 'Synthetic annual preview',
      kind: 'outflow',
      accountId,
      amountCents: 1000,
      rhythm: 'yearly',
      dueMonth: 12,
      dueDay: 31,
      startDate: '2026-01-01',
    },
    201,
  );
  await page.goto(`/plan/erwartet/${annual.id}`);
  const annualRows = page.getByRole('list', {
    name: 'Kommende Fälligkeiten von Synthetic annual preview',
  });
  await expect(annualRows.locator('li')).toHaveCount(3);
  await expect(annualRows).toContainText('31.12.2028');
  const projected = annualRows.locator('li', { hasText: '31.12.2028' });
  await expect(projected).toContainText('Vorschau aus aktueller Regel · nicht gespeichert');
  await expect(projected.getByRole('button')).toHaveCount(0);
});

const resolvedTheme = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.dataset['theme'] === 'dark' ||
    (document.documentElement.dataset['theme'] !== 'light' &&
      matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light',
  );
async function theme(page: Page, value: 'light' | 'dark') {
  if ((await resolvedTheme(page)) === value) return;
  if (page.viewportSize()!.width < 768) {
    const summary = page.locator('.m-profile > summary');
    await summary.click();
    await page
      .locator('.m-profile')
      .getByRole('button', {
        name: value === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
        exact: true,
      })
      .click();
    await summary.click();
  } else
    await page
      .locator('.sidebar-foot')
      .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
      .click();
  await expect.poll(() => resolvedTheme(page)).toBe(value);
}

async function inspect(
  page: Page,
  info: TestInfo,
  id: string,
  value: 'light' | 'dark',
  label: string,
) {
  await page.goto(`/plan/erwartet/${id}`);
  await theme(page, value);
  await expect(page.getByRole('heading', { name: 'Soll gegen Ist', exact: true })).toBeVisible();
  const more = page.getByRole('button', { name: 'Weitere Termine', exact: true });
  await more.focus();
  await expect(more).toBeFocused();
  await page.keyboard.press('Enter');
  const expanded = page.getByRole('button', { name: 'Weniger Termine', exact: true });
  await expect(expanded).toHaveAttribute('aria-expanded', 'true');
  const box = await expanded.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const link = page.getByRole('link', { name: /Buchung 20.08.2026/ });
  const linkedBox = await link.boundingBox();
  expect(linkedBox!.width).toBeGreaterThanOrEqual(44);
  expect(linkedBox!.height).toBeGreaterThanOrEqual(44);
  for (const control of await page.locator('.xp-occ-act button').all()) {
    const target = await control.boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(target!.width).toBeGreaterThanOrEqual(44);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expanded.press('Enter');
  await expect(
    page
      .getByRole('list', { name: 'Kommende Fälligkeiten von Synthetic monthly payment' })
      .locator('li'),
  ).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Control+Shift+H');
  await expect(page.locator('.xp-big')).toContainText('•••');
  const text = await page.locator('[aria-labelledby="xp-occ"]').innerText();
  expect(text).not.toContain('12,34');
  expect(text).not.toContain('13,34');
  expect(text).not.toContain('1,00');
  await page.keyboard.press('Control+Shift+H');
  await expect(page.locator('.xp-big')).toContainText('−12,34 €');
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    scrollTo(0, 0);
    await document.fonts.ready;
  });
  await page.screenshot({
    path: info.outputPath(`payment-history-${label}-${value}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  const runtimePath = info.outputPath(`runtime-${label}-${value}.json`);
  await writeFile(
    runtimePath,
    JSON.stringify({
      engine: page.context().browser()!.browserType().name(),
      project: info.project.name,
      label,
      viewport: page.viewportSize(),
      theme: await resolvedTheme(page),
      ...(await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        maxTouchPoints: navigator.maxTouchPoints,
        dpr: devicePixelRatio,
      }))),
    }),
  );
  await info.attach(`runtime-${label}-${value}`, {
    path: runtimePath,
    contentType: 'application/json',
  });
}

for (const value of ['light', 'dark'] as const) {
  test(`payment history ${value}: actual profile, strict Axe, privacy, keyboard and read-only details`, async ({
    page,
    browser,
    isolatedLedger,
    baseURL,
  }, info) => {
    test.setTimeout(60_000); // Two real contexts only for the explicit WebKit desktop-layout diagnostic.
    const { paymentId } = await seed(page, isolatedLedger.origin);
    await inspect(page, info, paymentId, value, info.project.name);
    if (browser.browserType().name() === 'webkit') {
      const context = await browser.newContext({
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
        const desktop = await context.newPage();
        await desktop.clock.setFixedTime(new Date('2026-09-17T12:00:00+02:00'));
        await inspect(desktop, info, paymentId, value, 'webkit-desktop-layout1440');
      } finally {
        await context.close();
      }
    }
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`legacy currency explanation retains whole dates and contained content at ${viewport.width}px`, async ({
    browser,
    isolatedLedger,
    ledgerToday,
  }, info) => {
    const phone = viewport.width === 390;
    const context = await browser.newContext({
      baseURL: isolatedLedger.origin,
      storageState: isolatedLedger.storageState,
      viewport,
      isMobile: phone,
      hasTouch: phone,
      deviceScaleFactor: phone ? 3 : 1,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(`${ledgerToday}T12:00:00+02:00`));
      const { paymentId } = await seed(page, isolatedLedger.origin);
      // Real stored EUR occurrence + backdated USD version: retained cents have no currency proof.
      await post(
        page,
        isolatedLedger.origin,
        `/expected/${paymentId}/versions`,
        {
          validFrom: '2026-08-01',
          amountCents: 1234,
          currency: 'USD',
        },
        201,
      );
      const response = await page.request.get(`/api/expected/${paymentId}/detail`);
      expect(response.status()).toBe(200);
      const before = await response.json();
      expect(
        before.history.find((row: { dueDate: string }) => row.dueDate === '2026-08-20'),
      ).toMatchObject({
        currency: null,
        expectedAmountCents: -1234,
        actualComparableCents: null,
        deviationCents: null,
        unavailableReason: 'missing_currency',
      });
      const writes: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/') && request.method() !== 'GET')
          writes.push(request.method() + ' ' + new URL(request.url()).pathname);
      });
      await page.goto(`/plan/erwartet/${paymentId}`);
      const row = page
        .getByRole('list', { name: 'Vergangene Fälligkeiten von Synthetic monthly payment' })
        .locator('li', { hasText: '20.08.2026' });
      await expect(row.locator('.xp-occ-date')).toHaveText('20.08.2026');
      await expect(row.locator('.xp-occ-amt')).toContainText('−12,34 (Währung nicht dokumentiert)');
      await expect(row.locator('.xp-occ-amt')).not.toContainText('€');
      await expect(row.locator('.xp-occ-book')).toContainText(
        'Ursprüngliche Währung nicht dokumentiert; Abweichung nicht verfügbar.',
      );
      const proofs = [];
      for (const value of ['light', 'dark'] as const) {
        await theme(page, value);
        await page.evaluate(() => document.fonts.ready);
        await row.scrollIntoViewIfNeeded();
        const geometry = await row.evaluate((element) => {
          const rect = (target: Element) => {
            const r = target.getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            };
          };
          const part = (selector: string) => {
            const target = element.querySelector(selector);
            if (!target) throw new Error(`Missing required occurrence role: ${selector}`);
            const range = document.createRange();
            range.selectNodeContents(target);
            return {
              box: rect(target),
              text: [...range.getClientRects()]
                .filter((r) => r.width > 0 && r.height > 0)
                .map((r) => ({
                  left: r.left,
                  right: r.right,
                  top: r.top,
                  bottom: r.bottom,
                  width: r.width,
                  height: r.height,
                })),
            };
          };
          const visibleObstacle = (selector: string) => {
            const target = document.querySelector(selector);
            if (!target) return null;
            const bounds = rect(target);
            return bounds.width > 0 && bounds.height > 0 ? bounds : null;
          };
          return {
            row: rect(element),
            date: part('.xp-occ-date'),
            amount: part('.xp-occ-amt'),
            reason: part('.xp-occ-book'),
            controls: [...element.querySelectorAll('button,a')].map(rect),
            fab: visibleObstacle('.fab'),
            nav: visibleObstacle('.tabbar'),
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            engineIndependentProfile: {
              dpr: devicePixelRatio,
              coarse: matchMedia('(pointer: coarse)').matches,
              maxTouchPoints: navigator.maxTouchPoints,
            },
          };
        });
        const violations = (await new AxeBuilder({ page }).analyze()).violations;
        proofs.push({ theme: value, geometry, axeViolations: violations });
        await page.screenshot({
          path: info.outputPath(`legacy-currency-${viewport.width}-${value}.png`),
          fullPage: false,
        });
      }
      // Save all actual profile/theme geometry before the first layout assertion can fail.
      await writeFile(
        info.outputPath(`legacy-currency-${viewport.width}-geometry.json`),
        JSON.stringify(
          {
            fixture: 'Real API stored EUR occurrence followed by same-cents backdated USD version',
            engine: browser.browserType().name(),
            project: info.project.name,
            proofs,
          },
          null,
          2,
        ),
      );
      for (const proof of proofs) {
        const { geometry: g } = proof;
        expect(g.documentWidth).toBeLessThanOrEqual(viewport.width);
        if (phone) {
          // Real fixture NAV is visible; hidden FAB is recorded as null, not visible-FAB proof.
          expect(g.nav).not.toBeNull();
          expect(g.nav?.width ?? 0).toBeGreaterThan(0);
          expect(g.nav?.height ?? 0).toBeGreaterThan(0);
        }
        expect(g.date.text).toHaveLength(1);
        expect(g.date.box.width).toBeGreaterThan(0);
        expect(g.date.box.right).toBeLessThanOrEqual(g.amount.box.left);
        for (const part of [g.date, g.amount, g.reason]) {
          expect(part.text.length).toBeGreaterThan(0);
          for (const text of part.text) {
            expect(text.left).toBeGreaterThanOrEqual(part.box.left);
            expect(text.right).toBeLessThanOrEqual(part.box.right);
            expect(text.left).toBeGreaterThanOrEqual(g.row.left);
            expect(text.right).toBeLessThanOrEqual(g.row.right);
            expect(text.top).toBeGreaterThanOrEqual(g.row.top);
            expect(text.bottom).toBeLessThanOrEqual(g.row.bottom);
            if (g.nav) expect(text.bottom).toBeLessThanOrEqual(g.nav.top);
            if (g.fab)
              expect(
                text.left < g.fab.right &&
                  text.right > g.fab.left &&
                  text.top < g.fab.bottom &&
                  text.bottom > g.fab.top,
              ).toBe(false);
          }
        }
        expect(g.controls.length).toBeGreaterThan(0);
        for (const control of g.controls) {
          expect(control.width).toBeGreaterThanOrEqual(44);
          expect(control.height).toBeGreaterThanOrEqual(44);
        }
        expect(proof.axeViolations).toEqual([]);
      }
      expect(writes).toEqual([]);
      const after = await page.request.get(`/api/expected/${paymentId}/detail`);
      expect(after.status()).toBe(200);
      expect(await after.json()).toEqual(before);
    } finally {
      await context.close();
    }
  });
}
