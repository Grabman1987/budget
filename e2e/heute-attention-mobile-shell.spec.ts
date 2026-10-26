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
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.goto('/?monat=2026-09');
  const tasks = page.getByRole('region', { name: 'Zu tun', exact: true });
  await expect(tasks).toBeVisible();
  // Q3 #466 and #511: loan terms share the account-check source row.
  await expect(tasks.locator(':scope > .attention-row')).toHaveCount(4);
  await expect(tasks.locator('.attention-row')).toHaveCount(5);
  await expect(tasks.locator('.attention-remaining summary')).toContainText('Weitere 1 Aufgaben');
  await tasks.locator('.attention-remaining summary').click();
  await expect(tasks.getByRole('link', { name: 'Monatsabschluss öffnen' })).toHaveAttribute(
    'href',
    '/monatsabschluss/2026-08',
  );
  const accounts = tasks
    .locator('.attention-row')
    .filter({ hasText: '8 Konten warten auf Prüfung' });
  await expect(accounts).toHaveCount(1);
  await expect(accounts).toContainText('Kreditkonditionen fehlen');
  await expect(accounts.getByRole('link', { name: 'Prüfen', exact: true })).toHaveCount(1);
  await expect(
    accounts.getByRole('link', { name: 'Konditionen ergänzen', exact: true }),
  ).toHaveAttribute('href', '/einstellungen/konten');
  await expect(tasks).toContainText('Kreditkonditionen fehlen');
  await expect(tasks).toContainText('8 Konten warten auf Prüfung');
  await expect(tasks.getByRole('link', { name: 'Kontostand prüfen' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Angepinnte Kategorien' })).toHaveCount(0);
  await page.getByText('Ansicht anpassen', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Angepinnte Kategorien anzeigen' }).check();
  await expect(page.getByRole('heading', { name: 'Angepinnte Kategorien' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Angepinnte Kategorien' })).toBeVisible();
  expect(writes).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Nächste Schritte' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fällig 14 Tage', exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /Danach/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Finanz-Check', exact: true })).toHaveCount(0);
  if (info.project.name !== 'desktop') await tasks.scrollIntoViewIfNeeded();

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    const targets = await page
      .locator(
        '.heute-attention a, .heute-attention summary, .heute-upcoming a, .heute-upcoming button, .heute-view-preferences summary, .heute-view-preferences label',
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
  const wealth = await page.locator('.heute-wealth-line').boundingBox();
  const box = await tasks.boundingBox();
  const due = await page.locator('#heute-upcoming-title').boundingBox();
  const recent = await page.locator('#heute-bookings-title').boundingBox();
  expect(box!.y).toBeGreaterThan(wealth!.y);
  expect(box!.y + box!.height).toBeLessThan(due!.y);
  expect(due!.y).toBeLessThan(recent!.y);
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
  await expect(page.locator('.heute-wealth-line')).toContainText('Stand heute · 17.09.2026');
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
  data.attention = {
    inboxCount: 0,
    pendingCount: 0,
    pendingBefore: '2026-09-10',
    loanTermsMissing: false,
    quoteReview: { count: 0, securityIds: [] },
    monthCloseTasks: { tasks: [], unavailable: [] },
  };
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
  const taskBlock = page.getByRole('region', { name: 'Zu tun' });
  await expect(taskBlock.locator('.attention-row')).toHaveCount(0);
  await expect(taskBlock.locator('.attention-availability')).toContainText(
    '3 Regeln konnten nicht ausgewertet werden.',
  );
  await expect(page.getByRole('region', { name: 'Fällig 14 Tage' })).toHaveCount(0);
  await expect(
    taskBlock.getByRole('link', { name: 'Regeln prüfen', includeHidden: true }),
  ).toHaveAttribute('href', '/einstellungen/regelwerk');
  if ('unavailable' in data.financeCheck) throw new Error('Expected evaluated synthetic rules');
  data.financeCheck.counts.notEvaluated = 0;
  await page.reload();
  await expect(page.getByRole('region', { name: 'Zu tun' })).toHaveCount(0);
});
