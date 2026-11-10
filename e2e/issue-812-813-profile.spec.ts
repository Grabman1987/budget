import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Synthetic profile; the API always returns the (empty) risk and family answers (#812/#813). */
const empty = () => ({
  name: '',
  initials: '',
  birthDate: '',
  household: null as number | null,
  region: null as string | null,
  risk: {
    horizon: null as string | null,
    liquidity: null as string | null,
    reserve: null as string | null,
    income: null as string | null,
    lossReaction: null as string | null,
    acceptableLoss: null as string | null,
  },
  family: {
    partnership: null as string | null,
    partnerIncome: null as string | null,
    dependants: null as number | null,
    children: null as number | null,
    support: null as string | null,
  },
});

/** In-memory stand-in for /api/profile (PATCH merge, one undo step) and /api/undo. */
async function mockProfile(page: Page) {
  const state = { saved: empty(), previous: empty(), patches: 0 };
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Partial<ReturnType<typeof empty>>;
      state.patches += 1;
      state.previous = structuredClone(state.saved);
      state.saved = {
        ...state.saved,
        ...body,
        risk: { ...state.saved.risk, ...body.risk },
        family: { ...state.saved.family, ...body.family },
      };
      await route.fulfill({ json: { ...state.saved, groupId: `g${state.patches}` } });
    } else await route.fulfill({ json: state.saved });
  });
  await page.route('**/api/undo', async (route) => {
    state.saved = structuredClone(state.previous);
    await route.fulfill({ json: { groupId: 'u1' } });
  });
  return state;
}

const redesignOn = async (page: Page) =>
  (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';

const saveButton = (page: Page) =>
  page
    .locator('section[aria-labelledby="profile-title"]')
    .getByRole('button', { name: 'Speichern', exact: true });

async function openProfile(page: Page) {
  await page.goto('/einstellungen/profil');
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
  await expect(page.getByLabel('Anlagehorizont', { exact: true })).toBeVisible();
}

async function axeClean(page: Page) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
  }
}

test('812/813 risk and family answers save, survive a reload and can be undone', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const state = await mockProfile(page);
  await openProfile(page);
  await expect(saveButton(page)).toBeDisabled();

  await page.getByLabel('Anlagehorizont', { exact: true }).selectOption('gt15');
  await page.getByLabel('Reaktion auf Kursverluste', { exact: true }).selectOption('hold');
  await page.getByLabel('Partnerschaft', { exact: true }).selectOption('partner');
  await page.getByLabel('Finanziell abhängige Personen', { exact: true }).selectOption('2');
  await page.getByLabel('Davon Kinder', { exact: true }).selectOption('1');
  await axeClean(page);
  await saveButton(page).click();
  await expect(page.getByText('Profil gespeichert.')).toBeVisible();
  expect(state.saved.risk).toMatchObject({ horizon: 'gt15', lossReaction: 'hold', income: null });
  expect(state.saved.family).toMatchObject({ partnership: 'partner', dependants: 2, children: 1 });

  await page.reload();
  await expect(page.getByLabel('Anlagehorizont', { exact: true })).toHaveValue('gt15');
  await expect(page.getByLabel('Reaktion auf Kursverluste', { exact: true })).toHaveValue('hold');
  await expect(page.getByLabel('Partnerschaft', { exact: true })).toHaveValue('partner');
  await expect(page.getByLabel('Finanziell abhängige Personen', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Davon Kinder', { exact: true })).toHaveValue('1');
  // Missing answers stay unknown instead of becoming a medium profile.
  await expect(page.getByText('Risikobereitschaft: unbekannt')).toBeVisible();

  // Undo (redesign toast action) restores the previous answers.
  if (!(await redesignOn(page))) return;
  await page.getByLabel('Anlagehorizont', { exact: true }).selectOption('7to15');
  await saveButton(page).click();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByLabel('Anlagehorizont', { exact: true })).toHaveValue('gt15');
});

test('812/813 a concurrent edit is reported and the draft is not overwritten', async ({ page }) => {
  const state = await mockProfile(page);
  await openProfile(page);
  test.skip(!(await redesignOn(page)), 'conflict protection of the form is part of the redesign');

  await page.getByLabel('Anlagehorizont', { exact: true }).selectOption('3to7');
  // Another session changes the profile before this draft is saved.
  state.saved.risk.reserve = 'gt6';
  await saveButton(page).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Das Profil wurde inzwischen geändert' }).first(),
  ).toBeVisible();
  expect(state.patches).toBe(0);
  await expect(page.getByLabel('Anlagehorizont', { exact: true })).toHaveValue('3to7');
  await expect(saveButton(page)).toBeDisabled();

  await page.getByRole('button', { name: 'Aktuellen Stand laden' }).click();
  await expect(page.getByLabel('Anlagehorizont', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Rücklage', { exact: true })).toHaveValue('gt6');
});

test('812/813 profile questions fit a 390px viewport without horizontal scroll', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mockProfile(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openProfile(page);
  await expect(page.getByLabel('Davon Kinder', { exact: true })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await axeClean(page);
});
