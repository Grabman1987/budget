import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

/**
 * #1055: guided "Geld verteilen" from Plan › Monat on an isolated synthetic ledger. Runs in the
 * desktop (1440 px) and mobile (390 px) projects; no screenshot assertions.
 */
test.use({ ledgerToday: '2026-10-15' });

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

    // Resume after a reload: same step, completed assignment preserved.
    await page.reload();
    await expect(title).toHaveText('3. Zuweisen');
    await expect(flow.getByTestId('distribute-fill').getByRole('listitem')).toHaveCount(1);
    await flow.getByRole('button', { name: 'Alle nach Plan zuweisen · 150,00 €' }).click();
    await expect(flow.getByTestId('distribute-tba')).toHaveText('550,00 €');

    await flow.getByRole('button', { name: /^Weiter:/ }).click();
    await expect(title).toHaveText('4. Rest und Zusammenfassung');
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
  });
}
