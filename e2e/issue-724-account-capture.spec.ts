import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext } from '@playwright/test';
import { test as base } from './isolated-ledger';

const test = base.extend<{ captureDesktop: boolean }>({
  captureDesktop: [false, { option: true }],
  page: async ({ page, browser, isolatedLedger, ledgerToday, captureDesktop }, use) => {
    if (!captureDesktop) {
      await use(page);
      return;
    }
    const context = await browser.newContext({
      baseURL: isolatedLedger.origin,
      storageState: isolatedLedger.storageState,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      reducedMotion: 'reduce',
    });
    try {
      const desktop = await context.newPage();
      await desktop.clock.setFixedTime(new Date(`${ledgerToday}T12:00:00+02:00`));
      await use(desktop);
    } finally {
      await context.close();
    }
  },
});

test.use({ ledgerToday: '2026-10-20' });

type Account = { id: string; balanceCents: number };
async function post<T>(
  request: APIRequestContext,
  origin: string,
  path: string,
  data: unknown,
): Promise<T> {
  const response = await request.post(`/api${path}`, { headers: { origin }, data });
  expect(response.status()).toBe(201);
  return response.json() as Promise<T>;
}
async function seed(request: APIRequestContext, origin: string) {
  const { account: viewed } = await post<{ account: Account }>(request, origin, '/accounts', {
    name: 'Giro Kontext 724',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 50000,
  });
  const { account: other } = await post<{ account: Account }>(request, origin, '/accounts', {
    name: 'Giro Verlauf 724',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { payee } = await post<{ payee: { id: string; name: string } }>(
    request,
    origin,
    '/payees',
    {
      name: 'Muster Zahler 724',
    },
  );
  await post(request, origin, '/bookings', {
    type: 'booking',
    accountId: other.id,
    date: '2026-10-19',
    amountCents: -100,
    status: 'confirmed',
    payeeId: payee.id,
  });
  return { viewed, other, payee };
}

for (const profile of ['configured', 'desktop1440'] as const) {
  test.describe(profile, () => {
    test.use({ captureDesktop: profile === 'desktop1440' });
    for (const entry of ['page', 'global', 'shortcut'] as const) {
      test(`account capture preserves real route context before and after a known payee via ${entry}`, async ({
        page,
        request,
        baseURL,
      }) => {
        const { viewed, other, payee } = await seed(request, baseURL!);
        const routeId = entry === 'global' ? viewed.id.replace(/-/g, '%2D') : viewed.id;
        await page.goto(`/konten/${routeId}${entry === 'shortcut' ? '/' : ''}`);
        await page.evaluate((id) => {
          localStorage.setItem(
            'budget-capture-memory',
            JSON.stringify({ accounts: [id], categories: [] }),
          );
        }, other.id);
        await page.reload();
        await expect(
          page.getByRole('heading', { level: 2, name: 'Giro Kontext 724', exact: true }),
        ).toBeVisible();
        if (entry === 'page')
          await page.getByRole('button', { name: 'Buchung erfassen', exact: true }).click();
        else if (entry === 'shortcut') await page.keyboard.press('n');
        else if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches))
          await page.getByRole('link', { name: 'Buchung erfassen', exact: true }).click();
        else await page.getByTitle('Buchung erfassen (N)', { exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
        const account = dialog.getByLabel('Bezahlt von', { exact: true });
        await expect(account).toHaveValue(viewed.id);
        await dialog.getByLabel('Empfänger', { exact: true }).fill(payee.name);
        await dialog.getByRole('option', { name: payee.name, exact: true }).click();
        await dialog.getByLabel('Betrag', { exact: true }).click();
        await page.waitForLoadState('networkidle');
        await expect(account).toHaveValue(viewed.id);
        // The account is editable; restoring the viewed choice must survive later payee blur.
        await account.selectOption(other.id);
        await expect(account).toHaveValue(other.id);
        await account.selectOption(viewed.id);
        await dialog.getByLabel('Empfänger', { exact: true }).focus();
        await dialog.getByLabel('Betrag', { exact: true }).click();
        await expect(account).toHaveValue(viewed.id);
        await dialog.getByRole('button', { name: 'Einnahme', exact: true }).click();
        await dialog.getByLabel('Betrag', { exact: true }).fill('123,45');
        const saved = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === '/api/bookings',
        );
        await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
        const response = await saved;
        expect(response.status()).toBe(201);
        const sent = response.request().postDataJSON() as {
          accountId: string;
          amountCents: number;
        };
        expect(sent.accountId).toBe(viewed.id);
        expect(sent.amountCents).toBe(12345);
        const result = (await response.json()) as { groupId: string };
        const accounts = await request.get('/api/accounts');
        const rows = (await accounts.json()).accounts as Account[];
        expect(rows.find((row) => row.id === viewed.id)?.balanceCents).toBe(62345);
        expect(rows.find((row) => row.id === other.id)?.balanceCents).toBe(99900);
        const undo = await request.post('/api/undo', {
          headers: { origin: baseURL! },
          data: { groupId: result.groupId },
        });
        expect(undo.status()).toBe(200);
        const restored = (await (await request.get('/api/accounts')).json()).accounts as Account[];
        expect(restored.find((row) => row.id === viewed.id)?.balanceCents).toBe(50000);
        expect(restored.find((row) => row.id === other.id)?.balanceCents).toBe(99900);
      });
    }

    test('native calendar receives real input without showPicker and German date entry keeps the draft', async ({
      page,
      request,
      baseURL,
      captureDesktop,
    }, info) => {
      const { viewed } = await seed(request, baseURL!);
      await page.addInitScript(() => {
        Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
          configurable: true,
          value: undefined,
        });
      });
      await page.goto(`/konten/${viewed.id}`);
      await page.getByRole('button', { name: 'Buchung erfassen', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
      await dialog.getByLabel('Betrag', { exact: true }).fill('19,99');
      const date = dialog.getByRole('textbox', { name: 'Datum', exact: true });
      const picker = dialog.getByLabel('Datum im Kalender', { exact: true });
      await expect(date).not.toHaveAttribute('inputmode', 'numeric');
      await expect(date).not.toHaveAttribute('inputmode', 'decimal');
      await date.fill('29.02.2028');
      await date.press('Tab');
      await expect(date).toHaveValue('29.02.2028');
      await expect(picker).not.toHaveAttribute('aria-hidden', 'true');
      expect(
        await picker.evaluate((input) => (input as HTMLInputElement).tabIndex),
      ).toBeGreaterThanOrEqual(0);
      const inputEvents: { trusted: boolean; pointerType: string; targetNative: boolean }[] = [];
      await page.exposeFunction('recordNative724', (event: (typeof inputEvents)[number]) =>
        inputEvents.push(event),
      );
      await picker.evaluate((input) => {
        input.addEventListener('pointerdown', (event) => {
          void (
            window as unknown as {
              recordNative724: (event: {
                trusted: boolean;
                pointerType: string;
                targetNative: boolean;
              }) => Promise<void>;
            }
          ).recordNative724({
            trusted: event.isTrusted,
            pointerType: (event as PointerEvent).pointerType,
            targetNative: event.target === input,
          });
        });
      });
      const box = await picker.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      if (!captureDesktop && info.project.use.hasTouch) await picker.tap();
      else await picker.click();
      await expect
        .poll(() =>
          inputEvents.some(
            (event) =>
              event.trusted &&
              event.targetNative &&
              event.pointerType ===
                (!captureDesktop && info.project.use.hasTouch ? 'touch' : 'mouse'),
          ),
        )
        .toBe(true);
      await expect(picker).toBeFocused();
      // Filling the native value proves draft propagation; it does not claim operating-system picker selection.
      await picker.fill('2026-11-03');
      await expect(date).toHaveValue('03.11.2026');
      for (const theme of ['light', 'dark'] as const) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await dialog.screenshot({ path: info.outputPath(`capture-date-${theme}.png`) });
      }
      await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
      await expect(dialog.getByRole('alertdialog')).toBeVisible();
      await dialog.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
      await expect(date).toHaveValue('03.11.2026');
      await picker.fill('2026-10-03');
      await expect(date).toHaveValue('03.10.2026');
      await dialog.getByRole('button', { name: 'Einnahme', exact: true }).click();
      await dialog.getByLabel('Betrag', { exact: true }).fill('12,34');
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/bookings',
      );
      await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
      const response = await saved;
      expect(response.status()).toBe(201);
      expect(response.request().postDataJSON()).toMatchObject({
        accountId: viewed.id,
        date: '2026-10-03',
        amountCents: 1234,
      });
      const result = (await response.json()) as { groupId: string };
      const rows = (await (await request.get('/api/accounts')).json()).accounts as Account[];
      expect(rows.find((row) => row.id === viewed.id)?.balanceCents).toBe(51234);
      const undo = await request.post('/api/undo', {
        headers: { origin: baseURL! },
        data: { groupId: result.groupId },
      });
      expect(undo.status()).toBe(200);
      const restored = (await (await request.get('/api/accounts')).json()).accounts as Account[];
      expect(restored.find((row) => row.id === viewed.id)?.balanceCents).toBe(50000);
    });
  });
}
