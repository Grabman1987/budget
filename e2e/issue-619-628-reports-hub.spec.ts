import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase } from '@budget/db';
import type { ExplorerQuery, ExplorerViewsState } from '@budget/domain';
import { expect, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

async function inspect(page: Page, phone: boolean) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (phone) {
    for (const target of await page
      .locator('.report-hub a, .report-hub button, .report-hub input')
      .all()) {
      if (await target.isVisible())
        expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
}

test('619 sixteen-report hub has searchable groups, three session recents and a keyboard report switcher', async ({
  page,
}, info) => {
  const phone = info.project.name !== 'desktop';
  for (const theme of ['light', 'dark']) {
    for (const id of ['ausgaben', 'budgettreue', 'vergleich', 'explorer']) {
      await page.goto(`/reports/${id}`);
      await expect(page.locator('.report-switcher')).toBeVisible();
    }
    await page.goto('/reports');
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await expect(page.locator('.report-hub-list > li')).toHaveCount(16);
    expect(
      await page
        .locator('.report-hub-list > li')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('value'))),
    ).toEqual(Array.from({ length: 16 }, (_, index) => String(index + 1)));
    const first = await page.locator('.report-hub-list > li').nth(0).boundingBox();
    const next = await page.locator('.report-hub-list > li').nth(1).boundingBox();
    const link = await page.locator('.report-hub-list > li').nth(0).getByRole('link').boundingBox();
    expect(next!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
    expect(next!.x).toBe(first!.x);
    expect(link!.width).toBe(first!.width);
    await expect(
      page
        .getByRole('navigation', { name: 'Zuletzt geöffnete Berichte', exact: true })
        .getByRole('link'),
    ).toHaveCount(3);
    expect(
      await page.evaluate(() => JSON.parse(sessionStorage.getItem('budget.reports.recent.v1')!)),
    ).toEqual(['explorer', 'vergleich', 'budgettreue']);
    await expect(
      page.getByRole('navigation', { name: 'Register von Reports', exact: true }),
    ).toHaveCount(0);
    if (!phone) {
      const box = await page.locator('.report-hub').boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    }
    await inspect(page, phone);
    await page.screenshot({
      path: info.outputPath(`report-hub-${theme}.png`),
      animations: 'disabled',
    });
    for (const [name, count] of [
      ['Einnahmen/Ausgaben', 8],
      ['Vermögen', 1],
      ['Portfolio', 3],
      ['Berichte', 4],
    ] as const) {
      await page
        .getByRole('group', { name: 'Berichtsgruppen' })
        .getByRole('button', { name, exact: true })
        .click();
      await expect(page.locator('.report-hub-list > li')).toHaveCount(count);
    }
    await page
      .getByRole('group', { name: 'Berichtsgruppen' })
      .getByRole('button', { name: 'Alle', exact: true })
      .click();
    const search = page.getByRole('searchbox', {
      name: 'Berichte nach Name oder Frage suchen',
      exact: true,
    });
    await search.fill('Brutto');
    await expect(page.locator('.report-hub-list > li')).toHaveCount(1);
    await expect(page.locator('.report-hub-list strong')).toHaveText('Gehalt');
    await search.fill('Ausgabenanalyse');
    await page.locator('.report-hub-list a').click();
    await expect(page).toHaveURL(/\/reports\/ausgaben$/);
    await expect(
      page.getByRole('navigation', { name: 'Register von Reports', exact: true }),
    ).toHaveCount(0);
    const switcher = page.locator('.report-switcher > summary');
    await expect(switcher).toBeVisible();
    await switcher.click();
    const chooser = page.getByRole('searchbox', {
      name: 'Bericht nach Name oder Frage suchen',
      exact: true,
    });
    if (phone) {
      const viewport = page.viewportSize()!;
      for (const target of [page.locator('.report-switcher-menu'), chooser]) {
        await expect(target).toBeVisible();
        const box = (await target.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      const input = (await chooser.boundingBox())!;
      expect(input.width).toBeGreaterThanOrEqual(44);
      expect(input.height).toBeGreaterThanOrEqual(44);
      expect(
        await chooser.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          );
        }),
      ).toBe(true);
    }
    await chooser.fill('Brutto');
    await expect(page.locator('.report-switcher a')).toHaveCount(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (phone) expect((await switcher.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.locator('.report-switcher a').boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );
    await chooser.press('Escape');
    await expect(switcher).toBeFocused();
    await expect(page.locator('.report-switcher')).not.toHaveAttribute('open', '');
  }
});

test('619 supported maximum saved views remain keyboard reachable beside three recents and the complete catalog', async ({
  page,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const initialResponse = await page.request.get(`${origin}/api/reports/saved-queries`);
  expect(initialResponse.ok()).toBe(true);
  const initial = (await initialResponse.json()) as ExplorerViewsState;
  const names = Array.from({ length: 20 }, (_, index) =>
    `Synthetic view ${String(index + 1).padStart(2, '0')} ${'x'.repeat(40)}`.slice(0, 40),
  );
  expect(names.map((name) => name.length)).toEqual(Array(20).fill(40));
  const importedResponse = await page.request.post(`${origin}/api/reports/saved-queries`, {
    headers: { origin },
    data: {
      kind: 'import',
      revision: initial.revision,
      views: names.map((name) => ({
        name,
        query: { dim: 'kategorie', cls: 'want', cols: 'quartal', period: '3J', meas: 'summe' },
      })),
    },
  });
  expect(importedResponse.ok(), await importedResponse.text()).toBe(true);
  const imported = (await importedResponse.json()) as ExplorerViewsState;
  expect(imported.views.map((view) => view.name)).toEqual(names);
  expect(new Set(imported.views.map((view) => view.id)).size).toBe(20);
  for (const id of ['ausgaben', 'budgettreue', 'explorer']) {
    await page.goto(`/reports/${id}`);
    await expect(page.locator('.report-switcher')).toBeVisible();
  }
  await page.goto('/reports');
  const strip = page.getByRole('navigation', { name: 'Meine Auswertungen', exact: true });
  const links = strip.getByRole('link');
  await expect(links).toHaveCount(20);
  await expect(links).toHaveText(imported.views.map((view) => view.name));
  await expect(
    page
      .getByRole('navigation', { name: 'Zuletzt geöffnete Berichte', exact: true })
      .getByRole('link'),
  ).toHaveCount(3);
  await expect(page.locator('.report-hub-list > li')).toHaveCount(16);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const hub = (await page.locator('.report-hub').boundingBox())!;
    if (info.project.name === 'desktop') expect(hub.y + hub.height).toBeLessThanOrEqual(900);
    await links.first().focus();
    for (let index = 0; index < imported.views.length; index++) {
      const link = links.nth(index);
      await expect(link).toBeFocused();
      const destination = new URL((await link.getAttribute('href'))!, origin);
      expect([...destination.searchParams.entries()]).toEqual([
        ['ansicht', imported.views[index]!.id],
      ]);
      const bounds = await link.evaluate((element) => {
        const container = element.closest('nav')!;
        const outer = container.getBoundingClientRect();
        const inner = element.getBoundingClientRect();
        const style = getComputedStyle(container);
        const textRects: { left: number; right: number; top: number; bottom: number }[] = [];
        let emptyTextRanges = 0;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = [...range.getClientRects()];
          if (rects.length === 0) emptyTextRanges++;
          for (const rect of rects)
            textRects.push({
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            });
        }
        return {
          left: inner.left,
          right: inner.right,
          top: inner.top,
          bottom: inner.bottom,
          scrollLeft: outer.left + parseFloat(style.borderLeftWidth),
          scrollRight: outer.right - parseFloat(style.borderRightWidth),
          scrollTop: outer.top + parseFloat(style.borderTopWidth),
          scrollBottom: outer.bottom - parseFloat(style.borderBottomWidth),
          text: element.textContent?.trim(),
          textRects,
          emptyTextRanges,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          centerHit: element.contains(
            document.elementFromPoint(inner.x + inner.width / 2, inner.y + inner.height / 2),
          ),
        };
      });
      expect(bounds.text).toBe(imported.views[index]!.name);
      expect(bounds.emptyTextRanges).toBe(0);
      expect(bounds.textRects.length).toBeGreaterThan(0);
      for (const rect of bounds.textRects) {
        expect(rect.left).toBeGreaterThanOrEqual(bounds.scrollLeft);
        expect(rect.right).toBeLessThanOrEqual(bounds.scrollRight);
        expect(rect.top).toBeGreaterThanOrEqual(bounds.scrollTop);
        expect(rect.bottom).toBeLessThanOrEqual(bounds.scrollBottom);
      }
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
      expect(bounds.centerHit).toBe(true);
      if (index < imported.views.length - 1) await page.keyboard.press('Tab');
    }
    expect(await strip.evaluate((element) => element.scrollTop > 0 || element.scrollLeft > 0)).toBe(
      true,
    );
    await inspect(page, info.project.name !== 'desktop');
    await page.screenshot({
      path: info.outputPath(`maximum-saved-hub-${theme}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  }
});

test('628 saved-view chips reload across contexts and resolve only the current server view by ID', async ({
  page,
  browser,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    opened.sqlite.exec(
      "INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('budget','Synthetic report','checking','budget',1,'2026-09-01'); INSERT INTO category_group (id,name) VALUES ('g','Synthetic group'); INSERT INTO category (id,group_id,name,class,kind) VALUES ('want','g','Synthetic want','want','variable');",
    );
    createBooking(
      opened.db,
      {
        accountId: 'budget',
        date: '2026-09-15',
        amountCents: -12345,
        splits: [{ categoryId: 'want', amountCents: -12345 }],
      },
      { actor: 'synthetic-fixture' },
    );
  } finally {
    opened.close();
  }
  const second = await browser.newContext({
    baseURL: isolatedLedger.origin,
    storageState: isolatedLedger.storageState,
    viewport: page.viewportSize(),
    isMobile: info.project.name !== 'desktop',
    hasTouch: info.project.name !== 'desktop',
    serviceWorkers: 'block',
  });
  try {
    const other = await second.newPage();
    await other.goto('/reports');
    await expect(
      other.getByText('Noch keine eigene Auswertung gespeichert.', { exact: false }),
    ).toBeVisible();
    await page.goto('/reports/explorer');
    await page.getByLabel('Spalten', { exact: true }).selectOption('jahr');
    await page.getByLabel('Kennzahl', { exact: true }).selectOption('avg');
    await page.getByLabel('Ansicht speichern', { exact: true }).fill('Synthetic 123,45 €');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Synthetic 123,45 €', exact: true }),
    ).toBeVisible();
    const state = (await (
      await page.request.get('/api/reports/saved-queries')
    ).json()) as ExplorerViewsState;
    expect(state.views).toHaveLength(1);
    const id = state.views[0]!.id;
    expect(state.views[0]!.query).toEqual({
      dim: 'kategorie',
      cls: 'want',
      cols: 'jahr',
      period: '3J',
      meas: 'avg',
    });
    for (const theme of ['light', 'dark']) {
      await other.goto('/reports');
      await other.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      const chip = other
        .getByRole('navigation', { name: 'Meine Auswertungen', exact: true })
        .getByRole('link');
      await expect(chip).toHaveCount(1);
      const destination = new URL((await chip.getAttribute('href'))!, isolatedLedger.origin);
      expect(destination.pathname).toBe('/reports/explorer');
      expect([...destination.searchParams.entries()]).toEqual([['ansicht', id]]);
      expect(
        await other.locator('.report-hub').evaluate((hub) => {
          const recent = hub.querySelector('.report-hub-recent')!;
          const saved = hub.querySelector('.saved-explorer-links')!;
          return Boolean(recent.compareDocumentPosition(saved) & Node.DOCUMENT_POSITION_FOLLOWING);
        }),
      ).toBe(true);
      await inspect(other, info.project.name !== 'desktop');
      await other.screenshot({
        path: info.outputPath(`saved-hub-${theme}.png`),
        animations: 'disabled',
      });
      const profile = other.locator('.m-profile > summary');
      if (info.project.name !== 'desktop') await profile.click();
      await other.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
      await expect(chip).not.toContainText('123,45');
      await expect(chip).toContainText('•••');
      if (info.project.name !== 'desktop') await profile.click();
      await other.screenshot({
        path: info.outputPath(`saved-hub-private-${theme}.png`),
        animations: 'disabled',
      });
      if (info.project.name !== 'desktop') await profile.click();
      await other.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
      if (info.project.name !== 'desktop') await profile.click();
      await expect(chip).toHaveText('Synthetic 123,45 €');
      const resultRead = other.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === '/api/overview/explorer' && url.searchParams.get('meas') === 'avg';
      });
      await chip.click();
      const result = await resultRead;
      expect(result.ok()).toBe(true);
      expect(((await result.json()) as { result: { query: ExplorerQuery } }).result.query).toEqual({
        dim: 'kategorie',
        cls: 'want',
        cols: 'jahr',
        period: '3J',
        meas: 'avg',
      });
      await expect(other.getByLabel('Spalten', { exact: true })).toHaveValue('jahr');
      await expect(other.getByLabel('Kennzahl', { exact: true })).toHaveValue('avg');
      await expect(other.getByTestId('ex-table')).toBeVisible();
      expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);
    }
    // Edit in the first context while the second retains its earlier cached entry.
    await page
      .getByRole('button', { name: 'Ansicht Synthetic 123,45 € bearbeiten', exact: true })
      .click();
    await page.getByLabel('Kennzahl', { exact: true }).selectOption('anzahl');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            (await (
              await page.request.get('/api/reports/saved-queries')
            ).json()) as ExplorerViewsState
          ).views[0]!.query.meas,
      )
      .toBe('anzahl');
    await other.goto(`/reports/explorer?ansicht=${encodeURIComponent(id)}`);
    await expect(other.getByLabel('Kennzahl', { exact: true })).toHaveValue('anzahl');
    await other.reload();
    await expect(other.getByLabel('Kennzahl', { exact: true })).toHaveValue('anzahl');
    await page
      .getByRole('button', { name: 'Ansicht Synthetic 123,45 € löschen', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Synthetic 123,45 €', exact: true })).toHaveCount(
      0,
    );
    await expect
      .poll(
        async () =>
          (
            (await (
              await page.request.get('/api/reports/saved-queries')
            ).json()) as ExplorerViewsState
          ).views,
      )
      .toEqual([]);
    await other.reload();
    await expect(
      other.getByText(
        'Diese gespeicherte Auswertung ist nicht mehr verfügbar. Es wird keine andere Auswahl geladen.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(other.getByTestId('ex-table')).toHaveCount(0);
    await expect(other.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
    await other.getByRole('button', { name: 'Eigene Auswertung öffnen', exact: true }).click();
    await expect(other).not.toHaveURL(/ansicht=/);
    await expect(other.getByLabel('Kennzahl', { exact: true })).toBeEnabled();
    await other.goto('/reports/explorer?vorlage=heatmap&exakt=true&zeitraum=2026-09..2026-09');
    await expect(
      other.getByRole('button', { name: 'Heatmap Ausgaben', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(other.url()).searchParams.get('exakt')).toBe('true');
    await other.getByRole('button', { name: 'Jahresansicht', exact: true }).click();
    await expect(other).not.toHaveURL(/exakt=|ansicht=/);
  } finally {
    await second.close();
  }
});
