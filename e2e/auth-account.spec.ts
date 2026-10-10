import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { sampleTest } from './sample';
import type { AccountList } from '../apps/web/src/ledger/types';

// Includes fixture setup on the memory-constrained owner machine.
test.setTimeout(120_000);

async function review(page: Page, name: string, project: string) {
  mkdirSync('docs/evidence/auth-account-1009', { recursive: true });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `docs/evidence/auth-account-1009/${name}-${project}-${colorScheme}.png`,
      fullPage: false,
    });
  }
}

test('a hanging native credential request returns to retry and recovery without verification', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.route('**/api/auth/status', (route) =>
    route.fulfill({
      json: {
        setupRequired: false,
        authenticated: false,
        viaRecovery: false,
        stepUpValidUntil: null,
      },
    }),
  );
  await page.route('**/api/auth/login/options', (route) =>
    route.fulfill({
      json: {
        options: { challenge: 'c3ludGhldGlj', rpId: 'localhost', userVerification: 'required' },
      },
    }),
  );
  let verifications = 0;
  await page.route('**/api/auth/login/verify', (route) => {
    verifications++;
    return route.fulfill({ status: 401, json: { error: 'login_failed' } });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.credentials, 'get', {
      configurable: true,
      value: (options: CredentialRequestOptions) => {
        document.documentElement.dataset.passkeyWaiting = 'true';
        options.signal?.addEventListener('abort', () => {
          document.documentElement.dataset.passkeyAborted = 'true';
        });
        return new Promise(() => {});
      },
    });
  });
  await page.clock.install();
  await page.goto('/login');
  const passkey = page.getByRole('button', { name: 'Mit Passkey anmelden' });
  await passkey.click();
  await expect(page.locator('main').getByRole('status')).toContainText('60 Sekunden');
  await expect(passkey).toBeDisabled();
  await page.waitForFunction(() => document.documentElement.dataset.passkeyWaiting === 'true');
  await page.clock.fastForward(60_001);
  await expect(page.locator('html')).toHaveAttribute('data-passkey-aborted', 'true');
  await expect(page.getByRole('alert')).toContainText('Zeit abgelaufen');
  await expect(passkey).toBeEnabled();
  expect(verifications).toBe(0);
  await review(page, 'login-timeout', info.project.name);
  await page.getByRole('button', { name: 'Wiederherstellungscode verwenden' }).click();
  await expect(page.getByLabel('Wiederherstellungscode')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Mit Code anmelden' })).toBeEnabled();
  if (info.project.name === 'mobile') {
    const small = await page
      .locator('button, input')
      .evaluateAll((elements) =>
        elements
          .filter(
            (el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44,
          )
          .map((el) => el.textContent),
      );
    expect(small).toEqual([]);
  }
});

sampleTest(
  'account header separates owner review, technical retrieval and bank observation',
  async ({ page }, info) => {
    test.setTimeout(120_000);
    const response = await page.request.get('/api/accounts');
    const list = (await response.json()) as AccountList;
    const target = list.accounts.find((a) => a.type === 'checking' && !a.closedAt)!;
    let synced = false;
    let viaRecovery = false;
    await page.route('**/api/accounts', (route) =>
      route.fulfill({
        json: {
          ...list,
          accounts: list.accounts.map((a) =>
            a.id !== target.id
              ? a
              : {
                  ...a,
                  lastReconciledOn: synced ? '2026-09-15' : null,
                  bankBalance: synced
                    ? {
                        amountCents: null,
                        date: '2026-09-16',
                        fetchedAt: '2026-09-17T06:30:00Z',
                        reconciledThrough: null,
                        canLock: false,
                      }
                    : null,
                },
          ),
        },
      }),
    );
    await page.route('**/api/auth/status', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ json: { ...(await response.json()), viaRecovery } });
    });
    await page.goto(`/konten/${target.id}`);
    const status = page.getByRole('group', { name: 'Datenstand', exact: true });
    await expect(status).toContainText('Unbekannt');
    await expect(status).toContainText('Bank-Sync: Nicht eingerichtet');
    if (info.project.name === 'desktop')
      await expect(page.locator('.profile-text')).toContainText('Passkey');
    await review(page, 'account-unknown', info.project.name);
    synced = true;
    viaRecovery = true;
    await page.reload();
    await expect(status).toContainText('15.09.2026');
    await expect(status).toContainText('Manuelle Prüfung');
    await expect(status).toContainText('Technischer Abruf: 17.09.2026');
    await expect(status).toContainText('Bankstand vom: 16.09.2026');
    await expect(page.locator('.titleblock')).toContainText('Abruf gespeichert');
    await expect(page.locator('.titleblock')).toContainText('16.09.2026');
    await expect(page.locator('.titleblock')).not.toContainText('nicht eingerichtet');
    if (info.project.name === 'desktop') {
      await expect(page.locator('.profile-text')).toContainText('Wiederherstellungscode');
      await expect(page.locator('.profile-text')).not.toContainText('dieses Gerät');
    }
    await review(page, 'account-dated', info.project.name);
  },
);

sampleTest(
  'settings profile header names recovery on desktop and phone',
  async ({ page }, info) => {
    await page.route('**/api/auth/status', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ json: { ...(await response.json()), viaRecovery: true } });
    });
    await page.goto('/einstellungen/profil');
    await expect(page.locator('.titleblock')).toContainText('Wiederherstellungscode');
    await expect(page.locator('.titleblock')).not.toContainText('Passkey');
    await review(page, 'profile-recovery', info.project.name);
  },
);
