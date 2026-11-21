import AxeBuilder from '@axe-core/playwright';
import { ratioBp } from '@budget/domain';
import type { YearReportRead } from '../apps/web/src/reports/overview-api';
import { bpText } from '../apps/web/src/reports/overview-format';
import { eur } from '../apps/web/src/ledger/format';
import { sampleTest as test, expect } from './sample';

for (const year of [2026, 2025]) {
  test(`1118 wealth change ${year} retains source cents, privacy and two A4 pages`, async ({
    page,
    browserName,
  }, info) => {
    const viewport = page.viewportSize()!;
    await page.goto('/reports/jahresreport');
    const summary = page.getByTestId('r5-year-summary');
    await expect(summary).toBeVisible();
    await page.getByRole('button', { name: String(year), exact: true }).click();
    const response = await page.request.get(`/api/overview/year?year=${year}`);
    expect(response.ok()).toBe(true);
    const data = (await response.json()) as YearReportRead;
    const n = data.report.netWorth!;
    const change = n.endCents - n.startCents;
    const rate = ratioBp(change, n.startCents);
    const expected = `${eur(change)} · ${rate === null ? 'Prozent nicht ermittelbar (Anfangsvermögen nicht positiv)' : bpText(rate)}`;
    const changeRow = summary
      .locator('dl > div')
      .filter({ has: page.getByText('Vermögensänderung', { exact: true }) });
    await expect(changeRow.locator('dd')).toHaveText(expected);
    await expect(summary.getByText('Anfangsvermögen').locator('..')).toContainText(
      eur(n.startCents),
    );
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const privacy = page
      .locator('.m-head:visible, .topbar:visible')
      .getByRole('button', { name: 'Beträge verbergen', exact: true });
    await privacy.press('Enter');
    await expect(changeRow.locator('dd')).toContainText('••• €');
    if (rate !== null) await expect(changeRow.locator('dd')).not.toContainText('%');
    await privacy.press('Enter');
    await page.screenshot({ path: info.outputPath(`${year}-wealth-summary.png`), fullPage: true });
    // Match the report suite's A4 printable width rather than the phone screen width.
    await page.setViewportSize({ width: 749, height: 1050 });
    await page.emulateMedia({ media: 'print' });
    const papers = summary.getByRole('article');
    await expect(papers).toHaveCount(2);
    await expect(changeRow.locator('dd')).toHaveText(expected);
    for (const paper of await papers.all()) {
      const size = await paper.evaluate((el) => ({
        scroll: el.scrollHeight,
        client: el.clientHeight,
      }));
      expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
    }
    if (browserName === 'chromium' && info.project.name === 'desktop') {
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).toHaveLength(2);
    }
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize(viewport);
    const paperButton = page.getByRole('button', {
      name: 'A4 Druckblatt und alle Details öffnen',
      exact: true,
    });
    await expect(paperButton).toBeVisible();
    await paperButton.press('Enter');
    await expect(page).toHaveURL(/darstellung=druckblatt/);
    await page.getByLabel('Bericht wechseln', { exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'A4 Druckblatt · Jahr', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ov-sheet-fig')).toContainText('%');
    await page.setViewportSize({ width: 749, height: 1050 });
    await page.emulateMedia({ media: 'print' });
    for (const sheet of await page.locator('.ov-sheet-body').all()) {
      const size = await sheet.evaluate((el) => ({
        scroll: el.scrollHeight,
        client: el.clientHeight,
      }));
      expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
    }
    if (browserName === 'chromium' && info.project.name === 'desktop') {
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).toHaveLength(2);
    }
  });
}

test('1118 shows the detailed performance XIRR and hides investment figures with privacy', async ({
  page,
}) => {
  await page.goto('/reports/jahresreport?darstellung=druckblatt');
  await page.getByRole('button', { name: '2026', exact: true }).click();
  const response = await page.request.get('/api/overview/year?year=2026');
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as YearReportRead;
  const months = data.report.months;
  const range = `${months[0]}..${months.at(-1)}`;
  const detail = await page.request.get(
    `/api/portfolio?period=${range}&view=securities&history=performance&provenance=valuation-v1`,
  );
  expect(detail.ok()).toBe(true);
  const xirr = (await detail.json()).portfolio.performance.xirr as number | null;
  expect(data.investments?.performance?.xirr).toBe(xirr);
  const rows = page.getByTestId('yr-invest-figures');
  const xirrCell = rows.getByRole('row', { name: /Rendite \(XIRR p\. a\.\)/ }).getByRole('cell');
  await expect(xirrCell).toHaveText(
    xirr === null
      ? 'nicht ermittelbar · keine berechenbare Zahlungsreihe im Zeitraum'
      : `${xirr > 0 ? '+' : xirr <= -0.0005 ? '−' : ''}${new Intl.NumberFormat('de-AT', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(Math.abs(xirr) * 100)} %`,
  );
  const gains = rows.getByRole('row', { name: /Realisierte Gewinne/ });
  const losses = rows.getByRole('row', { name: /Realisierte Verluste/ });
  const hitRate = rows.getByRole('row', { name: /Trefferquote geschlossener Positionen/ });
  for (const row of [gains, losses, hitRate]) await expect(row).toContainText('Vorjahr');
  const privacy = page
    .locator('.m-head:visible, .topbar:visible')
    .getByRole('button', { name: 'Beträge verbergen', exact: true });
  await privacy.press('Enter');
  if (xirr !== null) await expect(xirrCell).toHaveText('•••');
  for (const row of [gains, losses, hitRate]) await expect(row).not.toContainText(/\d+\s*[€%]/);
});
