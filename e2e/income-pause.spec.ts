import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect } from '@playwright/test';
import { test as isolatedTest } from './isolated-ledger';

const expect = baseExpect.configure({ timeout: 15_000 });
isolatedTest.beforeEach(() => isolatedTest.slow());

isolatedTest(
  'creates, edits, undoes and removes a forecast-only income pause',
  async ({ page, baseURL }, info) => {
    const origin = baseURL!;
    const accountResponse = await page.request.post('/api/accounts', {
      headers: { origin },
      data: {
        name: `Synthetic pause account ${info.project.name}`,
        type: 'checking',
        openingDate: '2026-10-02',
        openingBalanceCents: 100_000,
      },
    });
    expect(accountResponse.status(), await accountResponse.text()).toBe(201);
    const { account } = (await accountResponse.json()) as { account: { id: string } };

    const createPayment = async (name: string, incomeTypeId: string, amountCents: number) => {
      const response = await page.request.post('/api/expected', {
        headers: { origin },
        data: {
          name,
          kind: 'inflow',
          accountId: account.id,
          incomeTypeId,
          rhythm: 'monthly',
          dueDay: 15,
          dateShift: 'none',
          startDate: '2026-10-02',
          validFrom: '2026-10-02',
          amountCents,
        },
      });
      expect(response.status(), await response.text()).toBe(201);
      return ((await response.json()) as { payment: { id: string } }).payment.id;
    };
    const salaryId = await createPayment(
      `Synthetic salary ${info.project.name}`,
      'income-salary',
      300_123,
    );
    const sideIncomeId = await createPayment(
      `Synthetic side income ${info.project.name}`,
      'income-side',
      220_000,
    );

    const getForecast = async (horizon: '90d' | '6m' | '12m' = '6m') => {
      const response = await page.request.get(`/api/liquidity?horizon=${horizon}`);
      expect(response.status()).toBe(200);
      return (await response.json()) as {
        incomePauses: {
          id: string;
          sourceId: string;
          sourceName: string | null;
          startDate: string;
          endDate: string;
          sourceState: string;
          coverage: string;
          suppressedOccurrences: { dueDate: string; amountCents: number }[];
          verdictSuppressedOccurrences: { dueDate: string; amountCents: number }[];
          unchangedOccurrences: {
            dueDate: string;
            currency: string;
            reason: string;
            amountCents: number | null;
          }[];
        }[];
        report: { months: { month: string; incomeCents: number }[] };
      };
    };
    const monthIncome = (forecast: Awaited<ReturnType<typeof getForecast>>, month: string) =>
      forecast.report.months.find((row) => row.month === month)?.incomeCents;
    const waitForWrite = (method: string, path: string) =>
      page.waitForResponse(
        (response) =>
          response.request().method() === method && new URL(response.url()).pathname === path,
      );
    const occurrences = async () => {
      const response = await page.request.get(
        '/api/expected/occurrences?from=2026-10-01&to=2026-11-30',
      );
      expect(response.status()).toBe(200);
      return (await response.json()) as {
        occurrences: { paymentId: string; dueDate: string; amountCents: number }[];
      };
    };
    const assertScheduleAndNoBookings = async () => {
      const rows = await occurrences();
      expect(rows.occurrences.find((row) => row.paymentId === salaryId)).toMatchObject({
        dueDate: '2026-10-15',
        amountCents: 300_123,
      });
      expect(rows.occurrences.find((row) => row.paymentId === sideIncomeId)).toMatchObject({
        dueDate: '2026-10-15',
        amountCents: 220_000,
      });
      const bookings = await page.request.get('/api/bookings');
      expect(bookings.status()).toBe(200);
      const body = (await bookings.json()) as { total: number };
      expect(body.total).toBe(0);
    };

    const before = await getForecast();
    expect(monthIncome(before, '2026-10')).toBe(520_123);
    await assertScheduleAndNoBookings();
    await page.goto('/reports/liquiditaet');

    const pauseCard = page.locator('section[aria-labelledby="liq-pauses"]');
    const source = pauseCard.getByLabel('Einnahmequelle');
    const start = pauseCard.getByLabel('Beginn');
    const end = pauseCard.getByLabel('Ende');
    await source.selectOption(sideIncomeId);
    await start.fill('2026-10-01');
    await end.fill('2026-11-15');
    const ongoingCreate = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/liquidity/income-pauses',
      { timeout: 5_000 },
    );
    await pauseCard.getByRole('button', { name: 'Pause einrichten' }).click();
    expect((await ongoingCreate).status()).toBe(201);
    const ongoingForecast = await getForecast();
    expect(ongoingForecast.incomePauses).toMatchObject([
      {
        sourceId: sideIncomeId,
        startDate: '2026-10-01',
        endDate: '2026-11-15',
        suppressedOccurrences: [
          { dueDate: '2026-10-15', amountCents: 220_000 },
          { dueDate: '2026-11-15', amountCents: 220_000 },
        ],
      },
    ]);
    expect(monthIncome(ongoingForecast, '2026-10')).toBe(300_123);
    expect(monthIncome(ongoingForecast, '2026-11')).toBe(300_123);
    const ongoingDelete = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname.startsWith('/api/liquidity/income-pauses/'),
    );
    await pauseCard
      .getByRole('button', {
        name: `Pause für Synthetic side income ${info.project.name} entfernen`,
      })
      .click();
    expect((await ongoingDelete).status()).toBe(200);
    expect((await getForecast()).incomePauses).toEqual([]);

    await source.selectOption(salaryId);
    await start.fill('2026-10-15');
    await end.fill('2026-10-15');
    let writeResponse = waitForWrite('POST', '/api/liquidity/income-pauses');
    await pauseCard.getByRole('button', { name: 'Pause einrichten' }).click();
    expect((await writeResponse).status()).toBe(201);

    let forecast = await getForecast();
    expect(monthIncome(forecast, '2026-10')).toBe(220_000);
    expect(forecast.incomePauses).toMatchObject([
      {
        sourceId: salaryId,
        sourceName: `Synthetic salary ${info.project.name}`,
        startDate: '2026-10-15',
        endDate: '2026-10-15',
        sourceState: 'active',
        coverage: 'applied',
        suppressedOccurrences: [{ dueDate: '2026-10-15', amountCents: 300_123 }],
      },
    ]);
    await expect(pauseCard).toContainText('3.001,23 € Einnahme ausgesetzt');
    await expect(page.getByTestId('liq-scenario-basis')).toContainText('Einkommenspause');
    await expect(page.getByTestId('liq-legend')).toContainText('Prognose mit Einkommenspausen');
    await expect(page.getByTestId('liq-low-context')).toContainText(
      'Tiefpunkt mit Einkommenspausen',
    );
    await assertScheduleAndNoBookings();

    await pauseCard
      .getByRole('button', { name: `Pause für Synthetic salary ${info.project.name} bearbeiten` })
      .click();
    writeResponse = waitForWrite('POST', '/api/undo');
    await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
    expect((await writeResponse).status()).toBe(200);
    await expect(pauseCard.getByRole('form', { name: 'Einkommenspause einrichten' })).toBeVisible();
    await expect(pauseCard.getByRole('button', { name: 'Pause einrichten' })).toBeVisible();
    await expect(start).toHaveValue('03.10.2026');
    await expect(end).toHaveValue('03.10.2026');
    forecast = await getForecast();
    expect(forecast.incomePauses).toEqual([]);
    expect(monthIncome(forecast, '2026-10')).toBe(520_123);
    await source.selectOption(salaryId);
    await start.fill('2026-10-15');
    await end.fill('2026-10-15');
    writeResponse = waitForWrite('POST', '/api/liquidity/income-pauses');
    await pauseCard.getByRole('button', { name: 'Pause einrichten' }).click();
    expect((await writeResponse).status()).toBe(201);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      const axe = await new AxeBuilder({ page })
        .include('[data-testid="liq-forecast-card"]')
        .include('section[aria-labelledby="liq-pauses"]')
        .analyze();
      expect(axe.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const undersized = await pauseCard
        .locator('button, input, select')
        .evaluateAll((nodes) =>
          nodes
            .map((node) => (node as HTMLElement).getBoundingClientRect().height)
            .filter((height) => height < 44),
        );
      expect(undersized).toEqual([]);
      await page.screenshot({
        fullPage: true,
        animations: 'disabled',
        path: info.outputPath(`income-pause-${page.viewportSize()!.width}-${theme}.png`),
      });
    }

    await pauseCard
      .getByRole('button', { name: `Pause für Synthetic salary ${info.project.name} bearbeiten` })
      .click();
    await source.selectOption(sideIncomeId);
    await start.fill('2026-10-01');
    await end.fill('2026-11-15');
    const save = pauseCard.getByRole('button', { name: 'Pause speichern' });
    await end.focus();
    await page.keyboard.press('Tab');
    await expect(save).toBeFocused();
    writeResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname.startsWith('/api/liquidity/income-pauses/'),
    );
    await save.click();
    expect((await writeResponse).status()).toBe(200);
    forecast = await getForecast();
    expect(monthIncome(forecast, '2026-10')).toBe(300_123);
    expect(monthIncome(forecast, '2026-11')).toBe(300_123);
    expect(forecast.incomePauses).toMatchObject([
      {
        sourceId: sideIncomeId,
        startDate: '2026-10-01',
        endDate: '2026-11-15',
        suppressedOccurrences: [
          { dueDate: '2026-10-15', amountCents: 220_000 },
          { dueDate: '2026-11-15', amountCents: 220_000 },
        ],
      },
    ]);
    await assertScheduleAndNoBookings();

    writeResponse = waitForWrite('POST', '/api/undo');
    await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
    expect((await writeResponse).status()).toBe(200);
    forecast = await getForecast();
    expect(monthIncome(forecast, '2026-10')).toBe(220_000);
    expect(monthIncome(forecast, '2026-11')).toBe(520_123);
    expect(forecast.incomePauses).toMatchObject([
      { sourceId: salaryId, startDate: '2026-10-15', endDate: '2026-10-15' },
    ]);
    await assertScheduleAndNoBookings();

    await pauseCard
      .getByRole('button', { name: `Pause für Synthetic salary ${info.project.name} bearbeiten` })
      .click();
    writeResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname.startsWith('/api/liquidity/income-pauses/'),
    );
    await pauseCard
      .getByRole('button', { name: `Pause für Synthetic salary ${info.project.name} entfernen` })
      .click();
    expect((await writeResponse).status()).toBe(200);
    await expect(pauseCard.getByRole('form', { name: 'Einkommenspause einrichten' })).toBeVisible();
    writeResponse = waitForWrite('POST', '/api/undo');
    await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
    expect((await writeResponse).status()).toBe(200);
    await expect(pauseCard.getByRole('form', { name: 'Einkommenspause einrichten' })).toBeVisible();
    await expect(pauseCard.getByRole('button', { name: 'Pause einrichten' })).toBeVisible();
    await expect(start).toHaveValue('03.10.2026');
    await expect(end).toHaveValue('03.10.2026');
    await expect(pauseCard).toContainText(`Synthetic salary ${info.project.name}`);
    writeResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname.startsWith('/api/liquidity/income-pauses/'),
    );
    await pauseCard
      .getByRole('button', { name: `Pause für Synthetic salary ${info.project.name} entfernen` })
      .click();
    expect((await writeResponse).status()).toBe(200);
    forecast = await getForecast();
    expect(forecast.incomePauses).toEqual([]);
    expect(monthIncome(forecast, '2026-10')).toBe(520_123);
    await assertScheduleAndNoBookings();

    await source.selectOption(sideIncomeId);
    await start.fill('2027-06-15');
    await end.fill('2027-06-15');
    writeResponse = waitForWrite('POST', '/api/liquidity/income-pauses');
    await pauseCard.getByRole('button', { name: 'Pause einrichten' }).click();
    expect((await writeResponse).status()).toBe(201);
    forecast = await getForecast();
    expect(forecast.incomePauses).toMatchObject([
      {
        sourceId: sideIncomeId,
        startDate: '2027-06-15',
        endDate: '2027-06-15',
        coverage: 'outside_horizon',
        suppressedOccurrences: [],
      },
    ]);
    await expect(pauseCard).toContainText('Außerhalb des gewählten Prognosezeitraums.');
    await page.getByRole('button', { name: '12 Monate' }).click();
    forecast = await getForecast('12m');
    expect(forecast.incomePauses).toMatchObject([
      {
        sourceId: sideIncomeId,
        coverage: 'applied',
        suppressedOccurrences: [{ dueDate: '2027-06-15', amountCents: 220_000 }],
        verdictSuppressedOccurrences: [],
      },
    ]);
    await expect(page.getByTestId('liq-legend')).toContainText('Prognose mit Einkommenspausen');
    await expect(page.getByTestId('liq-low-context')).toContainText(
      'Tiefpunkt mit Einkommenspausen',
    );
    await expect(page.getByTestId('liq-verdict')).not.toContainText('Einkommenspause');

    const verdictOnlyPause = await page.request.post('/api/liquidity/income-pauses', {
      headers: { origin },
      data: { sourceId: sideIncomeId, startDate: '2027-02-15', endDate: '2027-02-15' },
    });
    expect(verdictOnlyPause.status(), await verdictOnlyPause.text()).toBe(201);
    await page.getByRole('button', { name: '90 Tage' }).click();
    forecast = await getForecast('90d');
    expect(forecast.incomePauses).toHaveLength(2);
    expect(forecast.incomePauses).toMatchObject([
      {
        sourceId: sideIncomeId,
        startDate: '2027-02-15',
        endDate: '2027-02-15',
        coverage: 'outside_horizon',
        suppressedOccurrences: [],
        verdictSuppressedOccurrences: [{ dueDate: '2027-02-15', amountCents: 220_000 }],
      },
      {
        sourceId: sideIncomeId,
        startDate: '2027-06-15',
        endDate: '2027-06-15',
        coverage: 'outside_horizon',
        suppressedOccurrences: [],
        verdictSuppressedOccurrences: [],
      },
    ]);
    await expect(page.getByTestId('liq-scenario-basis')).toContainText(
      'Der 6-Monats-Tiefpunkt berücksichtigt',
    );
    await expect(page.getByTestId('liq-low-context')).toContainText('Tiefpunkt im Grundplan');
    await expect(page.getByTestId('liq-verdict')).toContainText('Einkommenspause');
    await expect(page.getByTestId('liq-legend')).not.toContainText('Prognose mit Einkommenspausen');
    await expect(pauseCard).toContainText(
      'Außerhalb des Diagrammzeitraums; wirkt auf den 6-Monats-Tiefpunkt.',
    );
    await expect(pauseCard).toContainText('15.02.2027 · 2.200,00 € Einnahme ausgesetzt');

    const deletedSourceId = await createPayment(
      `Synthetic deleted source ${info.project.name}`,
      'income-side',
      12_345,
    );
    const stalePause = await page.request.post('/api/liquidity/income-pauses', {
      headers: { origin },
      data: { sourceId: deletedSourceId, startDate: '2026-10-15', endDate: '2026-10-15' },
    });
    expect(stalePause.status(), await stalePause.text()).toBe(201);
    const removedSource = await page.request.delete(`/api/expected/${deletedSourceId}`, {
      headers: { origin },
    });
    expect(removedSource.status(), await removedSource.text()).toBe(200);
    await page.reload();
    await expect(pauseCard).toContainText(`Synthetic deleted source ${info.project.name}`);
    await expect(pauseCard).toContainText('Quelle gelöscht');
  },
);
