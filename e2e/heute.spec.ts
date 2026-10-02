import { sampleTest as test, expect } from './sample';
import AxeBuilder from '@axe-core/playwright';
import { test as ledgerTest } from '@playwright/test';
import type { Heute } from '../apps/web/src/heute/api';
import { MAIN_URL } from '../playwright.config';
import { pickCategory, toast } from './ledger-helpers';
import { addDays } from '@budget/domain';
import { eur } from '../apps/web/src/ledger/format';

test('Heute uses live API data and period, expands the lead chain, and links to source views', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/heute?')) requests.push(request.url());
  });

  await page.goto('/?monat=2026-09');
  const response = await page.request.get('/api/heute?period=month&month=2026-09');
  expect(response.ok()).toBe(true);
  expect((await response.json()).lead.freeCents).toBe(98_826);
  await expect(page.getByRole('heading', { name: 'September 2026', exact: true })).toBeVisible();
  await expect(page.getByTestId('heute-lead-value')).toBeVisible();
  await expect(page.getByTestId('heute-lead-value')).toContainText('988');
  await expect(page.getByTestId('heute-lead-value')).toContainText(',26 €');
  await expect(page.getByTestId('heute-balance-chart')).toBeVisible();
  await expect(page.getByTestId('heute-pace-chart')).toBeVisible();
  await expect(page.getByTestId('heute-networth-chart')).toBeVisible();
  expect(
    requests.some((url) => url.includes('period=month') && url.includes('month=2026-09')),
  ).toBe(true);

  await page.getByRole('button', { name: 'Bis Gehalt', exact: true }).click();
  await expect.poll(() => requests.some((url) => url.includes('period=payday'))).toBe(true);
  await expect(page).toHaveURL(/monat=2026-09.*period=payday|period=payday.*monat=2026-09/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Bis Gehalt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByTestId('heute-lead-value').click();
  await expect(
    page.getByRole('button', { name: 'Maßkette ausblenden', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('group', { name: /Maßkette: Bedarf/ })).toBeVisible();
  await page.getByRole('button', { name: /^Bedarf/ }).click();
  await expect(page.getByRole('heading', { name: 'Envelopes Bedarf' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Angepinnte Envelopes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Anstehend · 14 Tage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Finanz-Check' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nettovermögen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Letzte Buchungen' })).toBeVisible();
  const forecastPath = await page
    .locator('[data-testid="heute-pace-chart"] .l-forecast')
    .getAttribute('d');
  const todayX = Number(
    await page.locator('[data-testid="heute-pace-chart"] .l-today').getAttribute('x1'),
  );
  const forecastStart = Number(forecastPath?.match(/^M([\d.]+)/)?.[1]);
  expect(Math.abs(forecastStart - todayX)).toBeLessThan(0.01);
  await expect(page.locator('.heute-detail-grid .circle-no')).toHaveText(['1', '2', '3', '4', '5']);
  const nonAcuteStates = await page
    .locator('.heute-state.is-bad, .heute-state.is-warn')
    .evaluateAll((elements) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--red)';
      document.body.append(probe);
      const red = getComputedStyle(probe).color;
      probe.remove();
      return elements.map((element) => getComputedStyle(element).color === red);
    });
  expect(nonAcuteStates).not.toContain(true);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await page
    .getByRole('group', { name: 'Maßkette Nettovermögen' })
    .evaluate((svg) => svg.scrollIntoView({ block: 'center' }));
  for (const [name, account, total] of [
    ['Liquidität', 'Girokonto', '9.356,00 €'],
    ['Investiert', 'Depot', '88.000,00 €'],
    ['Schulden', 'Kredit', '−12.626,00 €'],
  ]) {
    const segment = page
      .getByRole('group', { name: 'Maßkette Nettovermögen' })
      .getByRole('button', { name: new RegExp(`^${name}`) });
    await segment.locator('.seg-fill').click();
    const panel = page.getByRole('dialog', { name, exact: true });
    await expect(panel.getByRole('link', { name: account, exact: true })).toBeVisible();
    await expect(panel).toContainText(total);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(segment).toBeFocused();
  }
  await page
    .getByRole('group', { name: 'Maßkette Nettovermögen' })
    .getByRole('button', { name: /^Schulden/ })
    .press('Enter');
  const source = page
    .getByRole('dialog', { name: 'Schulden', exact: true })
    .getByRole('link', { name: 'Kredit', exact: true });
  const target = await source.getAttribute('href');
  await source.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(target);
  await expect(
    page.locator('.kacct-head').getByRole('heading', { name: 'Kredit', exact: true }),
  ).toBeVisible();
});

test('a debt account in credit adds to the composition and opens the matching detail', async ({
  page,
}) => {
  const response = await page.request.get('/api/heute?period=month&month=2026-09');
  const data: Heute = await response.json();
  await page.route('**/api/heute?*', (route) =>
    route.fulfill({
      json: {
        ...data,
        netWorth: {
          ...data.netWorth,
          liquidCents: 10_000,
          investedCents: 0,
          receivableCents: 0,
          debtCents: 2_000,
          totalCents: 12_000,
        },
      },
    }),
  );
  await page.route('**/api/accounts?asOf=*', (route) =>
    route.fulfill({
      json: {
        asOf: '2026-09-17',
        accounts: [
          {
            id: 'synthetic-credit-loan',
            name: 'Schuldkonto im Guthaben',
            role: 'debt',
            valueEurCents: 2_000,
          },
        ],
      },
    }),
  );
  await page.goto('/?monat=2026-09');
  const composition = page.getByRole('group', { name: 'Maßkette Nettovermögen' });
  await expect(composition).toBeVisible();
  await expect(composition.locator('.chain-minus')).toHaveCount(0);
  await expect(composition.locator('text').last()).toContainText('120');
  await expect(composition.getByRole('button', { name: /^Liquidität/ })).toHaveAttribute(
    'aria-label',
    /100,00/,
  );
  const credit = composition.getByRole('button', { name: /^Guthaben auf Schuldkonten/ });
  await expect(credit).toHaveAttribute('aria-label', /20,00/);
  await credit.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Guthaben auf Schuldkonten', exact: true });
  await expect(panel.getByRole('link', { name: 'Schuldkonto im Guthaben' })).toBeVisible();
  await expect(panel).toContainText('20,00 €');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('a past month has no out-of-range today marker in the balance or pace chart', async ({
  page,
}) => {
  await page.goto('/?monat=2026-08&period=month');
  await expect(page.getByRole('heading', { name: 'August 2026' })).toBeVisible();
  await expect(page.getByTestId('heute-balance-chart')).toBeVisible();
  await expect(page.locator('[data-testid="heute-balance-chart"] .l-today')).toHaveCount(0);
  await expect(page.locator('[data-testid="heute-pace-chart"] .l-today')).toHaveCount(0);
  await expect(
    page.locator('[data-testid="heute-balance-chart"] text').filter({ hasText: 'heute' }),
  ).toHaveCount(0);
  const response = await page.request.get('/api/heute?period=month&month=2026-08');
  expect((await response.json()).stand.period).toBe('month');
});

test('empty Heute lists explain what has no rows', async ({ page }) => {
  const response = await page.request.get('/api/heute?period=month&month=2026-09');
  const data = (await response.json()) as Record<string, unknown>;
  const empty = {
    ...data,
    pinned: [],
    upcoming14: [],
    lastBookings: [],
    nextSteps: { items: [], count: 0 },
  };
  await page.route('**/api/heute?*', (route) => route.fulfill({ json: empty }));
  await page.goto('/?monat=2026-09');
  await expect(page.getByText('Keine Envelopes angepinnt.')).toBeVisible();
  await expect(
    page.getByText('In den nächsten 14 Tagen sind keine erwarteten Zahlungen gelistet.'),
  ).toBeVisible();
  await expect(page.getByText('Keine offenen Schritte aus den Heute-Prüfungen.')).toBeVisible();
  await expect(page.getByText('Noch keine Buchungen vorhanden.')).toBeVisible();
});

test('next-step clicks use the current month and all prior booking dates', async ({
  page,
}, info) => {
  const response = await page.request.get('/api/heute?period=month&month=2026-08');
  const data: Heute = await response.json();
  const routed: Heute = {
    ...data,
    nextSteps: {
      count: 3,
      items: [
        {
          kind: 'overspent',
          urgent: true,
          categoryId: 'test',
          categoryName: 'Test-Envelope',
          cents: 1234,
          count: 1,
        },
        {
          kind: 'uncategorized',
          urgent: false,
          categoryId: null,
          categoryName: null,
          cents: -5678,
          count: 2,
        },
      ],
    },
  };
  await page.route('**/api/heute?*', (route) => route.fulfill({ json: routed }));
  await page.goto('/?monat=2026-08');
  const steps = page.getByRole('table', { name: 'Nächste Schritte' });
  await expect(steps).toContainText('12,34 € zu decken');
  await expect(steps).not.toContainText('−12,34 €');
  if (info.project.name === 'mobile') {
    await expect(steps.getByRole('button', { name: 'Plan öffnen' })).toBeHidden();
    await page
      .getByRole('region', { name: 'Nächster dringender Schritt' })
      .getByRole('button', { name: 'Plan öffnen' })
      .click();
  } else {
    await steps.getByRole('button', { name: 'Plan öffnen' }).click();
  }
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09/);
  await expect(page.getByRole('heading', { name: 'September 2026', exact: true })).toBeVisible();
  await page.goBack();
  await steps.getByRole('button', { name: 'Buchungen öffnen' }).click();
  await expect(page).toHaveURL(/\/konten\/buchungen\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get('bis')).toBe('2026-09-17');
  expect(url.searchParams.get('kategorie')).toBe('none');
  expect(url.searchParams.has('von')).toBe(false);
  await expect(page.getByLabel('Bis', { exact: true })).toHaveValue('2026-09-17');
  await expect(page.getByLabel('Von', { exact: true })).toHaveValue('');
});

test('source-view links open the corresponding live pages', async ({ page }) => {
  for (const [heading, link, target] of [
    ['Angepinnte Envelopes', 'Plan öffnen', '/plan/monat'],
    ['Anstehend · 14 Tage', 'Alle', '/plan/erwartet'],
    ['Finanz-Check', 'Alle Regeln', '/einstellungen/regelwerk'],
    ['Nettovermögen', 'Details', '/vermoegen/nettovermoegen'],
    ['Letzte Buchungen', 'Alle', '/konten/buchungen'],
  ]) {
    await page.goto('/?monat=2026-09');
    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
      .getByRole('link', { name: link, exact: true })
      .click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(target);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('negative lead uses the action colour and mobile urgency precedes pace', async ({
  page,
}, info) => {
  const response = await page.request.get('/api/heute?period=month&month=2026-09');
  const data: Heute = await response.json();
  await page.route('**/api/heute?*', (route) =>
    route.fulfill({ json: { ...data, lead: { ...data.lead, freeCents: -12345 } } }),
  );
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/?monat=2026-09');
    const figure = page.getByTestId('heute-lead-value');
    await expect(figure).toContainText('−123');
    await expect(figure).toContainText(',45 €');
    const colours = await figure.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--red)';
      el.append(probe);
      const red = getComputedStyle(probe).color;
      probe.remove();
      return {
        red,
        whole: getComputedStyle(el).color,
        cents: getComputedStyle(el.querySelector('small')!).color,
      };
    });
    expect(colours.whole).toBe(colours.red);
    expect(colours.cents).toBe(colours.red);
    const urgent = page.getByRole('region', { name: 'Nächster dringender Schritt' });
    if (info.project.name === 'mobile') {
      await expect(urgent).toBeVisible();
      const leadBox = await page.locator('.heute-lead').boundingBox();
      const urgentBox = await urgent.boundingBox();
      const paceBox = await page.locator('.heute-pace').boundingBox();
      expect(urgentBox!.y).toBeGreaterThanOrEqual(leadBox!.y + leadBox!.height);
      expect(urgentBox!.y + urgentBox!.height).toBeLessThan(paceBox!.y);
      expect(urgentBox!.y + urgentBox!.height).toBeLessThan(page.viewportSize()!.height);
      await expect(figure).toHaveCSS('font-size', '40px');
      expect((await page.getByTestId('heute-balance-chart').boundingBox())!.height).toBe(232);
      await urgent.getByRole('button', { name: 'Plan öffnen' }).click();
      await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09/);
    } else {
      await expect(urgent).toBeHidden();
    }
  }
});

test('a failed Heute request offers a working retry', async ({ page }) => {
  let fail = true;
  await page.route('**/api/heute?*', (route) =>
    fail ? route.fulfill({ status: 503, json: { error: 'unavailable' } }) : route.continue(),
  );
  await page.goto('/?monat=2026-09');
  await expect(page.getByRole('alert')).toContainText('Heute konnten nicht geladen werden.', {
    timeout: 15_000,
  });
  fail = false;
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByTestId('heute-lead-value')).toContainText('988');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('settled balance reaches the forecast and the composition measures its parts in both motion modes', async ({
  page,
}, info) => {
  for (const [colorScheme, reducedMotion] of [
    ['light', 'reduce'],
    ['dark', 'reduce'],
    ['light', 'no-preference'],
    ['dark', 'no-preference'],
  ] as const) {
    await page.emulateMedia({ reducedMotion, colorScheme });
    await page.goto('/?monat=2026-09');
    await expect(page.getByTestId('heute-networth-chart')).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    const balance = await page.getByTestId('heute-balance-chart').evaluate((svg) => {
      const actual = svg.querySelector<SVGPathElement>('.l-actual')!;
      const forecast = svg.querySelector<SVGPathElement>('.l-forecast')!;
      const end = actual.getPointAtLength(actual.getTotalLength());
      const start = forecast.getPointAtLength(0);
      return {
        end: [end.x, end.y],
        start: [start.x, start.y],
        offset: getComputedStyle(actual).strokeDashoffset,
      };
    });
    expect(balance.end[0]).toBeCloseTo(balance.start[0]!, 2);
    expect(balance.end[1]).toBeCloseTo(balance.start[1]!, 2);
    expect(balance.offset).toBe('0px');
    const lowLabel = await page
      .locator('[data-testid="heute-balance-chart"] .fade-in text')
      .boundingBox();
    const salaryLabel = await page.locator('.heute-salary-label').boundingBox();
    if (lowLabel && salaryLabel) {
      expect(
        lowLabel.x + lowLabel.width < salaryLabel.x ||
          salaryLabel.x + salaryLabel.width < lowLabel.x ||
          lowLabel.y + lowLabel.height < salaryLabel.y ||
          salaryLabel.y + salaryLabel.height < lowLabel.y,
      ).toBe(true);
    }
    const composition = page.getByRole('group', { name: 'Maßkette Nettovermögen' });
    await expect(composition.getByRole('button', { name: /^Liquidität/ })).toBeVisible();
    await expect(composition.getByRole('button', { name: /^Investiert/ })).toBeVisible();
    await expect(composition.getByRole('button', { name: /^Schulden/ })).toBeVisible();
    await expect(composition.locator('.chain-minus .seg-outline')).toHaveAttribute(
      'stroke-dasharray',
      'var(--dash-debt)',
    );
    await expect(composition.locator('.chain-minus .seg-fill')).toHaveAttribute(
      'fill',
      'transparent',
    );
    await expect(composition.locator('text').last()).toContainText('Nettovermögen');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const capture = info.outputPath(`heute-${colorScheme}-${reducedMotion}.png`);
    await page.screenshot({ path: capture, fullPage: true, animations: 'allow' });
    await info.attach(`Heute ${colorScheme} ${reducedMotion}`, {
      path: capture,
      contentType: 'image/png',
    });
  }
});

ledgerTest(
  'Today refreshes after capture, undo and redo without reloading',
  async ({ page }, info) => {
    ledgerTest.skip(
      info.project.name !== 'desktop',
      'One capture writer on the shared main ledger; both viewports read the sample ledger.',
    );
    const headers = { origin: MAIN_URL };
    const current: Heute = await (await page.request.get('/api/heute')).json();
    const day = current.stand.today;
    const month = day.slice(0, 7);
    const cleanup: string[] = [];
    let liveBookingGroup: string | undefined;
    const categoryName = `Heute Capture ${Date.now()}`;
    const post = async (path: string, data: unknown) => {
      const response = await page.request.post(path, { headers, data });
      expect(response.ok(), await response.text()).toBe(true);
      const body = await response.json();
      cleanup.push(body.groupId);
      return body;
    };
    try {
      const { account } = await post('/api/accounts', {
        name: categoryName,
        type: 'checking',
        openingDate: `${Number(day.slice(0, 4)) - 1}-01-01`,
        openingBalanceCents: 10_000,
      });
      const { category } = await post('/api/categories', {
        name: categoryName,
        groupId: 'e2e-g',
        class: 'need',
        kind: 'variable',
      });
      const assigned = await page.request.put(`/api/budget/${month}/assigned`, {
        headers,
        data: { items: [{ categoryId: category.id, assignedCents: 10_000 }] },
      });
      expect(assigned.ok()).toBe(true);
      cleanup.push((await assigned.json()).groupId);
      // Other specs share this ledger. Keep an unrelated overspent envelope here so this
      // regression cannot accidentally rely on the whole household starting at 100 EUR.
      const { category: other } = await post('/api/categories', {
        name: `Heute Begleitprüfung ${Date.now()}`,
        groupId: 'e2e-g',
        class: 'want',
        kind: 'variable',
      });
      await post('/api/bookings', {
        type: 'booking',
        accountId: account.id,
        date: day,
        amountCents: -20_570,
        categoryId: other.id,
      });
      await page.goto(`/?monat=${month}`);
      await expect(page.getByTestId('heute-lead-value')).toBeVisible();
      await page.getByRole('button', { name: 'Maßkette zeigen', exact: true }).click();
      await page.getByRole('button', { name: /^Bedarf/ }).click();
      const envelope = page.locator('.heute-breakdown li').filter({ hasText: categoryName });
      await expect(envelope.locator('strong')).toHaveText('100,00 €');
      const assertFresh = async (data: Heute, availableCents: number, text: string) => {
        expect(data.lead.items.need.find((item) => item.id === category.id)?.availableCents).toBe(
          availableCents,
        );
        await expect(envelope.locator('strong')).toHaveText(text);
        await expect(page.getByTestId('heute-lead-value')).toHaveText(eur(data.lead.freeCents));
      };
      const refreshed = () =>
        page.waitForResponse((response) => response.url().includes('/api/heute?') && response.ok());
      await page.keyboard.press('n');
      const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
      await panel.getByLabel('Konto', { exact: true }).selectOption(account.id);
      await panel.getByLabel('Datum', { exact: true }).fill(day);
      await panel.getByLabel('Betrag', { exact: true }).fill('20,70');
      await pickCategory(panel, categoryName);
      const written = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/bookings') && response.request().method() === 'POST',
      );
      let refresh = refreshed();
      await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
      liveBookingGroup = (await (await written).json()).groupId;
      let data: Heute = await (await refresh).json();
      await assertFresh(data, 7930, '79,30 €');
      refresh = refreshed();
      await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
      liveBookingGroup = undefined;
      data = await (await refresh).json();
      await assertFresh(data, 10_000, '100,00 €');
      refresh = refreshed();
      const redone = page.waitForResponse(
        (response) => response.url().endsWith('/api/undo') && response.ok(),
      );
      await toast(page).getByRole('button', { name: 'Wiederholen' }).click();
      liveBookingGroup = (await (await redone).json()).groupId;
      data = await (await refresh).json();
      await assertFresh(data, 7930, '79,30 €');
      // A prior-month uncategorized entry remains actionable; tomorrow's entry stays outside
      // the Today count and the linked view. The categorised capture is filtered out there.
      const priorMemo = `${categoryName} vorheriger Monat`;
      const futureMemo = `${categoryName} morgen`;
      await post('/api/bookings', {
        type: 'booking',
        accountId: account.id,
        date: addDays(`${month}-01`, -1),
        amountCents: -123,
        categoryId: null,
        memo: priorMemo,
      });
      await post('/api/bookings', {
        type: 'booking',
        accountId: account.id,
        date: addDays(day, 1),
        amountCents: -456,
        categoryId: null,
        memo: futureMemo,
      });
      await page.goto(`/?monat=${month}`);
      const steps = page.getByRole('table', { name: 'Nächste Schritte' });
      await expect(steps).toContainText(/\d+ Buchung(?:en)? ohne Kategorie/);
      await steps.getByRole('button', { name: 'Buchungen öffnen' }).click();
      const url = new URL(page.url());
      expect(url.searchParams.get('kategorie')).toBe('none');
      expect(url.searchParams.get('bis')).toBe(day);
      expect(url.searchParams.has('von')).toBe(false);
      await expect(page.getByRole('row').filter({ hasText: priorMemo })).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: futureMemo })).toHaveCount(0);
      await expect(page.getByLabel('Kategorie', { exact: true })).toHaveValue('ohne Kategorie');
    } finally {
      if (liveBookingGroup) cleanup.push(liveBookingGroup);
      for (const groupId of cleanup.reverse()) {
        const response = await page.request.post('/api/undo', { headers, data: { groupId } });
        expect(response.ok()).toBe(true);
      }
    }
  },
);
