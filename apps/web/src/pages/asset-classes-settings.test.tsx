// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetClassesSettings } from './asset-classes-settings';

// The settings page links to other pages; the router is not part of this test.
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children }: { to: string; children?: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const CLASSES = [
  { id: 'ac1', name: 'Aktien Muster', sortOrder: 1, inUse: true },
  { id: 'ac2', name: 'Anleihen Muster', sortOrder: 2, inUse: false },
];
const TIERS = [
  {
    id: 'tier-1000000',
    upToCents: 1_000_000,
    sumBp: 10_000,
    shares: [
      { assetClassId: 'ac1', targetShareBp: 9_000, bandBp: 0 },
      { assetClassId: 'ac2', targetShareBp: 1_000, bandBp: 200 },
    ],
  },
  {
    id: 'tier-open',
    upToCents: null,
    sumBp: 10_000,
    shares: [
      { assetClassId: 'ac1', targetShareBp: 6_000, bandBp: 0 },
      { assetClassId: 'ac2', targetShareBp: 4_000, bandBp: 0 },
    ],
  },
];
const ACTIVE = {
  source: 'tiers',
  tierLabel: 'über 10.000 €',
  upToCents: null,
  position: 2,
  count: 2,
  investmentSumCents: 1_725_000,
  sumUnavailable: false,
};
const SECURITIES = [
  { id: 's1', name: 'ETF Muster', isin: 'XX0000000001', symbol: null, assetClassId: 'ac1' },
  { id: 's2', name: 'Fonds Muster', isin: null, symbol: 'FM', assetClassId: null },
];

interface Call {
  method: string;
  path: string;
  body: unknown;
}
let calls: Call[];
let tiers: unknown[];

beforeEach(() => {
  calls = [];
  tiers = TIERS;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
      calls.push({ method, path, body });
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (method === 'GET' && path === '/api/asset-classes')
        return json({ assetClasses: CLASSES, targetSet: ACTIVE });
      if (method === 'GET' && path === '/api/asset-classes/tiers')
        return json({ tiers, active: tiers.length > 0 ? ACTIVE : { ...ACTIVE, source: 'none' } });
      if (method === 'GET' && path === '/api/securities') return json({ securities: SECURITIES });
      return json({ groupId: 'grp', order: [], assetClass: CLASSES[0] });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AssetClassesSettings />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
const writes = () => calls.filter((c) => c.method !== 'GET');
const tierBody = (index = 0) => (writes()[index]!.body as { tiers: unknown[] }).tiers;

describe('Einstellungen › Anlageklassen', () => {
  it('shows classes, securities and the tiers with the active one marked', async () => {
    page();
    await screen.findByLabelText('Name der Anlageklasse Aktien Muster');
    expect(await screen.findByLabelText('Anlageklasse von ETF Muster')).toHaveProperty(
      'value',
      'ac1',
    );
    expect(screen.getByLabelText('Anlageklasse von Fonds Muster')).toHaveProperty('value', '');
    await screen.findByLabelText('Gilt bis Anlagesumme (€), Zielset 1');
    expect(
      (screen.getByLabelText('Gilt bis Anlagesumme (€), Zielset 1') as HTMLInputElement).value,
    ).toBe('10.000,00');
    expect(screen.getByTestId('target-set').textContent).toContain(
      'Aktives Zielset: über 10.000 € (Stufe 2 von 2)',
    );
    expect(screen.getByTestId('target-set').textContent).toContain('17.250 €');
    // Only the second set is marked active.
    expect(screen.getAllByText('aktiv')).toHaveLength(1);
    expect(
      (screen.getByLabelText('Aktien Muster · Soll (%), Zielset 2') as HTMLInputElement).value,
    ).toBe('60,00');
    expect(
      (
        screen.getByLabelText(
          'Anleihen Muster · Band ± (Prozentpunkte), Zielset 1',
        ) as HTMLInputElement
      ).value,
    ).toBe('2,00');
  });

  it('renames, creates and reorders asset classes', async () => {
    page();
    const name = await screen.findByLabelText('Name der Anlageklasse Aktien Muster');
    await userEvent.clear(name);
    await userEvent.type(name, 'Aktien Welt');
    await userEvent.click(screen.getAllByRole('button', { name: 'Umbenennen' })[0]!);
    await screen.findByText('Anlageklasse in „Aktien Welt“ umbenannt.');
    expect(writes()[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/asset-classes/ac1',
      body: { name: 'Aktien Welt' },
    });
    await userEvent.type(screen.getByLabelText('Neue Anlageklasse'), 'Rohstoffe');
    await userEvent.click(screen.getByRole('button', { name: 'Anlageklasse anlegen' }));
    await screen.findByText('Anlageklasse „Rohstoffe“ angelegt.');
    expect(writes()[1]).toMatchObject({ method: 'POST', body: { name: 'Rohstoffe' } });
    await userEvent.click(screen.getByRole('button', { name: 'Anleihen Muster nach oben' }));
    await screen.findByText('Reihenfolge der Anlageklassen gespeichert.');
    expect(writes()[2]).toMatchObject({
      method: 'PATCH',
      path: '/api/asset-classes/order',
      body: { ids: ['ac2', 'ac1'] },
    });
  });

  it('assigns a security to a class and takes it out again', async () => {
    page();
    const select = await screen.findByLabelText('Anlageklasse von Fonds Muster');
    await userEvent.selectOptions(select, 'ac2');
    await screen.findByText('Fonds Muster der Anlageklasse „Anleihen Muster“ zugeordnet.');
    expect(writes()[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/securities/s2',
      body: { assetClassId: 'ac2' },
    });
    await userEvent.selectOptions(screen.getByLabelText('Anlageklasse von ETF Muster'), '');
    await screen.findByText('ETF Muster ohne Anlageklasse.');
    expect(writes()[1]).toMatchObject({ path: '/api/securities/s1', body: { assetClassId: null } });
  });

  it('refuses tiers that do not add up to 100 % and saves a corrected set in one PUT', async () => {
    page();
    const share = await screen.findByLabelText('Aktien Muster · Soll (%), Zielset 2');
    await userEvent.clear(share);
    await userEvent.type(share, '50');
    expect(screen.getByText(/Summe: 90,00 %/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Zielsets speichern' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Zielset 2: Die Sollanteile müssen zusammen genau 100,00 % ergeben.',
    );
    expect(writes()).toEqual([]);
    const other = screen.getByLabelText('Anleihen Muster · Soll (%), Zielset 2');
    await userEvent.clear(other);
    await userEvent.type(other, '50');
    await userEvent.click(screen.getByRole('button', { name: 'Zielsets speichern' }));
    await screen.findByText('Zielsets gespeichert.');
    expect(writes()[0]).toMatchObject({ method: 'PUT', path: '/api/asset-classes/tiers' });
    expect(tierBody()).toEqual([
      {
        upToCents: 1_000_000,
        targets: [
          { assetClassId: 'ac1', targetShareBp: 9_000 },
          { assetClassId: 'ac2', targetShareBp: 1_000, bandBp: 200 },
        ],
      },
      {
        upToCents: null,
        targets: [
          { assetClassId: 'ac1', targetShareBp: 5_000 },
          { assetClassId: 'ac2', targetShareBp: 5_000 },
        ],
      },
    ]);
  });

  it('adds a tier with a threshold and refuses duplicate thresholds', async () => {
    page();
    await screen.findByLabelText('Gilt bis Anlagesumme (€), Zielset 1');
    await userEvent.click(screen.getByRole('button', { name: 'Zielset hinzufügen' }));
    const upTo = await screen.findByLabelText('Gilt bis Anlagesumme (€), Zielset 3');
    await userEvent.type(upTo, '10000');
    await userEvent.type(screen.getByLabelText('Aktien Muster · Soll (%), Zielset 3'), '70');
    await userEvent.type(screen.getByLabelText('Anleihen Muster · Soll (%), Zielset 3'), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Zielsets speichern' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Zielset 3: Diese Anlagesumme gibt es schon.',
    );
    await userEvent.clear(upTo);
    await userEvent.type(upTo, '5000');
    await userEvent.click(screen.getByRole('button', { name: 'Zielsets speichern' }));
    await screen.findByText('Zielsets gespeichert.');
    expect(tierBody().map((t) => (t as { upToCents: number | null }).upToCents)).toEqual([
      1_000_000,
      null,
      500_000,
    ]);
  });

  it('removing every set stores an empty list and says the dated targets apply again', async () => {
    page();
    await screen.findByLabelText('Gilt bis Anlagesumme (€), Zielset 1');
    for (let i = 0; i < 2; i += 1)
      await userEvent.click(screen.getAllByRole('button', { name: 'Zielset entfernen' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Zielsets speichern' }));
    await screen.findByText('Zielsets entfernt, die datierten Sollquoten gelten wieder.');
    expect(tierBody()).toEqual([]);
  });

  it('says so when no tier exists yet', async () => {
    tiers = [];
    page();
    expect(
      await screen.findByText('Es sind keine Zielsets angelegt; die datierten Sollquoten gelten.'),
    ).toBeTruthy();
    expect(screen.getByText(/Noch kein Zielset/)).toBeTruthy();
  });
});
