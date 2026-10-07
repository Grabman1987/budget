import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { sampleTest } from './sample';
import { openLedgerFilters } from './ledger-helpers';

const GROUPS = ['Budget-Konten', 'Kreditkarten', 'Kredite', 'Investments'];
const isPhone = (testInfo: { project: { name: string } }) => testInfo.project.name === 'mobile';

sampleTest(
  'accounts are grouped like YNAB in overview, chain, filter and sidebar',
  async ({ page }, testInfo) => {
    await page.goto('/konten');
    await expect(page.getByTestId('net-worth')).toBeVisible();
    await expect(page.locator('.kgroup .grp-title')).toHaveText(GROUPS);
    // The phone layout has no column header row.
    if (!isPhone(testInfo))
      await expect(page.getByRole('columnheader', { name: '90 Tage' })).toBeVisible();
    await expect(page.getByText('in 90 Tagen')).toBeVisible();
    const chain = page.getByRole('group', { name: 'Maßkette Nettovermögen nach Kontogruppen' });
    for (const label of GROUPS) await expect(chain.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText('Schulden', { exact: true })).toHaveCount(0);

    await page.goto('/konten/buchungen');
    await openLedgerFilters(page);
    const optgroups = page.getByLabel('Konto', { exact: true }).locator('optgroup');
    await expect(optgroups).toHaveCount(GROUPS.length);
    expect(await optgroups.evaluateAll((els) => els.map((el) => el.getAttribute('label')))).toEqual(
      GROUPS,
    );

    if (isPhone(testInfo)) return;
    await expect(page.locator('.acct-group-title')).toHaveText(GROUPS);
    // Card and loan balances stay ink with their minus (debt is not an alarm); an overdrawn budget or
    // investment balance is a red pill. Everything else is plain, unsigned text.
    await expect(page.locator('#acct-tree-cards .is-neg, #acct-tree-loans .is-neg')).toHaveCount(0);
    for (const text of await page.locator('.acct-tree .acct-amount.is-neg').allTextContents())
      expect(text).toMatch(/^[−-]/);
    const plain = page.locator(
      '#acct-tree-budget .acct-amount:not(.is-neg), #acct-tree-investments .acct-amount:not(.is-neg)',
    );
    for (const text of await plain.allTextContents()) expect(text).not.toMatch(/^[−-]/);
  },
);

test('Einstellungen › Profil fills name and initials in the shell', async ({ page }, testInfo) => {
  test.setTimeout(120_000); // two axe runs on a loaded machine
  let saved = { name: '', initials: '', birthDate: '', household: null, region: null };
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'PATCH') {
      saved = { ...saved, ...(route.request().postDataJSON() as object) };
      await route.fulfill({ json: { ...saved, groupId: 'g1' } });
    } else await route.fulfill({ json: saved });
  });
  await page.goto('/einstellungen/profil');
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
  await expect(page.getByText('Statistik Austria').first()).toBeVisible();
  const avatar = isPhone(testInfo) ? page.locator('.m-head .avatar') : page.locator('.profile');
  await expect(avatar).toContainText('NU');
  const save = page
    .locator('section[aria-labelledby="profile-title"]')
    .getByRole('button', { name: 'Speichern', exact: true });
  await expect(save).toBeDisabled();

  await page.getByLabel('Name', { exact: true }).fill('Beispiel Person');
  await expect(page.getByLabel('Kürzel')).toHaveValue('BP');
  await page.getByLabel('Geburtsdatum').fill('1985-04-12');
  await page.getByLabel('Personen im Haushalt').fill('3');
  await page.getByLabel('Region (Bundesland)').selectOption({ label: 'Wien' });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
  }
  await save.click();
  await expect(page.getByText('Profil gespeichert.')).toBeVisible();
  expect(saved).toMatchObject({
    name: 'Beispiel Person',
    initials: 'BP',
    birthDate: '1985-04-12',
    household: 3,
    region: 'AT-9',
  });
  await expect(avatar).toContainText('BP');
  if (!isPhone(testInfo)) await expect(avatar).toContainText('Beispiel Person');

  // A typed Kürzel is kept; an invalid birth date is refused before anything is sent.
  await page.getByLabel('Kürzel').fill('xy');
  await expect(page.getByLabel('Kürzel')).toHaveValue('XY');
  await page.getByLabel('Geburtsdatum').fill('2999-01-01');
  await save.click();
  await expect(page.getByText('Bitte ein gültiges Datum')).toBeVisible();
  await page.getByLabel('Geburtsdatum').fill('1985-04-12');
  await save.click();
  await expect(avatar).toContainText('XY');
});
