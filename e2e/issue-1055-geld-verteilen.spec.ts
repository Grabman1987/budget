import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

/**
 * #1055: guided "Geld verteilen" from Plan › Monat on an isolated synthetic ledger. Runs in the
 * desktop (1440 px) and mobile (390 px) projects; no screenshot assertions.
 */
test.use({ ledgerToday: '2026-10-15' });

test('a stale assignment with an empty rebuilt plan dismisses its alert without another write', async ({
  page,
  request,
  baseURL,
}) => {
  const send = async (path: string, data: unknown, method = 'POST') => {
    const response = await request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await send('/accounts', {
    name: 'Synthetic cash',
    type: 'cash',
    openingDate: '2026-10-01',
    openingBalanceCents: 10000,
  });
  const { group } = await send('/categories/groups', { name: 'Synthetic group' });
  const { category } = await send('/categories', {
    name: 'Synthetic target',
    groupId: group.id,
    class: 'need',
    kind: 'variable',
    stage: 1,
  });
  await send(
    `/categories/${category.id}/target`,
    { validFrom: '2026-10', target: { kind: 'monthly', amountCents: 10000 } },
    'PUT',
  );
  await page.goto('/plan/monat?monat=2026-10&ablauf=verteilen');
  const flow = page.getByTestId('distribute-flow');
  await flow.getByRole('button', { name: /^Weiter:/ }).click();
  await flow.getByRole('button', { name: /^Weiter:/ }).click();
  // Another session uses all available money after this page received its preview basis.
  await send(
    '/budget/2026-10/assigned',
    { items: [{ categoryId: category.id, assignedCents: 10000 }] },
    'PUT',
  );
  const conflict = page.waitForResponse(
    (response) => response.url().endsWith('/budget/2026-10/assigned') && response.status() === 409,
  );
  await flow.getByRole('button', { name: 'Alle nach Plan zuweisen · 100,00 €' }).click();
  await conflict;
  await expect(flow.getByTestId('distribute-nothing')).toBeVisible();
  await flow.getByRole('alert').getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(flow.getByRole('alert')).toHaveCount(0);
  await expect(flow.getByTestId('distribute-tba')).toHaveText('0,00 €');
  await flow.getByRole('button', { name: /^Weiter:/ }).click();
  await expect(flow.getByTestId('distribute-summary').locator('div').first()).toHaveText(
    'In diesem Durchgang zugewiesen0,00 €',
  );
  const after = await request.get('/api/budget/2026-10');
  expect(after.ok()).toBe(true);
  expect((await after.json()).summary.assignedCents).toBe(10000);
});

for (const theme of ['light', 'dark'] as const) {
  test(`guided distribution assigns, resumes and summarizes (${theme})`, async ({
    page,
    request,
    baseURL,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    const send = async (path: string, data: unknown, method = 'POST') => {
      const response = await request.fetch(`/api${path}`, {
        method,
        data,
        headers: { origin: baseURL! },
      });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    await send('/accounts', {
      name: 'Synthetic cash',
      type: 'cash',
      openingDate: '2026-10-01',
      openingBalanceCents: 100000,
    });
    const { group } = await send('/categories/groups', { name: 'Synthetic group' });
    for (const [name, stage, amountCents] of [
      ['Synthetic rent', 1, 30000],
      ['Synthetic food', 2, 15000],
    ] as const) {
      const { category } = await send('/categories', {
        name,
        groupId: group.id,
        class: 'need',
        kind: 'variable',
        stage,
      });
      await send(
        `/categories/${category.id}/target`,
        { validFrom: '2026-10', target: { kind: 'monthly', amountCents } },
        'PUT',
      );
    }

    await page.goto('/plan/monat?monat=2026-10');
    await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
    await expect(page.getByTestId('to-be-assigned')).toHaveText('1.000,00 €');
    // An invalid older pass must not prevent this pass from being saved or cleared.
    await page.evaluate(() => {
      sessionStorage.setItem(
        'budget.geld-verteilen.2026-10',
        JSON.stringify({ month: '2026-10', startedAt: 'invalid-marker' }),
      );
    });
    await page.getByRole('button', { name: 'Geld verteilen', exact: true }).click();
    await page.getByRole('button', { name: 'Schritt für Schritt verteilen' }).click();
    await expect(page).toHaveURL(/ablauf=verteilen/);

    const flow = page.getByTestId('distribute-flow');
    const title = flow.locator('#distribute-step-title');
    await expect(title).toHaveText('1. Eingang prüfen');
    await expect(flow.getByTestId('distribute-tba')).toHaveText('1.000,00 €');
    await expect(flow.getByText(/nie als verfügbares Geld verteilt/)).toBeVisible();
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);

    await flow.getByRole('button', { name: /^Weiter:/ }).click();
    await expect(title).toHaveText('2. Lücken');
    await expect(title).toBeFocused();
    await expect(flow.getByTestId('distribute-underfunded').getByRole('listitem')).toHaveText([
      /Synthetic rent.*fehlt 300,00 €/,
      /Synthetic food.*fehlt 150,00 €/,
    ]);

    await flow.getByRole('button', { name: /^Weiter:/ }).click();
    await expect(title).toHaveText('3. Zuweisen');
    await flow.getByRole('button', { name: '300,00 € an Synthetic rent zuweisen' }).click();
    await expect(flow.getByTestId('distribute-tba')).toHaveText('700,00 €');
    await expect(flow.getByRole('button', { name: 'Letzte Änderung rückgängig' })).toBeVisible();

    // Model a reload before the write response was recorded; the read model already has it.
    await page.evaluate(() => {
      const key = 'budget.geld-verteilen.2026-10';
      const saved = JSON.parse(sessionStorage.getItem(key)!);
      saved.log[0].pending = true;
      delete saved.log[0].groupId;
      sessionStorage.setItem(key, JSON.stringify(saved));
    });
    // Resume after a reload: same step, assignment preserved and labelled as reconciled.
    await page.reload();
    await expect(title).toHaveText('3. Zuweisen');
    await expect(flow.getByTestId('distribute-fill').getByRole('listitem')).toHaveCount(1);
    await flow.getByRole('button', { name: 'Alle nach Plan zuweisen · 150,00 €' }).click();
    await expect(flow.getByTestId('distribute-tba')).toHaveText('550,00 €');

    await flow.getByRole('button', { name: /^Weiter:/ }).click();
    await expect(title).toHaveText('4. Rest und Zusammenfassung');
    await expect(
      flow.getByText('Synthetic rent: 300,00 € zugewiesen (nach Neuladen abgeglichen)'),
    ).toBeVisible();
    await expect(flow.getByTestId('distribute-summary').locator('div')).toHaveText([
      'In diesem Durchgang zugewiesen450,00 €',
      'Zu verteilen jetzt550,00 €',
      'Noch unterfinanziertnichts',
      'Noch überzogennichts',
    ]);
    const width = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(width[0]).toBeLessThanOrEqual(width[1]!);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);

    await flow.getByRole('button', { name: 'Zurück zum Plan' }).click();
    await expect(page).not.toHaveURL(/ablauf=/);
    await expect(page.getByTestId('to-be-assigned')).toHaveText('550,00 €');
    expect(
      await page.evaluate(() => sessionStorage.getItem('budget.geld-verteilen.2026-10')),
    ).toBeNull();
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Heute links positive and negative assignments directly to distribution (${theme})`, async ({
    page,
    request,
    baseURL,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    const send = async (path: string, data: unknown, method = 'POST') => {
      const response = await request.fetch(`/api${path}`, {
        method,
        data,
        headers: { origin: baseURL! },
      });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    await send('/accounts', {
      name: 'Synthetic cash',
      type: 'cash',
      openingDate: '2026-10-01',
      openingBalanceCents: 10_000,
    });
    const { group } = await send('/categories/groups', { name: 'Synthetic group' });
    const { category } = await send('/categories', {
      name: 'Synthetic target',
      groupId: group.id,
      class: 'need',
      kind: 'variable',
      stage: 1,
    });
    const today = '/?monat=2026-10&period=month';
    const tba = page.locator('.hv-tasks [data-kennzahl="zu-verteilen"]');
    const link = page.locator('.hv-tasks').getByRole('link', { name: 'Verteilen →', exact: true });
    for (const [assignedCents, amount] of [
      [0, '100,00 €'],
      [10_500, '−5,00 €'],
    ] as const) {
      await send(
        '/budget/2026-10/assigned',
        { items: [{ categoryId: category.id, assignedCents }] },
        'PUT',
      );
      await page.goto(today);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(tba).toHaveText(amount);
      await expect(link).toHaveAttribute('href', /ablauf=verteilen/);
      await link.click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === '/plan/monat' &&
          url.searchParams.get('monat') === '2026-10' &&
          url.searchParams.get('ablauf') === 'verteilen',
      );
      const flow = page.getByTestId('distribute-flow');
      await expect(flow.locator('#distribute-step-title')).toHaveText('1. Eingang prüfen');
      await expect(flow.getByTestId('distribute-tba')).toHaveText(amount);
    }
    await send(
      '/budget/2026-10/assigned',
      {
        items: [{ categoryId: category.id, assignedCents: 10_000 }],
      },
      'PUT',
    );
    await page.goto(today);
    await expect(page.locator('.hv-tasks')).toContainText('Als Nächstes');
    await expect(link).toHaveCount(0);
    await expect(page.locator('a[href*="ablauf=verteilen"]')).toHaveCount(0);
    const response = await request.get('/api/budget/2026-10');
    expect(response.ok()).toBe(true);
    expect((await response.json()).summary.toBeAssignedCents).toBe(0);
  });
}

test('historical templates preview, edit, assign and undo as one group', async ({
  page,
  request,
  baseURL,
}) => {
  const send = async (path: string, data: unknown, method = 'POST') => {
    const response = await request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await send('/accounts', {
    name: 'Synthetic cash',
    type: 'cash',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const { group } = await send('/categories/groups', { name: 'Synthetic templates' });
  const { category } = await send('/categories', {
    name: 'Synthetic history',
    groupId: group.id,
    class: 'need',
    kind: 'variable',
    stage: 1,
  });
  await send(
    '/budget/2026-09/assigned',
    { items: [{ categoryId: category.id, assignedCents: 701 }] },
    'PUT',
  );
  await page.goto('/plan/monat?monat=2026-10&ablauf=verteilen');
  const flow = page.getByTestId('distribute-flow');
  await flow.getByRole('button', { name: /^Weiter:/ }).click();
  await flow.getByRole('button', { name: /^Weiter:/ }).click();
  await flow.getByRole('button', { name: 'Wie letzter Monat', exact: true }).click();
  const amount = flow.getByRole('textbox', { name: 'Synthetic history · Zugewiesen' });
  await expect(amount).toHaveValue('7,01');
  const before = await request.get('/api/budget/2026-10');
  expect((await before.json()).summary.assignedCents).toBe(0);
  await amount.fill('100,01');
  await expect(flow.getByText(/du verplanst mehr, als da ist/)).toBeVisible();
  await amount.fill('8,03');
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await flow.getByRole('button', { name: 'Vorlage zuweisen' }).click();
  await expect(flow.getByTestId('distribute-tba')).toHaveText('84,96 €');
  await flow.getByRole('button', { name: 'Letzte Änderung rückgängig' }).click();
  await expect(flow.getByTestId('distribute-tba')).toHaveText('92,99 €');
  const after = await request.get('/api/budget/2026-10');
  expect((await after.json()).summary.assignedCents).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
