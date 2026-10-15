/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers of the API are read, not typed */
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Locator } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

/**
 * Einstellungen › Konten: accounts grouped like the sidebar, order, loan terms (read by the debt
 * calculator and the cost report), retype, close and reopen, each with "Rückgängig".
 */

async function post(request: APIRequestContext, origin: string, path: string, data: unknown) {
  const response = await request.post(`${origin}/api${path}`, { headers: { origin }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as Record<string, any>;
}

const names = async (list: Locator) => await list.locator('.accounts-name strong').allInnerTexts();

test('lists, orders, edits loan terms, closes and reopens accounts', async ({
  page,
  request,
  isolatedLedger,
  isMobile,
}) => {
  test.setTimeout(150_000);
  const origin = isolatedLedger.origin;
  const base = { openingDate: '2026-09-01' };
  await post(request, origin, '/accounts', {
    ...base,
    name: 'Alpha',
    type: 'checking',
    openingBalanceCents: 0,
  });
  await post(request, origin, '/accounts', {
    ...base,
    name: 'Bravo',
    type: 'checking',
    openingBalanceCents: 0,
  });
  const loan = (
    await post(request, origin, '/accounts', {
      ...base,
      name: 'Kredit Muster',
      type: 'loan',
      openingBalanceCents: -500_000,
      interestRateBp: 450,
    })
  ).account;

  await page.goto('/einstellungen/konten');
  await expect(page.getByRole('heading', { name: 'Konten', exact: true })).toBeVisible();
  // Desktop: the settings rail names the page; phone: the back bar does.
  if (isMobile) await expect(page.locator('.settings-here')).toHaveText('Konten');
  else await expect(page.getByRole('link', { name: 'Konten', exact: true }).first()).toBeVisible();
  const budget = page.getByRole('region', { name: /Budget-Konten/ });
  const loans = page.getByRole('region', { name: /Kredite/ });
  expect(await names(budget)).toEqual(['Alpha', 'Bravo']);
  await expect(loans).toContainText('Kredit Muster');
  await expect(loans).toContainText('4,50 %');

  // Order: one step down, "Rückgängig" brings the old order back.
  await page.getByRole('button', { name: 'Alpha nach unten' }).click();
  await expect(toast(page)).toContainText('Reihenfolge der Konten gespeichert.');
  await expect.poll(() => names(budget)).toEqual(['Bravo', 'Alpha']);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect.poll(() => names(budget)).toEqual(['Alpha', 'Bravo']);

  // Loan terms.
  await page.getByRole('button', { name: 'Kredit Muster bearbeiten' }).click();
  const panel = page.getByRole('dialog');
  await expect(
    panel.locator('.panel-head').getByRole('heading', { name: 'Konto bearbeiten' }),
  ).toBeVisible();
  await expect(panel).toHaveClass(/is-bare/);
  await expect(panel).not.toHaveClass(/\bpanel\b/);
  await panel.getByLabel('Zinsart').selectOption('fixed');
  await panel.getByLabel('Monatsrate', { exact: true }).fill('412');
  await panel.getByLabel('Ursprünglicher Kreditbetrag').fill('6000');
  await panel.getByLabel('Laufzeit ab').fill('2024-01-01');
  await panel.getByLabel('Laufzeit bis').fill('2034-01-01');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(toast(page)).toContainText('Konto „Kredit Muster“ gespeichert.');
  await expect(loans).toContainText('4,50 % fix');
  await expect(loans).toContainText('Rate 412,00 €');
  await page.reload();
  await expect(page.getByRole('region', { name: /Kredite/ })).toContainText('Rate 412,00 €');

  // The debt calculator reads the terms: rate, installment and the term line.
  await page.goto(`/vermoegen/schulden?kredit=${loan.id}`);
  await expect(page.getByTestId('loan-terms')).toContainText('Zins 4,50 % fix');
  await expect(page.getByTestId('loan-terms')).toContainText('Monatsrate 412,00 €');
  await expect(page.getByTestId('loan-terms')).toContainText('bis 01.01.2034');
  await expect(page.getByLabel('Monatsrate (EUR)', { exact: true })).toHaveValue('412,00');

  // Close an empty account, reopen it.
  await page.goto('/einstellungen/konten');
  await page.getByRole('button', { name: 'Bravo bearbeiten' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Konto schließen' }).click();
  await expect(toast(page)).toContainText('Konto „Bravo“ geschlossen.');
  const closed = page.getByRole('region', { name: /Geschlossene Konten/ });
  await expect(closed).toContainText('Bravo');
  await expect
    .poll(() => names(page.getByRole('region', { name: /Budget-Konten/ })))
    .toEqual(['Alpha']);
  await page.getByRole('button', { name: 'Bravo wieder öffnen' }).click();
  await expect(toast(page)).toContainText('Konto „Bravo“ wieder geöffnet.');
  await expect
    .poll(() => names(page.getByRole('region', { name: /Budget-Konten/ })))
    .toEqual(['Alpha', 'Bravo']);

  // Both themes: no serious accessibility violation, no horizontal scroll, touch targets.
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await expect(page.getByRole('heading', { name: 'Konten', exact: true })).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const path = test.info().outputPath(`accounts-settings-${scheme}.png`);
    await page.screenshot({ path, fullPage: true });
    await test.info().attach(`accounts settings ${scheme}`, { path, contentType: 'image/png' });
  }
});

test('refuses a term end before its start and keeps the stored terms', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const origin = isolatedLedger.origin;
  await post(request, origin, '/accounts', {
    name: 'Kredit Muster',
    type: 'loan',
    openingDate: '2026-09-01',
    openingBalanceCents: -100_000,
    termStart: '2026-01-01',
    termEnd: '2030-01-01',
  });
  await page.goto('/einstellungen/konten');
  await page.getByRole('button', { name: 'Kredit Muster bearbeiten' }).click();
  const panel = page.getByRole('dialog');
  await panel.getByLabel('Laufzeit bis').fill('2020-01-01');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(panel.getByText('Das Laufzeitende liegt vor dem Beginn.')).toBeVisible();
  await panel.getByRole('button', { name: 'Abbrechen' }).click();
  await page.getByRole('button', { name: 'Kredit Muster bearbeiten' }).click();
  await expect(page.getByRole('dialog').getByLabel('Laufzeit bis')).toHaveValue('01.01.2030');
});

test('creates a depot settlement link, clears it on retype, and restores it with undo', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  test.setTimeout(120_000);
  const origin = isolatedLedger.origin;
  const evidenceDir = resolve('docs/evidence/account-properties');
  mkdirSync(evidenceDir, { recursive: true });
  const evidenceStamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const inspectForm = async (name: string) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const axe = await new AxeBuilder({ page })
        .include('dialog[open]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        axe.violations.filter(
          (violation) => violation.impact === 'serious' || violation.impact === 'critical',
        ),
      ).toEqual([]);
      if (
        (name === 'create' && info.project.name === 'desktop' && scheme === 'light') ||
        (name === 'edit' && info.project.name === 'webkit-iphone' && scheme === 'dark')
      ) {
        const filename = `${name}-form-${info.project.name}-${scheme}-${evidenceStamp}.png`;
        const path = resolve(evidenceDir, filename);
        expect(existsSync(path)).toBe(false);
        await page.screenshot({ path, fullPage: true });
        await test.info().attach(filename, { path, contentType: 'image/png' });
      }
    }
  };
  const settlement = await post(request, origin, '/accounts', {
    name: 'Verrechnung Giro',
    type: 'checking',
    openingDate: '2026-09-01',
  });
  await page.goto('/einstellungen/konten');
  await page.getByRole('button', { name: 'Konto anlegen', exact: true }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Name').fill('Depot Eigenschaften');
  await create.getByLabel('Kontotyp').selectOption('brokerage');
  await create.getByLabel('Verrechnungskonto').selectOption(settlement.account.id);
  await inspectForm('create');
  await create.getByRole('button', { name: 'Konto anlegen', exact: true }).click();
  await expect(toast(page)).toContainText('Konto „Depot Eigenschaften“ angelegt.');
  await expect(toast(page)).toBeHidden({ timeout: 12_000 });

  const edit = page.getByRole('button', { name: 'Depot Eigenschaften bearbeiten' });
  await edit.click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByLabel('Verrechnungskonto')).toHaveValue(settlement.account.id);
  await inspectForm('edit');
  await panel.getByLabel('Kontotyp').selectOption('checking');
  await expect(panel.getByLabel('Verrechnungskonto')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(toast(page)).toContainText('Konto „Depot Eigenschaften“ gespeichert.');
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await edit.click();
  await expect(page.getByRole('dialog').getByLabel('Kontotyp')).toHaveValue('brokerage');
  await expect(page.getByRole('dialog').getByLabel('Verrechnungskonto')).toHaveValue(
    settlement.account.id,
  );
});
