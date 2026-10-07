import { sampleTest as test, expect as baseExpect } from './sample';
import { test as isolatedTest } from './isolated-ledger';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import type { Heute } from '../apps/web/src/heute/api';

const expect = baseExpect.configure({ timeout: 15_000 });

test('UX-2 sample evidence: Heute and Plan', async ({ page }, info) => {
  test.setTimeout(60_000);
  const phase = process.env['UX_CAPTURE_BEFORE'] ? 'before' : 'after';
  const dir = 'docs/evidence/ux-distill-1005';
  mkdirSync(dir, { recursive: true });
  for (const [name, path] of [
    ['heute', '/?monat=2026-09'],
    ['plan', '/plan/monat?monat=2026-09'],
  ] as const) {
    await page.goto(path);
    if (name === 'heute') await expect(page.getByTestId('heute-lead-value')).toBeVisible();
    else await expect(page.locator('.ptable')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${dir}/${phase}-${name}-${info.project.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
});

test('Heute keeps its device fold choice and the primary order, net worth matches Vermögen', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.goto('/?monat=2026-09');
  await expect(page.getByRole('heading', { name: 'Budget', exact: true })).toBeVisible();
  const fold = page.getByRole('button', { name: 'Mehr zum Monat' });
  const initiallyOpen = info.project.name === 'desktop';
  await expect(fold).toHaveAttribute('aria-expanded', String(initiallyOpen));
  const boxes = await Promise.all(
    [
      '.heute-answers',
      '.heute-attention',
      '.heute-lead',
      '.heute-pace',
      '#heute-upcoming-title',
      '.heute-wealth-line',
      '.heute-more',
    ].map((selector) => page.locator(selector).boundingBox()),
  );
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y);
  const today: Heute = await (await page.request.get('/api/heute')).json();
  const wealth = await (await page.request.get('/api/wealth/networth?period=1J')).json();
  if ('unavailable' in today.netWorth) throw new Error('Synthetic net worth unavailable');
  expect(today.netWorth.totalCents).toBe(wealth.chain.nowCents);
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', String(!initiallyOpen));
  await page.reload();
  await expect(fold).toHaveAttribute('aria-expanded', String(!initiallyOpen));
  await page.setViewportSize(
    initiallyOpen ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  );
  await expect(fold).toHaveAttribute('aria-expanded', String(!initiallyOpen));
  await page.setViewportSize(
    initiallyOpen ? { width: 1440, height: 900 } : { width: 390, height: 844 },
  );
  await expect(fold).toHaveAttribute('aria-expanded', String(!initiallyOpen));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Heute has eight warning items once, two first, neutral debts and accessible actions in both themes', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const today: Heute = await (await page.request.get('/api/heute')).json();
  today.nextSteps.items = Array.from({ length: 8 }, (_, i) => ({
    kind: 'overspent',
    categoryId: `synthetic-over-${i}`,
    categoryName: `Testenvelope ${i + 1}`,
    cents: 1000 + i,
    count: 1,
  }));
  today.nextSteps.count = 8;
  today.pinned = [
    { ...today.pinned[0]!, id: 'synthetic-over-0', name: 'Testenvelope 1', availableCents: -1000 },
  ];
  await page.route('**/api/heute?*', (route) => route.fulfill({ json: today }));
  await page.goto('/?monat=2026-09');
  const attention = page.getByRole('region', { name: 'Braucht Aufmerksamkeit' });
  await expect(attention.locator('[data-overspent]')).toHaveCount(2);
  await attention.getByRole('button', { name: 'weitere 6' }).click();
  for (let i = 0; i < 8; i++)
    await expect(page.locator(`[data-overspent="synthetic-over-${i}"]`)).toHaveCount(1);
  await expect(page.locator('.heute-next-steps')).not.toContainText('Testenvelope');
  await expect(page.locator('.heute-envelope .heute-alert')).toHaveCount(1);
  await expect(page.locator('.heute-envelope')).not.toContainText('überzogen');
  if (info.project.name === 'desktop') {
    await expect(
      page.locator('.acct-group').filter({ hasText: 'Kreditkarten' }).locator('.is-neg'),
    ).toHaveCount(0);
    await expect(
      page.locator('.acct-group').filter({ hasText: 'Kredite' }).locator('.is-neg'),
    ).toHaveCount(0);
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});

isolatedTest(
  'Plan covers in order until its source is empty, one undo restores every row',
  async ({ page, request, baseURL }) => {
    isolatedTest.setTimeout(60_000);
    const month = '2026-10';
    const post = async (path: string, data: unknown) => {
      const response = await request.post(`/api${path}`, { data, headers: { origin: baseURL! } });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const { account } = await post('/accounts', {
      name: 'Synthetisches Deckungskonto',
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: 10000,
    });
    const { group } = await post('/categories/groups', { name: 'Synthetische Deckung' });
    const make = async (name: string, stage: number) =>
      (await post('/categories', { name, stage, groupId: group.id, class: 'need' })).category;
    const later = await make('Später', 3);
    const first = await make('Zuerst', 1);
    const last = await make('Zuletzt', 4);
    const source = await make('Freizeit', 2);
    const assigned = await request.put(`/api/budget/${month}/assigned`, {
      headers: { origin: baseURL! },
      data: { items: [{ categoryId: source.id, assignedCents: 2000 }] },
    });
    expect(assigned.ok()).toBe(true);
    for (const [categoryId, amountCents] of [
      [later.id, -2000],
      [first.id, -1200],
      [last.id, -300],
    ])
      await post('/bookings', {
        type: 'booking',
        accountId: account.id,
        date: '2026-10-02',
        categoryId,
        amountCents,
      });
    await page.goto(`/plan/monat?monat=${month}`);
    await page.getByLabel('Quelle für alle Überziehungen').selectOption(source.id);
    await page.getByRole('button', { name: 'Alle aus Freizeit decken' }).click();
    await expect(page.locator('.toast.is-open')).toContainText(
      '1 gedeckt, 2 offen · 15,00 € fehlen',
    );
    const value = (name: string) =>
      page.locator('tr.prow', { hasText: name }).locator('.col-avail');
    await expect(value('Zuerst')).toHaveText('0,00 €');
    await expect(value('Später')).toHaveText('−12,00 €');
    await expect(value('Zuletzt')).toHaveText('−3,00 €');
    await expect(value('Freizeit')).toHaveText('0,00 €');
    await expect(page.getByLabel('Quelle für alle Überziehungen')).toHaveValue('suggested');
    await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
    await expect(value('Zuerst')).toHaveText('−12,00 €');
    await expect(value('Später')).toHaveText('−20,00 €');
    await expect(value('Zuletzt')).toHaveText('−3,00 €');
    await expect(value('Freizeit')).toHaveText('20,00 €');
    await page.getByRole('button', { name: 'Alle aus Freizeit decken' }).click();
    await expect(value('Freizeit')).toHaveText('0,00 €');
    await page.getByRole('button', { name: 'Alle aus verfügbaren Envelopes decken' }).click();
    await expect(page.locator('.toast.is-open')).toContainText(
      '2 gedeckt, 0 offen · 0,00 € fehlen',
    );
    await expect(value('Später')).toHaveText('0,00 €');
    await expect(value('Zuletzt')).toHaveText('0,00 €');
  },
);
