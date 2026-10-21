// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import type { ManagedTarget, TargetTier } from '@budget/domain';
import type { PortfolioAllocationView, TargetVersion } from './allocation-api';
import type { AccountList, AccountRow } from '../ledger/types';
import { accountsQuery } from '../ledger/queries';
import { TargetEditor } from './target-panel';

const DAY = '2026-10-20';
const OLD_DAY = '2026-09-01';
const STANDARD_BAND = 'standard' as const;
const CLASS_IDS = ['stage-a', 'stage-b', 'stage-c', 'stage-d', 'stage-e', 'stage-f'];
const CLASS_NAMES = [
  'Musterklasse A',
  'Musterklasse B',
  'Musterklasse C',
  'Musterklasse D',
  'Musterklasse E',
  'Musterklasse F',
];
// Independent storage/bp literals: do not obtain expected boundaries from production helpers.
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
const SHARES = [
  ['85,00', '15,00', '0,00', '0,00', '0,00', '0,00'],
  ['75,00', '5,00', '20,00', '0,00', '0,00', '0,00'],
  ['75,00', '5,00', '20,00', '0,00', '0,00', '0,00'],
  ['75,00', '5,00', '20,00', '0,00', '0,00', '0,00'],
  ['65,00', '5,00', '20,00', '10,00', '0,00', '0,00'],
  ['60,00', '5,00', '20,00', '15,00', '0,00', '0,00'],
  ['60,00', '5,00', '20,00', '15,00', '0,00', '0,00'],
];
function targets(weights: readonly number[]): ManagedTarget[] {
  return CLASS_IDS.map((assetClassId, i) => ({
    assetClassId,
    targetShareBp: weights[i]!,
    bandBp: 0,
    bandMode: 'standard',
  }));
}
function fixture(invalidRows = false) {
  const tiers: TargetTier[] = UPPERS.map((upToCents, i) => ({
    upToCents,
    targets: targets(WEIGHTS[i]!),
    label: `Musterstufe ${i + 1}`,
    condition: 'Nur Hinweis',
  }));
  if (invalidRows) {
    // Two different, initially off-focus rows: each is exactly 9500bp, never normalised.
    tiers[4]!.targets = targets([6000, 500, 2000, 1000, 0, 0]);
    tiers[5]!.targets = targets([5500, 500, 2000, 1500, 0, 0]);
  }
  const version = {
    validFrom: OLD_DAY,
    targets: targets(WEIGHTS[0]!).map((target, i) => ({
      id: `old-target-${i}`,
      assetClassId: target.assetClassId,
      validFrom: OLD_DAY,
      targetShareBp: target.targetShareBp,
      bandBp: 0,
      bandMode: STANDARD_BAND,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      deletedAt: null,
    })),
    sumBp: 10000,
    tiers,
    label: 'Synthetischer Stufenplan',
    reason: 'Unabhängige Testdaten',
    createdAt: '2026-09-01T00:00:00.000Z',
    auditGroupId: 'old-stage-group',
  } satisfies TargetVersion;
  const view = {
    asOf: DAY,
    policy: {
      asOf: DAY,
      R13: { maxBandBp: 500, relativeBandPct: 25, badFactorPct: 200 },
      R14: { singleBp: 1000, platformBp: 2000, badOverBp: 500 },
      R15: { limitBp: 1000, badOverBp: 300 },
      targets: CLASS_IDS.map((assetClass, i) => ({
        assetClass,
        targetBp: WEIGHTS[4]![i]!,
        bandBp: 0,
        bandMode: STANDARD_BAND,
      })),
      targetValidFrom: OLD_DAY,
      targetLabel: version.label,
      tierIndex: 4,
      investmentCents: 50000000,
      wealthStage: { label: 'Musterstufe 5', fromCents: 50000000, inBuffer: false },
    },
    valuationQuality: 'exact',
    quality: {
      valuationQuality: 'exact',
      confidence: 'exact',
      classification: 'complete',
      unclassifiedValueCents: 0,
      unclassifiedExposureCents: 0,
      unclassifiedShareBp: 0,
      unclassifiedProductCount: 0,
      unclassifiedSecurityIds: [],
      estimatedValueCents: 0,
      estimatedShareBp: 0,
      estimatedSecurityIds: [],
      staleSecurityIds: [],
      missingPriceSecurityIds: [],
      missingFxSecurityIds: [],
      missingFxAccountIds: [],
    },
    universe: { accountIds: ['stage-depot', 'stage-cash'], securityIds: [] },
    valueCents: 50000000,
    status: 'known',
    missing: [],
    classes: CLASS_IDS.map((id, i) => ({
      id,
      name: CLASS_NAMES[i]!,
      assignedSecurities: [],
      targetBp: WEIGHTS[4]![i]!,
      bandBp: 0,
      validFrom: OLD_DAY,
    })),
    risk: null,
    names: { securities: {}, institutions: {} },
  } satisfies PortfolioAllocationView;
  return { view, version };
}
function account(
  id: string,
  name: string,
  type: AccountRow['type'],
  allocationScope: 'included' | 'excluded',
): AccountRow {
  return {
    id,
    name,
    type,
    allocationScope,
    allocationAssetClassId: type === 'brokerage' ? null : 'stage-d',
    role: 'investment',
    onBudget: false,
    currency: 'EUR',
    institutionId: null,
    openingBalanceCents: id === 'stage-cash' ? 50000000 : 0,
    openingDate: OLD_DAY,
    creditLimitCents: null,
    overdraftLimitCents: null,
    interestRateBp: null,
    termEnd: null,
    monthlyFeeCents: null,
    interestKind: null,
    installmentCents: null,
    termStart: null,
    originalAmountCents: null,
    sortOrder: 0,
    closedAt: null,
    note: null,
    balanceCents: id === 'stage-cash' ? 50000000 : 0,
    clearedCents: id === 'stage-cash' ? 50000000 : 0,
    unclearedCents: 0,
    scheduledCents: 0,
    holdingsCents: 0,
    valueEurCents: id === 'stage-cash' ? 50000000 : 0,
    missingFxCurrencies: [],
    missingPriceSecurityIds: [],
    bookingCount: 0,
    pendingCount: 0,
    lastReconciledOn: null,
  };
}
const ACCOUNTS = {
  asOf: DAY,
  accounts: [
    account('stage-depot', 'Musterdepot', 'brokerage', 'included'),
    account('stage-cash', 'Musteranlagecash', 'checking', 'included'),
    account('stage-wallet', 'Ausgeschlossene Musterbörse', 'cash', 'excluded'),
  ],
  netWorthEurCents: 50000000,
  missingFxCurrencies: [],
  missingPriceSecurityIds: [],
} satisfies AccountList;
const clients: QueryClient[] = [];
const unexpected: string[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
  setAmountsHidden(false);
  expect(unexpected.splice(0)).toEqual([]);
});
async function mount(invalidRows = false) {
  setAmountsHidden(false);
  const data = fixture(invalidRows);
  const writes: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(async (input, options) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, 'http://localhost').pathname;
      const method = options?.method ?? 'GET';
      if (method === 'GET' && path === '/api/accounts') return Response.json(ACCOUNTS);
      if (method === 'PUT' && path === '/api/asset-classes/targets') {
        writes.push({ path, body: JSON.parse(String(options?.body)) });
        return Response.json({ groupId: 'stage-write-group' });
      }
      unexpected.push(`${method} ${path}`);
      throw new Error(`Unexpected synthetic transport: ${method} ${path}`);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(accountsQuery().queryKey, ACCOUNTS);
  const onSaved = vi.fn();
  const root = createRootRoute({ component: () => <Outlet /> });
  const editor = createRoute({
    getParentRoute: () => root,
    path: '/einstellungen/anlageklassen',
    component: () => (
      <TargetEditor
        view={data.view}
        versions={[data.version]}
        onDirty={() => {}}
        onBusy={() => {}}
        onSaved={onSaved}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([editor]),
    history: createMemoryHistory({ initialEntries: ['/einstellungen/anlageklassen'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const dateLabel = await screen.findByText('Gültig ab', { selector: 'label' });
  const dateField = dateLabel.closest('.field-row');
  if (!(dateField instanceof HTMLElement))
    throw new TypeError('Expected the real labelled effective-date field');
  const date = within(dateField).getByLabelText('Gültig ab');
  expect(date).toBeInstanceOf(HTMLInputElement);
  expect(date.getAttribute('type')).toBe('text');
  expect(date.getAttribute('inputmode')).toBe('text');
  expect(date.getAttribute('placeholder')).toBe('TT.MM.JJJJ');
  if (!(date instanceof HTMLInputElement))
    throw new TypeError('Expected the existing native date input');
  expect(date.value).toBe('20.10.2026');
  const save = screen.getByRole('button', { name: 'Sollquoten speichern' });
  expect(save).toBeInstanceOf(HTMLButtonElement);
  if (!(save instanceof HTMLButtonElement))
    throw new TypeError('Expected the existing native save button');
  expect(save.disabled).toBe(false);
  return { user: userEvent.setup(), writes, save, onSaved, data };
}

it('saves the complete valid seven-by-six dated policy through the real existing editor', async () => {
  const { user, save, writes, onSaved } = await mount();
  await user.click(save);
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(writes).toEqual([
    {
      path: '/api/asset-classes/targets',
      body: {
        validFrom: DAY,
        label: 'Synthetischer Stufenplan',
        reason: 'Unabhängige Testdaten',
        targets: targets([8500, 1500, 0, 0, 0, 0]),
        tiers: UPPERS.map((upToCents, i) => ({
          upToCents,
          targets: targets(WEIGHTS[i]!),
          label: `Musterstufe ${i + 1}`,
          condition: 'Nur Hinweis',
        })),
      },
    },
  ]);
});

it('shows all seven rows and six class controls together instead of a selected-stage form', async () => {
  const { writes } = await mount();
  expect(writes).toEqual([]);
  const table = screen.getByRole('table', { name: 'Vermögensstufen' });
  const rows = within(table)
    .getAllByRole('row')
    .filter((row) => row.querySelector('td'));
  expect(rows).toHaveLength(7);
  for (let rowIndex = 0; rowIndex < 7; rowIndex++) {
    const row = within(table).getByRole('row', { name: `Stufe ${rowIndex + 1}` });
    for (let classIndex = 0; classIndex < 6; classIndex++) {
      const input = within(row).getByLabelText(`${CLASS_NAMES[classIndex]} · Soll (%)`);
      expect(input).toBeInstanceOf(HTMLInputElement);
      if (!(input instanceof HTMLInputElement))
        throw new TypeError('Expected a native class-share input');
      expect(input.value).toBe(SHARES[rowIndex]![classIndex]);
    }
  }
  expect(screen.queryByRole('combobox', { name: 'Stufe bearbeiten' })).toBeNull();
  expect(writes).toEqual([]);
});

it('keeps distinct 95-percent errors on both invalid off-focus stage rows and sends no policy', async () => {
  const { user, save, writes, onSaved } = await mount(true);
  await user.click(save);
  expect(writes).toEqual([]);
  expect(onSaved).not.toHaveBeenCalled();
  const fifth = screen.getByText(
    'Stufe 5: Die Sollquoten ergeben 95,00 %. Erforderlich sind genau 100,00 %.',
  );
  const sixth = screen.getByText(
    'Stufe 6: Die Sollquoten ergeben 95,00 %. Erforderlich sind genau 100,00 %.',
  );
  expect(fifth.getAttribute('role')).toBe('alert');
  expect(sixth.getAttribute('role')).toBe('alert');
  expect(fifth.closest('tr')?.getAttribute('aria-label')).toBe('Stufe 5');
  expect(sixth.closest('tr')?.getAttribute('aria-label')).toBe('Stufe 6');
  expect(writes).toEqual([]);
});

it('retains an explicitly chosen fifth row, unmanaged absence and custom zero/300bp when becoming static', async () => {
  const { user, writes, onSaved, save } = await mount();
  const row = within(screen.getByRole('table', { name: 'Vermögensstufen' })).getByRole('row', {
    name: 'Stufe 5',
  });
  const options = async (name: string) => {
    const summary = within(row).getByLabelText(`Stufe 5 · ${name} · Optionen`);
    await user.click(summary);
    const details = summary.closest('details');
    if (!details) throw new TypeError('Expected the real stage-cell disclosure');
    return within(details);
  };
  const a = await options('Musterklasse A');
  await user.selectOptions(a.getByRole('combobox', { name: 'Musterklasse A · Band' }), 'custom');
  const zeroBand = a.getByLabelText('Musterklasse A · Band (Prozentpunkte)');
  if (!(zeroBand instanceof HTMLInputElement))
    throw new TypeError('Expected the native band field');
  expect(zeroBand.value).toBe('0,00');
  const b = await options('Musterklasse B');
  await user.selectOptions(b.getByRole('combobox', { name: 'Musterklasse B · Band' }), 'custom');
  const customBand = b.getByLabelText('Musterklasse B · Band (Prozentpunkte)');
  await user.clear(customBand);
  await user.paste('3,00');
  if (!(customBand instanceof HTMLInputElement))
    throw new TypeError('Expected the native custom band field');
  expect(customBand.value).toBe('3,00');
  const e = await options('Musterklasse E');
  await user.click(
    e.getByRole('checkbox', { name: 'Im Sollmodell berücksichtigen · Musterklasse E' }),
  );
  expect(within(row).queryByLabelText('Musterklasse E · Soll (%)')).toBeNull();
  await user.click(
    within(row).getByRole('radio', { name: 'Stufe 5 für einfache Sollquoten behalten' }),
  );
  const dynamicLabel = screen.getByText('Dynamische Stufen nach Anlagesumme', {
    selector: 'label',
  });
  await user.click(
    within(dynamicLabel).getByRole('checkbox', { name: 'Dynamische Stufen nach Anlagesumme' }),
  );
  expect(screen.queryByRole('table', { name: 'Vermögensstufen' })).toBeNull();
  expect(screen.queryByLabelText('Musterklasse E · Soll (%)')).toBeNull();
  const managedZero = screen.getByLabelText('Musterklasse F · Soll (%)');
  if (!(managedZero instanceof HTMLInputElement))
    throw new TypeError('Expected managed zero, not unmanaged');
  expect(managedZero.value).toBe('0,00');
  expect(writes).toEqual([]);
  expect(save.isConnected).toBe(true);
  expect(save.textContent).toBe('Sollquoten speichern');
  await user.click(save);
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(writes).toEqual([
    {
      path: '/api/asset-classes/targets',
      body: {
        validFrom: DAY,
        label: 'Synthetischer Stufenplan',
        reason: 'Unabhängige Testdaten',
        tiers: [],
        targets: [
          { assetClassId: 'stage-a', targetShareBp: 6500, bandBp: 0, bandMode: 'custom' },
          { assetClassId: 'stage-b', targetShareBp: 500, bandBp: 300, bandMode: 'custom' },
          { assetClassId: 'stage-c', targetShareBp: 2000, bandBp: 0, bandMode: 'standard' },
          { assetClassId: 'stage-d', targetShareBp: 1000, bandBp: 0, bandMode: 'standard' },
          { assetClassId: 'stage-f', targetShareBp: 0, bandBp: 0, bandMode: 'standard' },
        ],
      },
    },
  ]);
});

it('hides a chosen column without converting its managed zero into unmanaged targets', async () => {
  const { user, writes, onSaved } = await mount();
  const summary = screen.getByText('Anlageklassenspalten', { selector: 'summary' });
  await user.click(summary);
  const columns = summary.closest('details');
  if (!(columns instanceof HTMLDetailsElement))
    throw new TypeError('Expected the real class-column disclosure');
  expect(columns.open).toBe(true);
  await user.click(within(columns).getByRole('checkbox', { name: 'Musterklasse F anzeigen' }));
  const table = screen.getByRole('table', { name: 'Vermögensstufen' });
  expect(within(table).queryByRole('columnheader', { name: 'Musterklasse F %' })).toBeNull();
  expect(writes).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Sollquoten speichern' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(writes).toEqual([
    {
      path: '/api/asset-classes/targets',
      body: {
        validFrom: DAY,
        label: 'Synthetischer Stufenplan',
        reason: 'Unabhängige Testdaten',
        targets: targets([8500, 1500, 0, 0, 0, 0]),
        tiers: UPPERS.map((upToCents, i) => ({
          upToCents,
          targets: targets(WEIGHTS[i]!),
          label: `Musterstufe ${i + 1}`,
          condition: 'Nur Hinweis',
        })),
      },
    },
  ]);
});

it('separates the supplied saved active stage from a renamed draft without writing', async () => {
  const { user, writes } = await mount();
  const table = screen.getByRole('table', { name: 'Vermögensstufen' });
  const fifth = within(table).getByRole('row', { name: 'Stufe 5' });
  const fourth = within(table).getByRole('row', { name: 'Stufe 4' });
  expect(within(fifth).getByText('aktiv')).toBeTruthy();
  expect(within(fourth).getByText('aus')).toBeTruthy();
  const name = within(fifth).getByLabelText('Stufe 5 · Name (optional)');
  await user.clear(name);
  await user.paste('Noch nicht angewendet');
  if (!(name instanceof HTMLInputElement)) throw new TypeError('Expected the stage name input');
  expect(name.value).toBe('Noch nicht angewendet');
  expect(within(fifth).getByText('Entwurf')).toBeTruthy();
  expect(within(fifth).queryByText('aktiv')).toBeNull();
  const saved = screen.getByText(/Gespeicherter Stand 20\.10\.2026/);
  expect(saved.textContent).toContain('Version 01.09.2026');
  expect(saved.textContent).toContain('Musterstufe 5 · aktiv');
  expect(saved.textContent).toContain('Eingaben sind noch nicht angewendet.');
  expect(writes).toEqual([]);
});

it('separates the supplied saved active stage from a future-dated draft without writing', async () => {
  const { user, writes } = await mount();
  const table = screen.getByRole('table', { name: 'Vermögensstufen' });
  const fifth = within(table).getByRole('row', { name: 'Stufe 5' });
  const fourth = within(table).getByRole('row', { name: 'Stufe 4' });
  expect(within(fifth).getByText('aktiv')).toBeTruthy();
  expect(within(fourth).getByText('aus')).toBeTruthy();
  const name = within(fifth).getByLabelText('Stufe 5 · Name (optional)');
  if (!(name instanceof HTMLInputElement)) throw new TypeError('Expected the stage name input');
  expect(name.value).toBe('Musterstufe 5');
  const date = screen.getByLabelText('Gültig ab');
  await user.clear(date);
  await user.paste('21.10.2026');
  if (!(date instanceof HTMLInputElement)) throw new TypeError('Expected the date input');
  expect(date.value).toBe('21.10.2026');
  expect(within(fifth).getByText('Entwurf')).toBeTruthy();
  expect(within(fifth).queryByText('aktiv')).toBeNull();
  expect(name.value).toBe('Musterstufe 5');
  const saved = screen.getByText(/Gespeicherter Stand 20\.10\.2026/);
  expect(saved.textContent).toContain('Version 01.09.2026');
  expect(saved.textContent).toContain('Musterstufe 5 · aktiv');
  expect(saved.textContent).toContain('Eingaben sind noch nicht angewendet.');
  expect(writes).toEqual([]);
});
