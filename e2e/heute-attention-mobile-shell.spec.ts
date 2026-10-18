import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect as baseExpect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';

const expect = baseExpect.configure({ timeout: 30_000 });

test('Today groups work, preserves its review destinations and distinguishes selected month from today', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
  await page.goto('/?monat=2026-09');
  const tasks = page.getByRole('region', { name: 'Zu tun', exact: true });
  await expect(tasks).toBeVisible();
  // #613 (owner decision #527 V05/V16): the sample loan lacks terms, so a fifth row asks for them.
  await expect(tasks.locator('.attention-row')).toHaveCount(5);
  await expect(tasks).toContainText('Kreditkonditionen fehlen');
  await expect(tasks).toContainText('8 Konten warten auf Prüfung');
  await expect(tasks.getByRole('link', { name: 'Kontostand prüfen' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nächste Schritte' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fällig 14 Tage', exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /Danach/ })).toHaveCount(0);
  await expect(page.locator('.heute-finance-check .heute-rule')).toHaveCount(0);
  if (info.project.name !== 'desktop') await tasks.scrollIntoViewIfNeeded();

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    const targets = await page
      .locator(
        '.heute-attention a, .heute-finance-check a, .heute-upcoming a, .heute-upcoming button',
      )
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      );
    expect(targets.filter((box) => box.width < 44 || box.height < 44)).toEqual([]);
    const dir = 'docs/evidence/heute-attention-q3';
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: `${dir}/${info.project.name}-${theme}.png`,
      fullPage: false,
      animations: 'disabled',
    });
  }
  if (info.project.name === 'desktop') {
    const box = await tasks.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(900);
  }
  await tasks.getByRole('link', { name: 'Prüfen', exact: true }).click();
  await expect(page).toHaveURL(/\/konten\/pruefen#account-reminder-title$/);
  const reminder = page.locator('.account-reminder').first();
  await reminder.getByRole('link', { name: 'Kontostand prüfen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Kontostand prüfen/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/?monat=2026-08&period=month');
  const note = page.getByTestId('heute-month-note');
  await expect(note).toContainText('Ansicht: August 2026');
  await expect(note).not.toContainText('Pace');
  await expect(page.locator('.heute-answers')).toContainText('Stand heute · 17.09.2026');
  await expect(tasks).toContainText('Stand heute · 17.09.2026');
  await expect(page.locator('.heute-finance-check')).toContainText('Stand heute · 17.09.2026');
  await expect(page.getByRole('heading', { name: 'August 2026 · Pace' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Monat', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Bis Gehalt', exact: true })).toBeDisabled();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await note.getByRole('button', { name: 'Zum aktuellen Monat' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await note.getByRole('button', { name: 'Zum aktuellen Monat' }).click();
  await expect(page.getByRole('heading', { name: 'September 2026', exact: true })).toBeVisible();
  await expect(note).toHaveCount(0);
});

test('empty tasks and due dates disappear while missing rule inputs remain explicit', async ({
  page,
}) => {
  const data: Heute = await (await page.request.get('/api/heute?month=2026-09')).json();
  data.accountReminders = [];
  data.attention = { inboxCount: 0, pendingCount: 0, pendingBefore: '2026-09-10' };
  data.nextSteps = { items: [], count: 0 };
  data.upcoming14 = [];
  data.upcomingEvents = [];
  data.financeCheck = {
    counts: { ok: 0, warn: 0, bad: 0, total: 3, notEvaluated: 3 },
    keyRules: [],
    actionRules: [],
  };
  await page.route('**/api/heute?*', (route) => route.fulfill({ json: data }));
  await page.goto('/?monat=2026-09');
  await expect(page.locator('[data-kennzahl="verfuegbar"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Zu tun' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Fällig 14 Tage' })).toHaveCount(0);
  await expect(page.locator('.heute-finance-check')).toContainText('3 nicht auswertbar');
  await expect(page.getByRole('link', { name: 'Fehlende Angaben ansehen' })).toBeVisible();
});
