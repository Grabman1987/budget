import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext } from '@playwright/test';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import { test } from './isolated-ledger';
import { withShellControls } from './shell-actions';
import { MIN_TARGET_PX } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-15' });

test('ON long negative month amount never overlaps the distribution button', async ({
  page,
  request,
  baseURL,
}, info) => {
  const account = await request.post('/api/accounts', {
    headers: { origin: baseURL! },
    data: {
      name: 'Synthetic negative head balance',
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: -1_234_567_890,
    },
  });
  expect(account.ok()).toBe(true);
  await page.goto('/plan/monat?monat=2026-10');
  const amount = page.getByTestId('to-be-assigned');
  await expect(amount).toHaveText('−12.345.678,90 €');
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (!on) {
    await expect(page.getByRole('region', { name: 'Monatsbudget', exact: true })).toHaveCount(0);
    return;
  }
  const viewport = page.viewportSize()!;
  const widths = viewport.width >= 768 ? [1024, 1280, 1440] : [viewport.width, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: viewport.height });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    const value = (await amount.boundingBox())!;
    const action = (await page
      .getByRole('button', { name: 'Geld verteilen', exact: true })
      .boundingBox())!;
    expect(
      value.x < action.x + action.width &&
        value.x + value.width > action.x &&
        value.y < action.y + action.height &&
        value.y + value.height > action.y,
      `Amount and distribution button must not overlap at ${width}px`,
    ).toBe(false);
    expect(action.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(action.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    await page.locator('.plan-topbar-v2 .plan-tba').click();
    await expect(page.getByTestId('plan-topbar')).toHaveClass(/is-compact/);
    const compact = await page.getByTestId('plan-topbar').evaluate((head) => {
      const headRect = head.getBoundingClientRect();
      const summary = head.querySelector('.plan-tba')!;
      const summaryRect = summary.getBoundingClientRect();
      const actionRect = head.querySelector('.plan-lead-controls > .btn')!.getBoundingClientRect();
      const amount = summary.querySelector('strong')!;
      const amountRect = amount.getBoundingClientRect();
      const amountStyle = getComputedStyle(amount);
      return {
        height: headRect.height,
        headTop: headRect.top,
        headBottom: headRect.bottom,
        headCenter: headRect.left + headRect.width / 2,
        summaryCenter: summaryRect.left + summaryRect.width / 2,
        summaryLeft: summaryRect.left,
        summaryRight: summaryRect.right,
        summaryTop: summaryRect.top,
        summaryBottom: summaryRect.bottom,
        summaryText: summary.textContent?.replaceAll(/\s+/g, ' ').trim(),
        amountLeft: amountRect.left,
        amountRight: amountRect.right,
        amountTop: amountRect.top,
        amountBottom: amountRect.bottom,
        amountScrollWidth: amount.scrollWidth,
        amountClientWidth: amount.clientWidth,
        amountVisibility: amountStyle.visibility,
        amountDisplay: amountStyle.display,
        actionLeft: actionRect.left,
        actionRight: actionRect.right,
        actionTop: actionRect.top,
        actionBottom: actionRect.bottom,
      };
    });
    expect(compact.height).toBeLessThanOrEqual(width < 768 ? 104 : 56);
    expect(compact.summaryCenter).toBeCloseTo(compact.headCenter, 0);
    expect(compact.summaryLeft).toBeGreaterThanOrEqual(0);
    expect(compact.summaryRight).toBeLessThanOrEqual(width);
    expect(compact.summaryText).toContain('12.345.678,90 €');
    expect(compact.amountVisibility).toBe('visible');
    expect(compact.amountDisplay).not.toBe('none');
    expect(compact.amountScrollWidth).toBeLessThanOrEqual(compact.amountClientWidth + 1);
    expect(compact.amountLeft).toBeGreaterThanOrEqual(compact.summaryLeft);
    expect(compact.amountRight).toBeLessThanOrEqual(compact.summaryRight);
    expect(compact.amountLeft).toBeGreaterThanOrEqual(0);
    expect(compact.amountRight).toBeLessThanOrEqual(width);
    expect(compact.amountTop).toBeGreaterThanOrEqual(compact.headTop);
    expect(compact.amountBottom).toBeLessThanOrEqual(compact.headBottom);
    expect(
      compact.summaryRight <= compact.actionLeft ||
        compact.actionRight <= compact.summaryLeft ||
        compact.summaryBottom <= compact.actionTop ||
        compact.actionBottom <= compact.summaryTop,
      `Compact amount and action must not overlap at ${width}px`,
    ).toBe(true);
    await page.locator('.plan-topbar-v2 .plan-tba').click();
    await page.screenshot({ path: info.outputPath(`negative-head-${width}.png`) });
  }
});

test('computed preview conflict refreshes and waits for explicit confirmation, then grouped Undo restores cents', async ({
  page,
  request,
  baseURL,
}) => {
  const send = async (path: string, method: string, data: unknown) => {
    const response = await request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  await send('/accounts', 'POST', {
    name: 'Synthetic conflict funds',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 20_000,
  });
  const { group } = await send('/categories/groups', 'POST', { name: 'Synthetic conflict group' });
  const { category } = await send('/categories', 'POST', {
    name: 'Synthetic conflict target',
    groupId: group.id,
    kind: 'variable',
    class: 'need',
    stage: 2,
  });
  await send(`/categories/${category.id}/target`, 'PUT', {
    validFrom: '2026-10',
    target: { kind: 'monthly', amountCents: 5_000 },
  });
  await send('/budget/2026-10/assigned', 'PUT', {
    items: [{ categoryId: category.id, assignedCents: 1_000 }],
  });
  await page.goto('/plan/monat?monat=2026-10');
  await expect(page.getByTestId('to-be-assigned')).toHaveText('190,00 €');
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') {
    await expect(page.getByRole('region', { name: 'Monatsbudget', exact: true })).toHaveCount(0);
    return;
  }
  await page.locator('.plan-menu-verteilen > summary').click();
  await page.getByRole('button', { name: 'Alle Ziele füllen', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Alle Ziele füllen', exact: true });
  await expect(
    preview.getByRole('button', { name: '40,00 € zuweisen', exact: true }),
  ).toBeEnabled();
  // A second client commits while A is looking at the old proposal.
  await send('/budget/2026-10/assigned', 'PUT', {
    items: [{ categoryId: category.id, assignedCents: 2_000 }],
  });
  const rejected = page.waitForResponse(
    (r) => r.url().endsWith('/budget/2026-10/assigned') && r.request().method() === 'PUT',
  );
  await preview.getByRole('button', { name: '40,00 € zuweisen', exact: true }).click();
  expect((await rejected).status()).toBe(409);
  await expect(preview.getByRole('alert')).toContainText('erneut bestätigen');
  const fresh = preview.getByRole('button', { name: '30,00 € zuweisen', exact: true });
  await expect(fresh).toBeEnabled();
  const assigned = async () => {
    const response = await request.get('/api/budget/2026-10');
    const view = (await response.json()) as BudgetMonthView;
    return view.summary.envelopes.find((e) => e.categoryId === category.id)!.assignedCents;
  };
  expect(await assigned()).toBe(2_000);
  await fresh.click();
  await expect(preview).toBeHidden();
  expect(await assigned()).toBe(5_000);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByTestId('to-be-assigned')).toHaveText('180,00 €');
  expect(await assigned()).toBe(2_000);
});

for (const theme of ['light', 'dark'] as const) {
  test(`P1 monthly presentation retains canonical cents and cancels its target preview without writes (${theme})`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    const send = async (path: string, method: string, data: unknown) => {
      const response = await request.fetch(`/api${path}`, {
        method,
        data,
        headers: { origin: baseURL! },
      });
      expect(response.ok()).toBe(true);
      return response.json() as Promise<{ group: { id: string }; category: { id: string } }>;
    };
    await send('/accounts', 'POST', {
      name: 'Synthetic monthly funds',
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: 1150,
    });
    const { group } = await send('/categories/groups', 'POST', { name: 'Synthetic monthly group' });
    const { category } = await send('/categories', 'POST', {
      name: 'Synthetic monthly target',
      groupId: group.id,
      kind: 'variable',
      class: 'need',
      stage: 2,
    });
    await send(`/categories/${category.id}/target`, 'PUT', {
      validFrom: '2026-10',
      target: { kind: 'monthly', amountCents: 1000 },
    });
    await send('/budget/2026-10/assigned', 'PUT', {
      items: [{ categoryId: category.id, assignedCents: 400 }],
    });
    const budget = async (api: APIRequestContext) => {
      const response = await api.get('/api/budget/2026-10');
      expect(response.ok()).toBe(true);
      return response.json() as Promise<BudgetMonthView>;
    };
    const assertCents = (view: BudgetMonthView) => {
      expect(view.summary).toMatchObject({
        month: '2026-10',
        assignedCents: 400,
        toBeAssignedCents: 750,
      });
      expect(view.summary.envelopes.find((row) => row.categoryId === category.id)).toMatchObject({
        assignedCents: 400,
        availableCents: 400,
        goalCents: 1000,
        needCents: 600,
      });
    };
    assertCents(await budget(request));
    const writes: string[] = [];
    page.on('request', (event) => {
      const path = new URL(event.url()).pathname;
      if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(event.method()))
        writes.push(`${event.method()} ${path}`);
    });
    await page.goto('/plan/monat?monat=2026-10');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => localStorage.getItem('budget-theme'))).toBe(theme);
    const row = page.locator(`.prow:has(.pname[data-category-id="${category.id}"])`);
    await expect(row).toBeVisible();
    await expect(page.getByTestId('to-be-assigned')).toHaveText('7,50 €');
    const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
    if (on) {
      const lead = page.getByRole('region', { name: 'Monatsbudget', exact: true });
      await expect(lead).toContainText('Monatszuweisung · Oktober 2026');
      await expect(lead).toContainText('7,50 €');
      await expect(
        lead.getByRole('group', { name: 'Zuweisungen nach Klasse', exact: true }),
      ).toBeVisible();
      await expect(row.locator('.plan-row-state')).toHaveText('Offen');
      await expect(row.locator('.plan-row-state svg')).toHaveCount(1);
    } else {
      await expect(page.getByRole('region', { name: 'Monatsbudget', exact: true })).toHaveCount(0);
      await expect(row.locator('.plan-row-state')).toHaveCount(0);
    }

    const distribute = page.locator('.plan-menu-verteilen > summary');
    await distribute.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Alle Ziele füllen', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Alle Ziele füllen', exact: true });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Synthetic monthly target');
    await expect(
      preview.getByRole('button', { name: '6,00 € zuweisen', exact: true }),
    ).toBeEnabled();
    await preview.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(preview).toBeHidden();
    await expect(distribute).toBeFocused();
    assertCents(await budget(request));
    expect(writes).toEqual([]);

    const initial = page.viewportSize()!;
    const widths = initial.width < 768 ? [initial.width, 320] : [initial.width];
    for (const width of widths) {
      await page.setViewportSize({ width, height: initial.height });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(row).toBeVisible();
      if (on) {
        if (width < 768) {
          const groupRow = page.locator(`#grp-${group.id}`);
          await expect(groupRow).toBeVisible();
          // Measure one layout frame: native WebKit may still apply scroll/compact-header changes.
          const geometry = await groupRow.evaluate((group) => {
            const box = (element: Element) => {
              const rect = element.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            };
            return {
              toggle: box(group.querySelector('.grp-toggle')!),
              available: box(group.querySelector('.plan-group-available')!),
              assigned: box(group.querySelector('.col-assign')!),
              group: box(group),
              row: box(group.nextElementSibling!),
              rowCategoryId: group.nextElementSibling
                ?.querySelector('.pname')
                ?.getAttribute('data-category-id'),
            };
          });
          expect(geometry.rowCategoryId).toBe(category.id);
          const { toggle, available } = geometry;
          expect(
            Math.abs(toggle.y + toggle.height / 2 - available.y - available.height / 2),
          ).toBeLessThanOrEqual(0.5);
          expect(toggle.x + toggle.width).toBeLessThanOrEqual(available.x);
          expect(geometry.assigned.width).toBeLessThanOrEqual(1);
          expect(geometry.row.y).toBeGreaterThanOrEqual(geometry.group.y + geometry.group.height);
        } else {
          // A real name needs the remaining cell width, rather than the legacy 1:3 status split.
          const name = row.locator('.category-name');
          expect(
            await name.evaluate((node) => node.scrollWidth - node.clientWidth),
          ).toBeLessThanOrEqual(1);
          for (const column of ['.col-assign', '.col-act', '.col-avail']) {
            expect((await row.locator(column).boundingBox())!.width).toBeCloseTo(108, 0);
            expect(
              await row.locator(column).evaluate((node) => getComputedStyle(node).textAlign),
            ).toBe('right');
          }
        }
        if (width === 1440 || (width === 390 && initial.height === 844)) {
          const first = await row.boundingBox();
          const navigation = page.locator('.tabbar');
          const bottomChrome = (await navigation.isVisible())
            ? (await navigation.boundingBox())!.height
            : 0;
          expect(first!.y + first!.height).toBeLessThanOrEqual(initial.height - bottomChrome + 0.5);
        }
        const action = page.getByRole('button', { name: 'Geld verteilen', exact: true });
        for (const control of [action, page.locator('.plan-tba')]) {
          const rect = await control.boundingBox();
          expect(rect!.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(rect!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(rect!.x).toBeGreaterThanOrEqual(-0.5);
          expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 0.5);
        }
        if (on && width < 768) {
          await row.evaluate((node) => node.scrollIntoView({ block: 'center' }));
          await expect(row).toBeInViewport();
          const stickyHead = page.getByTestId('plan-topbar');
          await expect(stickyHead).toHaveClass(/is-compact/);
          await expect(stickyHead).toBeInViewport();
          const stickyGeometry = await stickyHead.evaluate((head) => {
            const headRect = head.getBoundingClientRect();
            const summary = head
              .querySelector('[data-testid="to-be-assigned"]')!
              .closest('.plan-tba') as HTMLElement;
            const summaryRect = summary.getBoundingClientRect();
            const label = summary.querySelector('.plan-tba-label')!;
            const labelRect = label.getBoundingClientRect();
            const amountRect = summary.querySelector('strong')!.getBoundingClientRect();
            const labelVisible = getComputedStyle(label).position !== 'absolute';
            const actionRect = head
              .querySelector('.plan-lead-controls > .btn')!
              .getBoundingClientRect();
            const style = getComputedStyle(head);
            return {
              top: headRect.top,
              height: headRect.height,
              headCenter: headRect.left + headRect.width / 2,
              summaryCenter: summaryRect.left + summaryRect.width / 2,
              summaryLeft: summaryRect.left,
              summaryRight: summaryRect.right,
              summaryTop: summaryRect.top,
              summaryBottom: summaryRect.bottom,
              summaryScrollWidth: summary.scrollWidth,
              summaryClientWidth: summary.clientWidth,
              contentLeft: labelVisible
                ? Math.min(labelRect.left, amountRect.left)
                : amountRect.left,
              contentRight: labelVisible
                ? Math.max(labelRect.right, amountRect.right)
                : amountRect.right,
              actionLeft: actionRect.left,
              actionRight: actionRect.right,
              actionTop: actionRect.top,
              actionBottom: actionRect.bottom,
              background: style.backgroundColor,
              zIndex: Number.parseInt(style.zIndex, 10),
              headBottom: headRect.bottom,
            };
          });
          const targetRowTop = (await row.boundingBox())!.y;
          expect(stickyGeometry.top).toBeCloseTo(64, 0);
          expect(stickyGeometry.height).toBeLessThanOrEqual(width < 768 ? 104 : 56);
          expect(stickyGeometry.summaryCenter).toBeCloseTo(stickyGeometry.headCenter, 0);
          expect(stickyGeometry.summaryScrollWidth).toBeLessThanOrEqual(
            stickyGeometry.summaryClientWidth + 1,
          );
          expect(stickyGeometry.contentLeft).toBeGreaterThanOrEqual(stickyGeometry.summaryLeft - 1);
          expect(stickyGeometry.contentRight).toBeLessThanOrEqual(stickyGeometry.summaryRight + 1);
          expect(stickyGeometry.background).not.toBe('transparent');
          expect(stickyGeometry.background).not.toBe('rgba(0, 0, 0, 0)');
          expect(stickyGeometry.zIndex).toBeGreaterThan(0);
          expect(targetRowTop).toBeGreaterThanOrEqual(stickyGeometry.headBottom);
          expect(
            stickyGeometry.summaryRight <= stickyGeometry.actionLeft ||
              stickyGeometry.actionRight <= stickyGeometry.summaryLeft ||
              stickyGeometry.summaryBottom <= stickyGeometry.actionTop ||
              stickyGeometry.actionBottom <= stickyGeometry.summaryTop,
          ).toBe(true);
          await expect(page.getByTestId('to-be-assigned')).toBeInViewport();
          await expect(action).toBeInViewport();
          await page.evaluate(() => window.scrollTo(0, 0));
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0.5);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`plan-${on ? 'on' : 'off'}-${width}-${theme}.png`),
      });
    }
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await expect(page.getByTestId('to-be-assigned')).toHaveText('••• €');
    await expect(row).not.toContainText('4,00 €');
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await expect(page.getByTestId('to-be-assigned')).toHaveText('7,50 €');
    assertCents(await budget(request));
    expect(writes).toEqual([]);
  });
}
