// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import type { InflationReport } from '@budget/db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InflationBasketSettingsPage } from './inflation-basket-settings';

vi.mock('./placeholder-page', () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

type Row = InflationReport['basketSettings'][number];
let row: Row;
let writes: Record<string, unknown>[];
let fail: boolean;
let pauseWrite: Promise<void> | undefined;
beforeEach(() => {
  writes = [];
  fail = false;
  pauseWrite = undefined;
  row = {
    id: 'food',
    name: 'Lebensmittel Muster',
    groupId: 'daily',
    groupName: 'Alltag Muster',
    class: 'need',
    inclusion: null,
    trailingMean: null,
    method: null,
    coicop: [],
    included: false,
    reason: 'Variable Kategorie: Menge und Preis nicht trennbar',
    automaticReason: 'Variable Kategorie: Menge und Preis nicht trennbar',
    excludedPayeeIds: [],
    payees: [],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path: string, init: RequestInit = {}) => {
      if (init.method === 'PUT') {
        const { changes } = JSON.parse(String(init.body)) as { changes: Record<string, unknown>[] };
        writes.push(...changes);
        await pauseWrite;
        if (fail)
          return new Response(
            JSON.stringify({ error: 'failed', message: 'Speichern fehlgeschlagen.' }),
            { status: 500 },
          );
        row = { ...row, ...changes[0] };
        return new Response(JSON.stringify({ groupId: 'synthetic-group' }));
      }
      return new Response(JSON.stringify({ categories: [row] }));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function page() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <InflationBasketSettingsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return within(await screen.findByTestId('basket-category-food'));
}
async function pickFirst(ui: ReturnType<typeof within>) {
  await userEvent.click(ui.getByText('Preis aus der offiziellen Statistik'));
  await userEvent.type(ui.getByRole('combobox', { name: 'Preisgruppe 1' }), 'Nahrung');
  await userEvent.click(ui.getByRole('option', { name: '01.1 Nahrungsmittel' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  await screen.findByText('Warenkorb gespeichert.');
}

it('explains the current effect with one choice and collapsed optional blocks', async () => {
  const ui = await page();
  // jsdom does not hide the contents of closed native details from role queries.
  expect(ui.getAllByRole('combobox').filter((el) => el.tagName === 'SELECT')).toHaveLength(1);
  expect(ui.queryByRole('checkbox')).toBeNull();
  expect(ui.getByLabelText('Zählt mit: Lebensmittel Muster')).toBeTruthy();
  expect(ui.getByText(/Zählt nicht mit: wechselnde Menge/)).toBeTruthy();
  expect(ui.getByText('Preis aus der offiziellen Statistik').closest('details')?.open).toBe(false);
  expect(ui.getByText('Ausnahmen (0)').closest('details')?.open).toBe(false);
  expect(
    screen.getByText(
      'Im Warenkorb: 0 Kategorien · Automatisch: 0 · Von dir gesetzt: 0 · Ausgeschlossen: 1',
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Zur persönlichen Inflation' }).getAttribute('href'),
  ).toBe('/reports/inflation');
});

it('picking a class switches to VPI and saves 100%, then defaults two classes to 50–50', async () => {
  const ui = await page();
  await pickFirst(ui);
  expect(writes[0]).toEqual({
    categoryId: 'food',
    method: 'cpi',
    coicop: [{ code: '01.1', shareBp: 10000 }],
  });
  expect(ui.queryByLabelText('Anteil Preisgruppe 1 (%)')).toBeNull();
  expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy();
  await userEvent.type(ui.getByRole('combobox', { name: 'Preisgruppe 2 (optional)' }), 'Körper');
  await userEvent.click(ui.getByRole('option', { name: '12.1.3 Körperpflegeartikel' }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual({
    categoryId: 'food',
    method: 'cpi',
    coicop: [
      { code: '01.1', shareBp: 5000 },
      { code: '12.1.3', shareBp: 5000 },
    ],
  });
  const share = await ui.findByLabelText('Anteil Preisgruppe 1 (%)');
  await userEvent.clear(share);
  await userEvent.type(share, '80');
  expect(writes).toHaveLength(2);
  await userEvent.tab();
  await waitFor(() => expect(writes).toHaveLength(3));
  expect(writes[2]?.['coicop']).toEqual([
    { code: '01.1', shareBp: 8000 },
    { code: '12.1.3', shareBp: 2000 },
  ]);
});

it('rejects invalid shares and returns to booking prices when the last class is removed', async () => {
  row.method = 'cpi';
  row.coicop = [
    { code: '01.1', shareBp: 5000 },
    { code: '12.1.3', shareBp: 5000 },
  ];
  const ui = await page();
  const share = ui.getByLabelText('Anteil Preisgruppe 1 (%)');
  await userEvent.clear(share);
  await userEvent.type(share, '100');
  await userEvent.tab();
  expect(writes).toHaveLength(0);
  expect(ui.getByText(/Bitte einen Anteil zwischen/)).toBeTruthy();
  for (const name of ['Preisgruppe 2 (optional)', 'Preisgruppe 1']) {
    await userEvent.click(ui.getByRole('combobox', { name }));
    await userEvent.click(ui.getByRole('option', { name: 'Keine Preisgruppe' }));
    await waitFor(() => expect(row.coicop).toHaveLength(name === 'Preisgruppe 1' ? 0 : 1));
  }
  expect(writes.at(-1)).toEqual({ categoryId: 'food', method: null, coicop: [] });
});

it('keeps the saved class when an automatic write fails', async () => {
  fail = true;
  const ui = await page();
  await userEvent.click(ui.getByText('Preis aus der offiziellen Statistik'));
  await userEvent.type(ui.getByRole('combobox', { name: 'Preisgruppe 1' }), 'Nahrung');
  await userEvent.click(ui.getByRole('option', { name: '01.1 Nahrungsmittel' }));
  await screen.findByText('Speichern fehlgeschlagen.');
  expect((ui.getByRole('combobox', { name: 'Preisgruppe 1' }) as HTMLInputElement).value).toBe('');
  expect(row.method).toBeNull();
});

it('switches an existing comparison mapping to VPI when its class is picked again', async () => {
  row.coicop = [{ code: '01.1', shareBp: 10000 }];
  const ui = await page();
  await userEvent.type(ui.getByRole('combobox', { name: 'Preisgruppe 1' }), 'Nahrung');
  await userEvent.click(ui.getByRole('option', { name: '01.1 Nahrungsmittel' }));
  await waitFor(() =>
    expect(writes).toEqual([
      { categoryId: 'food', method: 'cpi', coicop: [{ code: '01.1', shareBp: 10000 }] },
    ]),
  );
});

it('explains an existing twelve-month average without calling it an automatic fixed price', async () => {
  row.included = true;
  row.trailingMean = true;
  row.reason = row.automaticReason =
    'Bedarf mit regelmäßigen Vertragspreisen oder 12-Monats-Mittel';
  const ui = await page();
  expect(ui.getByText(/Durchschnitt deiner Buchungen über zwölf Monate/)).toBeTruthy();
  expect(
    screen.getByText(
      'Im Warenkorb: 1 Kategorien · Automatisch: 0 · Von dir gesetzt: 1 · Ausgeschlossen: 0',
    ),
  ).toBeTruthy();
});

it('shows a payee exclusion immediately and restores the saved choice on failure', async () => {
  row.payees = [
    { id: 'payee', name: 'Abo Muster', included: true, contracts: [], rhythm: 'monthly' },
  ];
  fail = true;
  let releaseWrite!: () => void;
  pauseWrite = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const ui = await page();
  await userEvent.click(ui.getByText('Ausnahmen (1)'));
  const checkbox = ui.getByLabelText('Abo Muster zählt mit') as HTMLInputElement;
  try {
    await userEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(writes).toEqual([{ categoryId: 'food', excludedPayeeIds: ['payee'] }]);
  } finally {
    releaseWrite();
  }
  await screen.findByText('Speichern fehlgeschlagen.');
  await waitFor(() => expect(checkbox.checked).toBe(true));
  expect(row.excludedPayeeIds).toEqual([]);
});
