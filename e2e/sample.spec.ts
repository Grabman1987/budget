import { sampleTest as test, expect } from './sample';

// The sample server is seeded with the synthetic ledger and runs on 17.09.2026 (see the convention
// in playwright.config.ts). Runs at 1440 px (desktop project) and 390 px (mobile project).
test('the sample server shows the prototype figure for Nettovermögen on /konten', async ({
  page,
}) => {
  await page.goto('/konten');
  await expect(page.getByTestId('net-worth')).toHaveText('84.730,00 €');
});
