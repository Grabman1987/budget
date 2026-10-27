import AxeBuilder from '@axe-core/playwright';
import type { PortfolioAllocationView } from '@budget/db';
import { sampleTest, expect } from './sample';

sampleTest(
  'allocation evidence matches its as-of view and tolerates a legacy DTO',
  async ({ page }) => {
    let legacyDto = false;
    let selectedAccountCount = 0;
    let sourceValueCents: number | null = null;
    let sourceValuationQuality: PortfolioAllocationView['quality']['valuationQuality'] = 'exact';
    let expectedValueText = '';
    let expectedQualityText = '';
    await page.route('**/api/portfolio/allocation', async (route) => {
      const data = (await (await route.fetch()).json()) as PortfolioAllocationView;
      selectedAccountCount = data.universe.accountIds.length;
      sourceValueCents = data.valueCents;
      sourceValuationQuality = data.quality.valuationQuality;
      expectedValueText =
        sourceValueCents === null
          ? 'Netto-Allokationsuniversum: Wert nicht verfügbar.'
          : `Netto-Allokationsuniversum: ${new Intl.NumberFormat('de-AT', {
              maximumFractionDigits: 0,
            })
              .format(sourceValueCents / 100)
              .replace(/^-/, '−')} €.`;
      const qualityLabel =
        sourceValuationQuality === 'exact'
          ? 'vollständig'
          : sourceValuationQuality === 'estimated'
            ? 'geschätzt oder veraltet'
            : 'nicht vollständig verfügbar';
      expectedQualityText = `Bewertung ${qualityLabel}, Klassifikation`;
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
      `Ausgewähltes Allokationsuniversum: ${selectedAccountCount} Konten und Depots.`,
    );
    expect(selectedAccountCount).toBeGreaterThan(0);
    await expect(allocation.locator('.vallo')).toContainText('Aktien Welt');
    await expect(allocation).toContainText(expectedValueText);
    await expect(allocation).toContainText(expectedQualityText);
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
    const evidenceList = allocation.getByRole('list', { name: 'Wirksame Exposure-Quellen' });
    await expect(evidenceList).toContainText('Synthetic feed ••• EUR');
    await expect(evidenceList).not.toContainText('123,45');
    const evidenceAttributes = await evidenceList
      .locator('[aria-label], [title], [data-tooltip]')
      .evaluateAll((elements) =>
        elements
          .flatMap((element) =>
            ['aria-label', 'title', 'data-tooltip'].map((name) => element.getAttribute(name) ?? ''),
          )
          .join(' '),
      );
    expect(evidenceAttributes).not.toContain('123,45');
    if (mobile) await profile.press('Escape');

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const audit = await new AxeBuilder({ page }).include('main').analyze();
      expect(
        audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
      ).toEqual([]);
      const evidenceLink = evidenceList.getByRole('link', { name: 'ETF Welt', exact: true });
      const linkBox = (await evidenceLink.boundingBox())!;
      expect(linkBox.width).toBeGreaterThanOrEqual(44);
      expect(linkBox.height).toBeGreaterThanOrEqual(44);
    }

    legacyDto = true;
    await page.reload();
    await allocation.getByText('Wie wird gerechnet?', { exact: true }).click();
    await expect(allocation).toContainText('Quelldetails nicht verfügbar.');
    await expect(allocation).toContainText('Datengrundlage am 17.09.2026');
    if (sourceValueCents !== null)
      await expect(allocation).toContainText('Netto-Allokationsuniversum: ••• €.');
    if (mobile) await profile.click();
    await page.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
    await expect(privacy).toHaveAttribute('aria-pressed', 'false');
    if (mobile) await profile.press('Escape');
    await expect(allocation).toContainText(expectedValueText);
    await expect(allocation).toContainText(expectedQualityText);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const legacyAudit = await new AxeBuilder({ page }).include('main').analyze();
    expect(
      legacyAudit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([]);
  },
);
