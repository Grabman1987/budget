import AxeBuilder from '@axe-core/playwright';
import type { PortfolioAllocationView } from '@budget/db';
import { sampleTest, expect } from './sample';

sampleTest(
  'allocation evidence matches its as-of view and tolerates a legacy DTO',
  async ({ page }) => {
    let legacyDto = false;
    let selectedAccountCount = 0;
    await page.route('**/api/portfolio/allocation', async (route) => {
      const data = (await (await route.fetch()).json()) as PortfolioAllocationView;
      selectedAccountCount = data.universe.accountIds.length;
      data.asOf = '2026-09-17';
      if (legacyDto) {
        delete data.exposureEvidence;
      } else {
        data.exposureEvidence = [
          {
            securityId: 'sec-etfw',
            validFrom: '2026-08-01',
            source: 'Synthetic feed 123,45 EUR',
            storedComplete: false,
          },
          { securityId: 'sec-crypto', validFrom: null, source: null, storedComplete: null },
        ];
      }
      await route.fulfill({ json: data });
    });

    await page.goto('/vermoegen/portfolio/positionen');
    await page
      .getByRole('navigation', { name: 'Portfolio-Register', exact: true })
      .getByRole('link', { name: 'Allokation', exact: true })
      .click();
    const allocation = page.getByRole('region', { name: 'Aufteilung Soll/Ist', exact: true });
    await allocation.getByText('Wie wird gerechnet?', { exact: true }).click();
    await expect(allocation).toContainText('Datengrundlage am 17.09.2026');
    await expect(allocation).toContainText(
      `in ${selectedAccountCount} ausgewählten Konten und Depots`,
    );
    await expect(allocation.locator('.vallo')).toContainText('ETF Welt');
    await expect(allocation).toContainText(
      'Wirksam ab 01.08.2026 · Quelle: Synthetic feed 123,45 EUR.',
    );
    await expect(allocation).toContainText('Gespeicherte Exposure-Angabe: unvollständig.');
    await expect(allocation).toContainText('Keine wirksame Exposure-Version hinterlegt.');
    await expect(allocation).toContainText('Vollständigkeit nicht hinterlegt.');

    const profile = page.locator('.m-profile summary');
    const mobile = await profile.isVisible();
    if (mobile) await profile.click();
    const privacy = page.getByRole('button', { name: 'Beträge verbergen', exact: true });
    if ((await privacy.getAttribute('aria-pressed')) !== 'true') await privacy.click();
    await expect(allocation).toContainText('Synthetic feed ••• EUR');
    if (mobile) await profile.press('Escape');

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page }).include('main').analyze();
      expect(audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
        [],
      );
      const evidenceLink = allocation.getByRole('link', { name: 'ETF Welt', exact: true });
      expect((await evidenceLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    legacyDto = true;
    await page.reload();
    await allocation.getByText('Wie wird gerechnet?', { exact: true }).click();
    await expect(allocation).toContainText('Quelldetails nicht verfügbar.');
    await expect(allocation).toContainText('Datengrundlage am 17.09.2026');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const legacyAudit = await new AxeBuilder({ page }).include('main').analyze();
    expect(
      legacyAudit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([]);
  },
);
