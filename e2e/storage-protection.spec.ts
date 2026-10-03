import { test, expect } from '@playwright/test';

test('requests durable storage once after login and reports denial across reloads', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => false,
        persist: async () => {
          localStorage.setItem(
            'test-persist-calls',
            String(Number(localStorage.getItem('test-persist-calls') ?? 0) + 1),
          );
          return false;
        },
      },
    });
  });
  await page.goto('/einstellungen/sicherheit');
  await expect(
    page.getByRole('status').filter({ hasText: 'Dauerhafter Speicher ist nicht gewährt' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: 'Dauerhafter Speicher ist nicht gewährt' }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('test-persist-calls'))).toBe('1');
});
