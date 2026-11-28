import { sampleTest as test, expect } from './sample';
import { redesignReportsOn } from './report-frame';

for (const path of [
  'onepager?monat=2026-08',
  'jahresreport',
  'vergleich',
  'kontakte',
  'explorer',
  'vermoegen-schulden',
  'pdepots',
  'psteuern',
  'einnahmen-ausgaben',
  'ausgaben',
  'gehalt',
  'geldfluss',
  'sparquote',
  'budgettreue',
  'abos',
  'inflation',
]) {
  test(`${path}: verdict precedes collapsed calculations and report content`, async ({
    page,
  }, info) => {
    await page.goto(`/reports/${path}`);
    if (!(await redesignReportsOn(page))) {
      await expect(page.locator('.titleblock')).toBeVisible();
      return;
    }
    const frame = page.locator('.redesign-report-frame').first();
    if (path === 'kontakte') {
      // Contacts have nothing to assess: header total only, no verdict card, no calculation block.
      await expect(frame.getByTestId('report-frame-basis')).not.toHaveText('wird geladen');
      await expect(frame.getByTestId('report-frame-result')).toContainText('€');
      await expect(frame.locator('.report-verdict')).toHaveCount(0);
      await expect(frame.locator('.redesign-report-detail')).toHaveCount(0);
      await expect(frame.getByText('Berechnung und Einordnung')).toHaveCount(0);
      return;
    }
    const verdict = frame.locator(':scope > .report-verdict');
    await expect(verdict).toHaveCount(1);
    await expect(verdict).toBeVisible();
    await expect(frame.getByTestId('report-frame-basis')).not.toHaveText('wird geladen');
    await expect(verdict).not.toHaveText('');
    await expect(frame.locator(':scope > header + .report-verdict')).toHaveCount(1);
    expect(await verdict.evaluate((node) => node.closest('details'))).toBeNull();
    await expect(frame.locator('.redesign-report-head .redesign-report-equation')).toHaveCount(0);
    const detail = frame.locator(':scope > .redesign-report-detail');
    if (await detail.count()) {
      await expect(detail).not.toHaveAttribute('open');
      await expect(detail.locator('.report-verdict')).toHaveCount(0);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await expect(verdict).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.keyboard.press('Control+Shift+h');
      await expect(frame.getByTestId('report-frame-result')).not.toHaveText(/\d/);
      await expect(verdict).not.toHaveText(/\d[\d.,]*\s*€/);
      await page.keyboard.press('Control+Shift+h');
      await page.screenshot({ path: info.outputPath(`verdict-${theme}.png`) });
    }
    if (await detail.count()) {
      await detail.locator('summary').click();
      const equation = detail.locator('.redesign-report-equation');
      if (await equation.count()) {
        await expect(equation).toBeVisible();
        await expect(equation.locator(':scope > strong')).toHaveText(
          await frame.getByTestId('report-frame-result').innerText(),
        );
      }
    }
  });
}
