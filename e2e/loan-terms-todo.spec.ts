import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, type APIRequestContext } from '@playwright/test';
import { test } from './isolated-ledger';

const expect = baseExpect.configure({ timeout: 30_000 });

async function account(request: APIRequestContext, origin: string, data: Record<string, unknown>) {
  const response = await request.post(`${origin}/api/accounts`, {
    headers: { origin },
    data: { openingDate: '2026-09-01', openingBalanceCents: -10_000, ...data },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).account as { id: string };
}

test('only incomplete open loans prompt once; completing their terms removes the row', async ({
  page,
  request,
  isolatedLedger,
}) => {
  test.setTimeout(180_000);
  const origin = isolatedLedger.origin;
  await account(request, origin, { name: 'Karte ohne Konditionen', type: 'credit_card' });
  await account(request, origin, { name: 'Dispo ohne Konditionen', type: 'checking' });
  const closed = await account(request, origin, {
    name: 'Geschlossener Kredit',
    type: 'loan',
    openingBalanceCents: 0,
  });
  const close = await request.post(`${origin}/api/accounts/${closed.id}/close`, {
    headers: { origin },
    data: {},
  });
  expect(close.ok(), await close.text()).toBe(true);
  await account(request, origin, {
    name: 'Kredit Nullzins',
    type: 'loan',
    interestRateBp: 0,
    installmentCents: 3_000,
  });
  await page.goto('/');
  const row = page.getByRole('region', { name: 'Zu tun', exact: true });
  const prompt = row.getByRole('link', { name: 'Konditionen ergänzen' });
  await expect(page.locator('.heute-answers')).toBeVisible();
  await expect(prompt).toHaveCount(0);

  const noPayment = await account(request, origin, {
    name: 'Kredit ohne Rate',
    type: 'loan',
    interestRateBp: 0,
  });
  const noInterest = await account(request, origin, {
    name: 'Kredit ohne Zins',
    type: 'loan',
    installmentCents: 3_000,
  });
  await page.reload();
  await expect(prompt).toHaveCount(1);

  const complete = await request.patch(`${origin}/api/accounts/${noPayment.id}`, {
    headers: { origin },
    data: { installmentCents: 3_000 },
  });
  expect(complete.ok(), await complete.text()).toBe(true);
  await page.reload();
  await expect(prompt).toHaveCount(1);

  await prompt.click();
  await expect(page).toHaveURL(/\/einstellungen\/konten$/);
  await page.getByRole('button', { name: 'Kredit ohne Zins bearbeiten' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Zinssatz in Prozent', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('link', { name: 'Heute', exact: true }).first().click();
  await expect(page.locator('.heute-answers')).toBeVisible();
  await expect(prompt).toHaveCount(0);

  const saved = (await (await request.get(`${origin}/api/accounts`)).json()).accounts as {
    id: string;
    balanceCents: number;
    interestRateBp: number;
    installmentCents: number;
  }[];
  for (const id of [noPayment.id, noInterest.id])
    expect(saved.find((a) => a.id === id)).toMatchObject({
      balanceCents: -10_000,
      interestRateBp: 0,
      installmentCents: 3_000,
    });
});

test('terms row and Schulden page: no red, no overflow, Axe clean, 44 px targets, both themes', async ({
  page,
  request,
  isolatedLedger,
  isMobile,
}) => {
  test.setTimeout(180_000);
  const origin = isolatedLedger.origin;
  await account(request, origin, { name: 'Kredit ohne Konditionen', type: 'loan' });
  await account(request, origin, {
    name: 'Kredit mit Konditionen',
    type: 'loan',
    interestRateBp: 500,
    installmentCents: 3_000,
  });
  await account(request, origin, { name: 'Karte ohne Konditionen', type: 'credit_card' });
  for (const path of ['/', '/vermoegen/schulden']) {
    await page.goto(path);
    if (path === '/') {
      await expect(page.getByRole('link', { name: 'Konditionen ergänzen' })).toBeVisible();
    } else {
      await expect(page.getByTestId('debt-total')).toBeVisible();
      await page.getByText('Rechenweg', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Schulden nach Konto' })).toBeVisible();
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      if (isMobile) {
        const small = await page
          .locator(path === '/' ? '.heute-attention a' : '.debts-view a, .debts-view button')
          .evaluateAll((elements) =>
            elements.flatMap((element) => {
              const box = element.getBoundingClientRect();
              return box.width && box.height && box.height < 44
                ? [{ text: element.textContent, height: box.height }]
                : [];
            }),
          );
        expect(small).toEqual([]);
      }
      if (path !== '/') {
        // Debts are routine/steady values: nothing on the page may use the act-now red roles.
        const red = await page.evaluate(() => {
          const probe = document.createElement('span');
          document.body.append(probe);
          const resolve = (token: string) => {
            probe.style.color = `var(${token})`;
            return getComputedStyle(probe).color;
          };
          const roles = [resolve('--red'), resolve('--red-soft')];
          probe.remove();
          return [...document.querySelectorAll('.debts-view *')]
            .filter((e) => {
              const box = e.getBoundingClientRect();
              const style = getComputedStyle(e);
              return (
                box.width > 0 &&
                box.height > 0 &&
                [style.color, style.backgroundColor, style.fill, style.stroke].some((c) =>
                  roles.includes(c),
                )
              );
            })
            .map((e) => e.className);
        });
        expect(red).toEqual([]);
      }
    }
  }
});
