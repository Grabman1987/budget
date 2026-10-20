import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema, type PortfolioAllocationView, type TargetVersion } from '@budget/db';
import type { ManagedTarget, TargetTier } from '@budget/domain';
import { expect, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

// Real bootstrap and throwaway ledger per attempt; no substituted API or domain resolver.
// These are declared cases until official collection and actual execution prove otherwise.
test.use({ ledgerToday: '2026-10-20' });
const DAY = '2026-10-20';
const BASE = '2026-09-01';
const FUTURE = '2026-10-21';
const NAMES = ['Musterklasse A', 'Musterklasse B', 'Musterklasse C', 'Musterklasse D', 'Musterklasse E', 'Musterklasse F'];
const IDS = ['stage-a', 'stage-b', 'stage-c', 'stage-d', 'stage-e', 'stage-f'];
const LOWER_TEXT = ['0,00', '10000,00', '50000,00', '100000,00', '500000,00', '1000000,00', '2000000,00'];
const UPPERS = [999999, 4999999, 9999999, 49999999, 99999999, 199999999, null];
const WEIGHTS = [
  [8500, 1500, 0, 0, 0, 0],
  [7500, 500, 2000, 0, 0, 0],
  [7500, 500, 2000, 0, 0, 0],
  [7500, 500, 2000, 0, 0, 0],
  [6500, 500, 2000, 1000, 0, 0],
  [6000, 500, 2000, 1500, 0, 0],
  [6000, 500, 2000, 1500, 0, 0],
];
const TEXT = [
  ['85,00', '15,00', '0,00', '0,00', '0,00', '0,00'],
  ['75,00', '5,00', '20,00', '0,00', '0,00', '0,00'],
  ['75,00', '5,00', '20,00', '0,00', '0,00', '0,00'],
  ['75,00', '5,00', '20,00', '0,00', '0,00', '0,00'],
  ['65,00', '5,00', '20,00', '10,00', '0,00', '0,00'],
  ['60,00', '5,00', '20,00', '15,00', '0,00', '0,00'],
  ['60,00', '5,00', '20,00', '15,00', '0,00', '0,00'],
];
// Only bind literal expected values to the fixture's class IDs; never call a policy/conversion helper.
const targets = (values: number[]): ManagedTarget[] => values.map((targetShareBp, i) => ({
  assetClassId: IDS[i]!, targetShareBp, bandBp: 0, bandMode: 'standard',
}));
const tiers: TargetTier[] = UPPERS.map((upToCents, i) => ({
  upToCents, targets: targets(WEIGHTS[i]!), label: `Musterstufe ${i + 1}`, condition: 'Nur Hinweis',
}));
const policy = { targets: targets(WEIGHTS[0]!), tiers, label: 'Synthetischer Stufenplan', reason: 'Unabhängige Testdaten' };
const panel = (page: Page) => page.getByRole('dialog', { name: 'Sollquoten bearbeiten', exact: true });
const row = (page: Page, number: number) => panel(page).getByRole('row', { name: `Stufe ${number}`, exact: true });
const save = (page: Page) => panel(page).getByRole('button', { name: 'Sollquoten speichern', exact: true });
async function get<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  return response.json() as Promise<T>;
}
const versions = async (page: Page) => (await get<{ versions: TargetVersion[] }>(page, '/api/asset-classes/targets')).versions;
const allocation = (page: Page) => get<PortfolioAllocationView>(page, '/api/portfolio/allocation');
async function seed(page: Page, path: string) {
  const opened = openDatabase(path);
  try {
    for (let i = 0; i < 6; i++) opened.db.insert(schema.assetClass).values({
      id: IDS[i]!, name: NAMES[i]!, isGroup: false, sortOrder: i,
    }).run();
    opened.db.insert(schema.account).values({
      id: 'stage-investment-cash', name: 'Stufenkonto', type: 'checking', role: 'investment',
      onBudget: false, currency: 'EUR', openingDate: BASE, openingBalanceCents: 50000000,
      allocationScope: 'included', allocationAssetClassId: IDS[0]!,
    }).run();
  } finally { opened.close(); }
  const response = await page.request.put('/api/asset-classes/targets', {
    headers: { Origin: new URL(page.url()).origin }, data: { validFrom: BASE, ...policy },
  });
  expect(response.status()).toBe(200);
  const current = await allocation(page);
  expect(current.classes.map((item) => item.id)).toEqual(IDS);
  expect(current.asOf).toBe(DAY);
  expect(current.policy.targetValidFrom).toBe(BASE);
  expect(current.policy.investmentCents).toBe(50000000);
  expect(current.policy.tierIndex).toBe(4);
}
function snapshot(path: string, audit = false) {
  const opened = openDatabase(path);
  try {
    return {
      accounts: opened.db.select().from(schema.account).all(),
      bookings: opened.db.select().from(schema.booking).all(),
      splits: opened.db.select().from(schema.bookingSplit).all(),
      trades: opened.db.select().from(schema.trade).all(),
      holdings: opened.db.select().from(schema.holding).all(),
      prices: opened.db.select().from(schema.price).all(),
      valuations: opened.db.select().from(schema.valuation).all(),
      ...(audit ? { audit: opened.db.select().from(schema.auditLog).all() } : {}),
    };
  } finally { opened.close(); }
}
function observeWrites(page: Page) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) {
      writes.push({ method: request.method(), path: url.pathname, body: request.postDataJSON() });
    }
  });
  return writes;
}
async function open(page: Page, theme: 'light' | 'dark') {
  await page.goto('/einstellungen/anlageklassen?panel=sollquoten');
  await page.evaluate((value) => { document.documentElement.dataset['theme'] = value; }, theme);
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(panel(page).getByRole('table', { name: 'Vermögensstufen', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function expectStatus(page: Page, number: number, expected: 'aktiv' | 'aus' | 'Entwurf') {
  const cell = row(page, number).locator('.stage-row-status');
  await expect(cell.locator(':scope > .stage-phone-label')).toHaveText('Status');
  // The separate phone label exists in textContent even when desktop CSS hides it.
  await expect.poll(() => cell.evaluate((element) => Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent).join('').trim())).toBe(expected);
}
async function fields(page: Page) {
  const table = panel(page).getByRole('table', { name: 'Vermögensstufen', exact: true });
  await expect(table.locator('tbody > tr')).toHaveCount(7);
  await expect(table.locator('thead th')).toHaveCount(13);
  for (let i = 0; i < 7; i++) {
    await expect(row(page, i + 1).getByLabel(`Stufe ${i + 1} · Ab Vermögen (€)`, { exact: true })).toHaveValue(LOWER_TEXT[i]!);
    await expect(row(page, i + 1).getByLabel(`Stufe ${i + 1} · Name (optional)`, { exact: true })).toHaveValue(`Musterstufe ${i + 1}`);
    for (let j = 0; j < 6; j++) {
      await expect(row(page, i + 1).getByLabel(`${NAMES[j]} · Soll (%)`, { exact: true })).toHaveValue(TEXT[i]![j]!);
    }
    await expect(row(page, i + 1).locator('.stage-row-sum')).toContainText('100,00 %');
  }
  await expectStatus(page, 5, 'aktiv');
  await expectStatus(page, 4, 'aus');
  await expect(panel(page).locator('.stage-saved-state')).toContainText('Version 01.09.2026');
}
async function controlBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  return box!;
}

for (const profile of ['desktop', 'phone'] as const) for (const theme of ['light', 'dark'] as const) {
  test(`526 all seven-by-six visible fields ${profile} ${theme}`, async ({ browser, isolatedLedger }, info) => {
    const options = {
      baseURL: isolatedLedger.origin, storageState: isolatedLedger.storageState,
      viewport: profile === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
      isMobile: profile === 'phone', hasTouch: profile === 'phone',
      deviceScaleFactor: profile === 'desktop' ? 1 : 3, colorScheme: theme,
    };
    const context = await browser.newContext(options);
    const page = await context.newPage();
    try {
      await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+02:00'));
      // Establish the real origin before the seed helper's same-origin mutation.
      await page.goto('/einstellungen/anlageklassen');
      await seed(page, isolatedLedger.databasePath);
      const before = snapshot(isolatedLedger.databasePath, true), previous = await versions(page);
      const writes = observeWrites(page);
      await open(page, theme);
      await fields(page);
      const geometry = await panel(page).evaluate((dialog) => {
        const box = (element: Element) => {
          const r = element.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
        };
        const body = dialog.querySelector('.panel-body');
        const table = dialog.querySelector('.stage-grid');
        if (!body || !table) throw new Error('Missing actual editor table/body');
        const controls = Array.from(table.querySelectorAll('input:not([type="radio"]),summary,button,label.stage-choose'))
          .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
        const submit = dialog.querySelector('button[type="submit"]');
        if (!submit) throw new Error('Missing actual save control');
        return {
          viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio,
          coarse: matchMedia('(pointer: coarse)').matches, rawTouchPoints: navigator.maxTouchPoints,
          documentWidth: document.documentElement.scrollWidth, dialog: box(dialog), body: box(body),
          bodyClientHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight, bodyScrollTop: body.scrollTop,
          bodyClientWidth: body.clientWidth, bodyScrollWidth: body.scrollWidth,
          table: box(table), tableClientWidth: table.clientWidth, tableScrollWidth: table.scrollWidth,
          controls: controls.map(box), submit: box(submit),
          submitCenterHit: (() => {
            const r = submit.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return hit !== null && submit.contains(hit);
          })(),
        };
      });
      await writeFile(info.outputPath(`526-${profile}-${theme}-geometry.json`), JSON.stringify({
        profile, theme, project: info.project.name, engine: browser.browserType().name(),
        browserVersion: browser.version(), suppliedContext: options, actual: geometry,
        qualification: 'Manual CSS viewport; raw touch capability is recorded, not a physical-device claim.',
      }, null, 2));
      expect(geometry.viewport).toEqual(options.viewport);
      expect(geometry.dpr).toBe(options.deviceScaleFactor);
      expect(geometry.coarse).toBe(options.hasTouch);
      expect(geometry.rawTouchPoints).toBeGreaterThanOrEqual(0);
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport.width);
      expect(geometry.tableScrollWidth).toBeLessThanOrEqual(geometry.tableClientWidth);
      expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.bodyClientWidth);
      expect(geometry.controls.length).toBeGreaterThanOrEqual(42);
      for (const box of geometry.controls) {
        expect(Number.isFinite(box.x + box.y + box.width + box.height)).toBe(true);
        expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(geometry.body.x);
        expect(box.right).toBeLessThanOrEqual(geometry.body.right);
        if (profile === 'desktop') {
          expect(box.y).toBeGreaterThanOrEqual(geometry.body.y);
          expect(box.bottom).toBeLessThanOrEqual(geometry.body.bottom);
        }
      }
      if (profile === 'desktop') {
        expect(geometry.bodyScrollTop).toBe(0);
        expect(geometry.bodyScrollHeight).toBeLessThanOrEqual(geometry.bodyClientHeight);
        expect(geometry.body.bottom).toBeLessThanOrEqual(geometry.dialog.bottom);
        expect(geometry.submitCenterHit).toBe(true);
        expect(geometry.submit.y).toBeGreaterThanOrEqual(geometry.body.y);
        expect(geometry.submit.bottom).toBeLessThanOrEqual(geometry.body.bottom);
        expect(geometry.dialog.y).toBeGreaterThanOrEqual(0);
        expect(geometry.dialog.bottom).toBeLessThanOrEqual(900);
        await expect(save(page)).toBeInViewport({ ratio: 1 });
      }
      // Keyboard uses the same native inputs/disclosures; no dispatch/forced click or scroll shim.
      await row(page, 1).getByLabel('Musterklasse A · Soll (%)', { exact: true }).focus();
      await page.keyboard.press('Tab');
      const optionsA = row(page, 1).getByLabel('Stufe 1 · Musterklasse A · Optionen', { exact: true });
      await expect(optionsA).toBeFocused();
      await controlBox(optionsA);
      await page.keyboard.press('Enter');
      await expect(row(page, 1).getByRole('checkbox', { name: 'Im Sollmodell berücksichtigen · Musterklasse A', exact: true })).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(optionsA.locator('..')).not.toHaveAttribute('open', '');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`526-${profile}-${theme}.png`) });
      expect(writes).toEqual([]);
      expect(await versions(page)).toEqual(previous);
      expect(snapshot(isolatedLedger.databasePath, true)).toEqual(before);
    } finally { await context.close(); }
  });
}

test('526 literal dated save keeps current activation, two row errors and real Undo', async ({ page, isolatedLedger }, info) => {
  await page.goto('/einstellungen/anlageklassen');
  await seed(page, isolatedLedger.databasePath);
  const beforeMoney = snapshot(isolatedLedger.databasePath), beforeVersions = await versions(page);
  const beforePolicy = (await allocation(page)).policy;
  const writes = observeWrites(page);
  await open(page, 'light'); await fields(page);
  await row(page, 5).getByLabel('Musterklasse A · Soll (%)', { exact: true }).fill('60');
  await row(page, 6).getByLabel('Musterklasse A · Soll (%)', { exact: true }).fill('55');
  await save(page).click();
  await expect(row(page, 5).getByRole('alert')).toHaveText('Stufe 5: Die Sollquoten ergeben 95,00 %. Erforderlich sind genau 100,00 %.');
  await expect(row(page, 6).getByRole('alert')).toHaveText('Stufe 6: Die Sollquoten ergeben 95,00 %. Erforderlich sind genau 100,00 %.');
  expect(writes).toEqual([]); expect(await versions(page)).toEqual(beforeVersions);
  await row(page, 5).getByLabel('Musterklasse A · Soll (%)', { exact: true }).fill('65');
  await row(page, 6).getByLabel('Musterklasse A · Soll (%)', { exact: true }).fill('60');
  await panel(page).getByLabel('Gültig ab', { exact: true }).fill('21.10.2026');
  await panel(page).getByLabel('Bezeichnung (optional)', { exact: true }).fill('Native Zukunftsversion');
  await expectStatus(page, 5, 'Entwurf');
  await expect(panel(page).locator('.stage-saved-state')).toContainText('Eingaben sind noch nicht angewendet.');
  const response = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/asset-classes/targets');
  await save(page).click(); expect((await response).status()).toBe(200);
  await expect(panel(page)).toBeHidden();
  expect(writes).toEqual([{ method: 'PUT', path: '/api/asset-classes/targets', body: {
    validFrom: FUTURE, ...policy, label: 'Native Zukunftsversion',
  } }]);
  const future = (await versions(page)).find((v) => v.validFrom === FUTURE);
  expect(future).toBeDefined(); expect(future!.tiers).toEqual(tiers);
  expect(future!.tiers.map((tier) => tier.upToCents)).toEqual(UPPERS);
  expect((await allocation(page)).policy).toEqual(beforePolicy);
  expect(snapshot(isolatedLedger.databasePath)).toEqual(beforeMoney);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(() => versions(page)).toEqual(beforeVersions);
  expect(snapshot(isolatedLedger.databasePath)).toEqual(beforeMoney);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect.poll(async () => (await versions(page)).find((v) => v.validFrom === FUTURE)?.tiers).toEqual(tiers);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(() => versions(page)).toEqual(beforeVersions);
  expect(writes.map(({ method, path }) => ({ method, path }))).toEqual([
    { method: 'PUT', path: '/api/asset-classes/targets' },
    { method: 'POST', path: '/api/undo' }, { method: 'POST', path: '/api/undo' }, { method: 'POST', path: '/api/undo' },
  ]);
  expect(snapshot(isolatedLedger.databasePath)).toEqual(beforeMoney);
  expect((await allocation(page)).policy).toEqual(beforePolicy);
  await writeFile(info.outputPath('526-dated-save-undo-safe.json'), JSON.stringify({
    future: FUTURE, unchangedCurrentVersion: BASE, literalUpperBounds: UPPERS,
    literalFirstTargets: WEIGHTS[0], literalFifthTargets: WEIGHTS[4],
    realUndoRedoUndoReached: true, finalPolicyRestored: true, accountBalancesAndBookingsUnchanged: true,
  }, null, 2));
});

test('526 real stale account-scope CAS keeps draft and writes no partial policy', async ({ page, isolatedLedger }, info) => {
  await page.goto('/einstellungen/anlageklassen'); await seed(page, isolatedLedger.databasePath);
  const previous = await versions(page), writes = observeWrites(page);
  await open(page, 'dark');
  await panel(page).locator('.stage-scope > summary').click();
  const account = panel(page).getByRole('checkbox', { name: 'Stufenkonto', exact: true });
  await expect(account).toBeChecked(); await account.uncheck();
  await panel(page).getByLabel('Bezeichnung (optional)', { exact: true }).fill('Lokaler CAS-Entwurf');
  // A real concurrent account write, made outside the page, invalidates its captured expectedScope.
  const changed = await page.request.patch('/api/accounts/stage-investment-cash', {
    headers: { Origin: isolatedLedger.origin }, data: { allocationScope: 'excluded' },
  });
  expect(changed.status()).toBe(200);
  const beforeRejectedWrite = snapshot(isolatedLedger.databasePath, true);
  const response = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/asset-classes/targets');
  await save(page).click(); expect((await response).status()).toBe(409);
  await expect(panel(page).getByRole('alert')).toHaveText('Die Kontenauswahl wurde inzwischen geändert. Bitte neu laden.');
  await expect(panel(page).getByLabel('Bezeichnung (optional)', { exact: true })).toHaveValue('Lokaler CAS-Entwurf');
  await expect(account).not.toBeChecked();
  expect(writes).toEqual([{ method: 'PUT', path: '/api/asset-classes/targets', body: {
    validFrom: DAY, ...policy, label: 'Lokaler CAS-Entwurf', allocationAccounts: [{
      id: 'stage-investment-cash', included: false, cashClassId: IDS[0],
      expectedScope: 'included', expectedCashClassId: IDS[0],
    }],
  } }]);
  expect(await versions(page)).toEqual(previous);
  expect(snapshot(isolatedLedger.databasePath, true)).toEqual(beforeRejectedWrite);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toContainText('Ungespeicherte Änderungen verwerfen?');
  await panel(page).getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await open(page, 'dark'); await panel(page).locator('.stage-scope > summary').click();
  await expect(panel(page).getByRole('checkbox', { name: 'Stufenkonto', exact: true })).not.toBeChecked();
  expect(snapshot(isolatedLedger.databasePath, true)).toEqual(beforeRejectedWrite);
  await writeFile(info.outputPath('526-real-cas-safe.json'), JSON.stringify({
    real409: true, expectedScope: 'included', actualConcurrentScope: 'excluded',
    noPartialVersionOrAudit: true, localDraftPreservedUntilExplicitDiscard: true,
  }, null, 2));
});
