import { cents, formatEuro, type ExplorerResult } from '@budget/domain';
import { expect as baseExpect, sampleTest as test } from './sample';
import { inspectReport } from './overview-report';

// The sample server evaluates the rules synchronously (seconds) the first time a report finds the
// stored results stale, and every request waits for it: generous timeouts instead of retries.
const expect = baseExpect.configure({ timeout: 60_000 });
test.describe.configure({ timeout: 150_000 });

// Report 5.3 on the seeded sample server (17.09.2026, last full month August 2026).
const whole = (value: number) => formatEuro(cents(value), { cents: false }).replace(/\s*€$/, '');

const isExplorer = (r: { url(): string; status(): number }) =>
  new URL(r.url()).pathname === '/api/overview/explorer' && r.status() === 200;

test('Explorer pivots the booking splits and drills down to the bookings', async ({
  page,
}, info) => {
  const first = page.waitForResponse(isExplorer);
  await page.goto('/reports/explorer');
  const { result } = (await (await first).json()) as { result: ExplorerResult };
  expect(result.query).toMatchObject({
    dim: 'kategorie',
    cls: 'want',
    cols: 'quartal',
    period: '3J',
  });

  await expect(page.getByTestId('ex-rows')).toHaveText(`${result.rows.length} Zeilen`);
  const table = page.getByTestId('ex-table');
  await expect(table.locator('tbody tr')).toHaveCount(result.rows.length + (result.totals ? 1 : 0));
  await expect(table.locator('thead th')).toHaveCount(result.columns.length + 2);
  const top = result.rows[0]!;
  await expect(table.locator('tbody tr').first()).toContainText(top.label);
  await expect(table.locator('tbody tr').first()).toContainText(whole(top.total));
  await expect(table.locator('tr.is-total')).toContainText(whole(result.totals!.total));
  // A category row opens its bookings for the same window.
  const link = table.getByRole('link', { name: top.label });
  await expect(link).toHaveAttribute('href', /\/konten\/buchungen\?.*kategorie=.*bis=2026-08-31/);
  await expect(link).toHaveAttribute('href', /von=2023-10-01/);
  await inspectReport(page, info, 'explorer-wunsch');

  // Income types: Kapitalerträge stand apart, the class filter does not apply.
  const income = page.waitForResponse((r) => isExplorer(r) && r.url().includes('dim=einnahme'));
  await page.getByLabel('Zeilen').selectOption('einnahme');
  const incomeResult = ((await (await income).json()) as { result: ExplorerResult }).result;
  expect(incomeResult.rows.map((r) => r.label)).toContain('Kapitalerträge');
  await expect(page.getByLabel('Klasse')).toBeDisabled();
  await expect(table).toContainText('Kapitalerträge');
  await expect(table).toContainText('Gehalt');

  // Booking counts per recipient.
  const payees = page.waitForResponse((r) => isExplorer(r) && r.url().includes('meas=anzahl'));
  await page.getByRole('button', { name: 'Buchungen je Empfänger' }).click();
  const payeeResult = ((await (await payees).json()) as { result: ExplorerResult }).result;
  expect(payeeResult.unit).toBe('count');
  await expect(page.getByTestId('ex-rows')).toHaveText(`${payeeResult.rows.length} Zeilen`);
  await inspectReport(page, info, 'explorer-empfaenger');
});

test('Explorer saves, restores and deletes a view in this browser', async ({ page }) => {
  await page.goto('/reports/explorer');
  await expect(page.getByTestId('ex-table')).toBeVisible();
  await page.getByLabel('Spalten').selectOption('jahr');
  await page.getByLabel('Kennzahl').selectOption('avg');
  await page.getByLabel('Ansicht speichern').fill('Mein Schnitt');
  await page.getByRole('button', { name: 'Speichern' }).click();
  const chip = page.getByRole('button', { name: 'Mein Schnitt', exact: true });
  await expect(chip).toHaveAttribute('aria-pressed', 'true');

  // Another view is chosen, the saved one comes back with all five choices.
  await page.getByRole('button', { name: 'Gruppen je Monat' }).click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(page.getByLabel('Kennzahl')).toHaveValue('avg');
  await expect(page.getByLabel('Spalten')).toHaveValue('jahr');

  // It survives a reload and can be deleted.
  await page.reload();
  await expect(chip).toBeVisible();
  await page.getByRole('button', { name: 'Ansicht Mein Schnitt löschen' }).click();
  await expect(chip).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Gruppen je Monat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mein Schnitt', exact: true })).toHaveCount(0);
});

test('Explorer asks for a name before it saves', async ({ page }) => {
  await page.goto('/reports/explorer');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Bitte einen Namen für die Ansicht eingeben.')).toBeVisible();
});
