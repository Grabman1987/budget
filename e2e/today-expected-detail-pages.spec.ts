import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test, SAMPLE_URL } from './sample';
import type { Page } from '@playwright/test';

async function pageChecks(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  if (page.viewportSize()!.width === 390) {
    const targets = await page
      .locator('.heute-detail-nav a, .heute-breakdown a, .xp-detail-nav a, .xp-detail-body .btn')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { text: element.textContent, width: box.width, height: box.height };
        }),
      );
    expect(targets.filter((box) => box.width < 44 || box.height < 44)).toEqual([]);
  }
}

test('Today dimension links retain month and period, account links, and full-width secondary content', async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
  await page.goto('/?monat=2026-08&period=month');
  await expect(page.locator('.heute-answer')).toHaveCount(3);
  const secondary = await page.locator('.heute-next-steps').boundingBox();
  const main = await page.locator('.heute').boundingBox();
  expect(secondary && main && Math.abs(secondary.width - main.width) < 2).toBe(true);
  const trigger = page
    .getByRole('group', { name: 'Maßkette Nettovermögen' })
    .getByRole('button', { name: /^Liquidität/ });
  await trigger.press('Enter');
  await expect(page).toHaveURL(/\/heute\/details\/liquid\?monat=2026-08&period=month/);
  const url = page.url();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#dimension-title')).toBeFocused();
  await expect(
    page
      .getByRole('region', { name: 'Liquidität' })
      .getByRole('link', { name: 'Girokonto', exact: true }),
  ).toHaveAttribute('href', '/konten/acc-giro');
  await pageChecks(page);
  await page.screenshot({ path: info.outputPath('today-dimension-light.png'), fullPage: true });
  await page.goBack();
  await expect(page).toHaveURL(/\/\?monat=2026-08&period=month/);
  await page.goto(url);
  await page.emulateMedia({ colorScheme: 'dark' });
  await pageChecks(page);
  await page.screenshot({ path: info.outputPath('today-dimension-dark.png'), fullPage: true });
  await page.getByRole('link', { name: 'Zurück zu Heute' }).click();
  await expect(page).toHaveURL(/\/\?monat=2026-08&period=month/);
  await pageChecks(page);
  await page.screenshot({ path: info.outputPath('today-secondary-dark.png'), fullPage: true });
  await page.goto('/heute/details/unknown-synthetic-kind?monat=2026-08');
  await expect(page.locator('#dimension-title')).toHaveCount(0);
});

test('Expected income reuses the income body and restores list filters through every return path', async ({
  page,
}, info) => {
  await page.goto('/plan/erwartet?monat=2026-08');
  await page.getByRole('button', { name: 'Alle', exact: true }).first().click();
  await page.getByRole('button', { name: 'Einnahmen', exact: true }).click();
  await page.getByRole('button', { name: /Einnahmen im Detail/ }).click();
  await expect(page).toHaveURL(/\/plan\/erwartet\/einnahmen\?monat=2026-08&ansicht=all&art=inflow/);
  const url = page.url();
  await expect(page.getByTestId('income-received')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pageChecks(page);
  await page.screenshot({ path: info.outputPath('expected-income-light.png'), fullPage: true });
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Einnahmen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.xp-contracts')).toBeVisible();
  await page.goto(url);
  await page.getByRole('link', { name: 'Zurück zu Erwartet' }).click();
  await expect(page).toHaveURL(/\/plan\/erwartet\?monat=2026-08$/);
  await expect(page.getByRole('button', { name: 'Einnahmen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.xp-contracts')).toBeVisible();
  const create = page.getByRole('button', { name: 'Wiederkehrende Zahlung', exact: true });
  await create.click();
  const form = page.getByRole('dialog', { name: 'Wiederkehrende Zahlung anlegen' });
  await expect(form).toBeVisible();
  await expect(page.locator('dialog.panel[open]')).toHaveCount(0);
  await form.getByLabel('Name', { exact: true }).fill('Nicht speichern');
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await expect(create).toBeFocused();
  await create.click();
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('');
  await form.getByRole('button', { name: 'Abbrechen' }).click();
  await pageChecks(page);
});

test('payment details preserve single-occurrence skip, restore, undo and form cancellation without confirming bookings', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const name = `Detail ${info.project.name} ${Date.now().toString(36)}`;
  const response = await page.request.post('/api/expected', {
    headers: { origin: SAMPLE_URL },
    data: {
      name,
      kind: 'outflow',
      accountId: 'acc-giro',
      amountCents: 1234,
      rhythm: 'monthly',
      dueDay: 20,
      startDate: '2026-12-20',
    },
  });
  expect(response.ok()).toBe(true);
  const { payment } = await response.json();
  const refresh = await page.request.post('/api/expected/refresh', {
    data: {},
    headers: { origin: SAMPLE_URL },
  });
  expect(refresh.ok()).toBe(true);
  await page.goto(`/plan/erwartet/${payment.id}?monat=2026-08&ansicht=all&art=outflow`);
  const detail = page.locator('.xp-detail-body');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(detail.locator('input, select')).toHaveCount(0);
  await expect(detail.locator('[aria-labelledby="xp-versions"] .rev-act').first()).toBeHidden();
  const occurrence = detail.locator('.xp-occ li', { hasText: '20.12.2026' });
  await expect(occurrence).toContainText('erwartet');
  await occurrence.getByRole('button', { name: 'Streichen' }).click();
  await expect(occurrence).toContainText('gestrichen');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(occurrence).toContainText('erwartet');
  await occurrence.getByRole('button', { name: 'Streichen' }).click();
  await occurrence.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(occurrence).toContainText('erwartet');
  await expect(detail.locator('.xp-occ li', { hasText: '20.01.2027' })).toContainText('erwartet');
  const edit = page.getByRole('button', { name: 'Bearbeiten', exact: true });
  await edit.click();
  const form = page.getByRole('dialog', { name: 'Zahlung bearbeiten' });
  await form.getByLabel('Name', { exact: true }).fill('Verworfen');
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await edit.click();
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue(name);
  await form.getByRole('button', { name: 'Abbrechen' }).click();
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Zahlung löschen' })
    .getByRole('button', { name: 'Abbrechen' })
    .click();
  await expect(page.locator('#payment-title')).toHaveText(name);
  await page.reload();
  await expect(occurrence).toContainText('erwartet');
  await pageChecks(page);
  await page.screenshot({ path: info.outputPath('expected-payment-light.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await pageChecks(page);
  await page.screenshot({ path: info.outputPath('expected-payment-dark.png'), fullPage: true });
  await page.getByRole('link', { name: 'Zurück zu Erwartet' }).click();
  await expect(page.getByRole('button', { name: 'Ausgaben', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.xp-contracts')).toBeVisible();
  await page.locator('tr.prow', { hasText: name }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Zahlung löschen' })
    .getByRole('button', { name: 'Löschen bestätigen' })
    .click();
  await expect(page).toHaveURL(/\/plan\/erwartet\?monat=2026-08$/);
  await expect(page.getByRole('button', { name: 'Ausgaben', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.locator('tr.prow', { hasText: name })).toBeVisible();
});
