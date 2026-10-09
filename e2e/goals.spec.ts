import AxeBuilder from '@axe-core/playwright';
import { expect, test as mainTest, type APIRequestContext, type Page } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';
import { sampleTest } from './sample';
import { expectScreenshot } from './visual';

/**
 * Plan › Sparziele. The sample server (17.09.2026, seeded ledger) shows the five fixture goals with
 * their needed rates; the main server takes create, edit, delete and undo. The saved amounts of the
 * fixture goals are the available money of their envelopes at the end of September 2026.
 */

const NEEDED = [
  // name, target, saved, needed monthly rate, line under the bar
  [
    'Weihnachten 2026',
    '800,00 €',
    '495,78 €',
    '101,41 €',
    'hinter Plan · 54,92 € je Monat mehr nötig',
  ],
  ['Haushaltsversicherung 2027', '486,00 €', '324,00 €', '40,50 €', 'im Plan · fertig Jän 2027'],
  [
    'Kfz-Service 2027',
    '580,00 €',
    '289,98 €',
    '48,34 €',
    'hinter Plan · 0,01 € je Monat mehr nötig',
  ],
  ['Neues Fahrrad', '1.200,00 €', '90,07 €', '158,57 €', 'im Plan · fertig Apr 2027'],
  ['Urlaub Sommer 2027', '3.000,00 €', '179,89 €', '282,02 €', 'im Plan · fertig Jul 2027'],
] as const;

const goalRow = (page: Page, name: string) => page.locator('tr.prow', { hasText: name });
const toast = (page: Page) => page.locator('.toast.is-open');
const serious = (violations: Array<{ impact?: string | null }>) =>
  violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

sampleTest('the five fixture goals show their needed rates for 17.09.2026', async ({ page }) => {
  await page.goto('/plan/sparziele');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('September 2026');
  await expect(page.getByRole('link', { name: 'Sparziele' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('goals-summary')).toHaveText('3 von 5 im Plan');
  await expect(page.locator('tr.prow')).toHaveCount(5);
  for (const [name, target, saved, needed, line] of NEEDED) {
    const row = goalRow(page, name);
    await expect(row.locator('.col-target')).toHaveText(target);
    await expect(row.locator('.col-saved')).toHaveText(saved);
    await expect(row.locator('.col-rate')).toHaveText(needed);
    await expect(row.getByTestId('goal-line')).toHaveText(line);
  }
  // Group sum "Offen": the needed rates add up.
  await expect(page.locator('tr.pgroup .col-rate')).toHaveText('630,84 €');
  // Soonest target date first.
  await expect(page.locator('tr.prow .goal-name').first()).toHaveText('Weihnachten 2026');
});

sampleTest('the detail of a goal: chain, figures, axe', async ({ page }) => {
  await page.goto('/plan/sparziele');
  await page.getByRole('link', { name: 'Urlaub Sommer 2027' }).click();
  const panel = page.locator('main');
  await expect(panel.getByRole('group', { name: 'Maßkette Sparziel' })).toContainText('2.820,11 €');
  await expect(panel).toContainText('Monate bis dahin');
  await expect(
    panel.getByRole('button', { name: 'Als Ziel der Kategorie übernehmen' }),
  ).toBeEnabled();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(serious(axe.violations)).toEqual([]);
});

sampleTest('adopting a goal as the envelope target is one undoable action', async ({ page }) => {
  await page.goto('/plan/sparziele');
  await page.getByRole('link', { name: 'Kfz-Service 2027' }).click();
  await page.getByRole('button', { name: 'Als Ziel der Kategorie übernehmen' }).click();
  await expect(toast(page)).toContainText('Kfz-Service: Ziel 580,00 € übernommen');
  const adopted = () =>
    page.evaluate(async () => {
      const res = await fetch('/api/categories');
      const tree = (await res.json()) as {
        targets: Array<{
          categoryId: string;
          kind: string;
          amountCents: number;
          validFrom: string;
        }>;
      };
      return tree.targets.find(
        (t) => t.categoryId === 'cat-kfzservice' && t.validFrom === '2026-09',
      );
    });
  expect(await adopted()).toMatchObject({ kind: 'by_date', amountCents: 58_000 });
  // The sample server is shared: take it back.
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(toast(page)).toContainText('Rückgängig gemacht');
  expect(await adopted()).toBeUndefined();
});

for (const scheme of ['light', 'dark'] as const) {
  sampleTest.describe(`look, ${scheme}`, () => {
    sampleTest.use({ colorScheme: scheme });
    sampleTest(`baseline and axe in the ${scheme} theme`, async ({ page }) => {
      await page.goto('/plan/sparziele');
      await expect(page.getByTestId('goals-summary')).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(serious(axe.violations)).toEqual([]);
      await expectScreenshot(page, `sparziele-${scheme}.png`, { fullPage: true });
    });
  });
}

// ---------- main server: create, edit, delete, undo ----------

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());

async function post(request: APIRequestContext, path: string, data: unknown) {
  const res = await request.post(`/api${path}`, { data, headers: { origin: MAIN_URL } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as Record<string, { id: string }>;
}

mainTest('goals: create, edit, delete and undo', async ({ page }, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now().toString(36).slice(-5)}`;
  const group = (await post(page.request, '/categories/groups', { name: `Sparen ${tag}` }))[
    'group'
  ]!;
  await post(page.request, '/categories', {
    name: `Rücklage ${tag}`,
    groupId: group.id,
    class: 'want',
    kind: 'saving',
    stage: 7,
  });
  const name = `Sofa ${tag}`;
  const year = Number(today.slice(0, 4)) + 1;

  await page.goto('/plan/sparziele');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Create: the form says what is missing, then takes arithmetic in the target.
  await page.getByRole('button', { name: 'Neues Sparziel' }).first().click();
  const panel = page.getByRole('dialog', { name: 'Neues Sparziel' });
  await panel.getByRole('button', { name: 'Anlegen' }).click();
  await expect(panel.getByText('Bitte einen Namen eintragen.')).toBeVisible();
  await panel.getByLabel('Name').fill(name);
  await panel.getByLabel('Ziel', { exact: true }).fill('600+400');
  await panel.getByLabel('Zieldatum').fill(`${year}-06-30`);
  await panel.getByLabel('Kategorie', { exact: true }).selectOption({ label: `Rücklage ${tag}` });
  await panel.getByRole('button', { name: 'Anlegen' }).click();
  await expect(toast(page)).toContainText(`Sparziel „${name}“ angelegt`);
  const row = goalRow(page, name);
  await expect(row.locator('.col-target')).toHaveText('1.000,00 €');
  await expect(row.locator('.col-saved')).toHaveText('0,00 €');
  await expect(row.locator('.col-date')).toHaveText(`30.06.${year}`);
  await expect(row.getByTestId('goal-line')).toContainText('hinter Plan');

  // Edit the target; the needed rate follows.
  const rateBefore = await row.locator('.col-rate').innerText();
  await row.getByRole('link', { name }).click();
  await page.getByRole('button', { name: 'Sparziel bearbeiten', exact: true }).click();
  const edit = page.getByRole('dialog', { name });
  await edit.getByLabel('Ziel', { exact: true }).fill('2000');
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(toast(page)).toContainText(`${name} geändert`);
  await page.getByRole('link', { name: 'Zurück zu Sparzielen' }).click();
  await expect(row.locator('.col-target')).toHaveText('2.000,00 €');
  await expect(row.locator('.col-rate')).not.toHaveText(rateBefore);

  // Delete, then undo from the toast.
  await row.getByRole('link', { name }).click();
  await page.getByRole('button', { name: 'Sparziel bearbeiten', exact: true }).click();
  await page.getByRole('dialog', { name }).getByRole('button', { name: 'Löschen' }).click();
  await expect(toast(page)).toContainText(`Sparziel „${name}“ gelöscht`);
  await page.getByRole('link', { name: 'Zurück zu Sparzielen' }).click();
  await expect(row).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row).toHaveCount(1);
  await expect(row.locator('.col-target')).toHaveText('2.000,00 €');

  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});
