// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestDatabase } from '@budget/db';
import { createLedgerApi } from '../../../server/src/api';
import type { AccountList } from './types';
import { overviewModel } from './overview-model';
import { ClosedAccountDisclosure, ClosedAccountNotice } from './closed-account-disclosure';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
vi.mock('@tanstack/react-router', () => ({
  Link: ({ params, children }: { params: { id: string }; children: React.ReactNode }) => (
    <a href={`/konten/${params.id}`}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  flags.REDESIGN_ENABLED = true;
  vi.unstubAllGlobals();
});

async function fixture(missingFx = false) {
  const opened = createTestDatabase();
  opened.sqlite.exec(`INSERT INTO account
    (id,name,type,role,on_budget,currency,opening_date,opening_balance_cents,closed_at)
    VALUES
    ('open','Synthetic open','checking','budget',1,'EUR','2026-01-01',10000,NULL),
    ('plus','Synthetic retained plus','checking','budget',1,'EUR','2026-01-01',900,'2026-08-01'),
    ('minus','Synthetic retained minus','checking','budget',1,'EUR','2026-01-01',-40,'2026-08-01'),
    ('zero','Synthetic zero','checking','budget',1,'EUR','2026-01-01',0,'2026-08-01');`);
  if (missingFx)
    opened.sqlite.exec(`INSERT INTO account
    (id,name,type,role,on_budget,currency,opening_date,opening_balance_cents,closed_at)
    VALUES ('fx','Synthetic missing FX','checking','budget',1,'USD','2026-01-01',500,'2026-08-01');`);
  const writes: string[] = [];
  const api = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
  const request = async (path: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') writes.push(`${init?.method} ${path}`);
    return api.request(path, init);
  };
  vi.stubGlobal('fetch', request);
  const response = await request('/accounts');
  expect(response.status).toBe(200);
  const data = (await response.json()) as AccountList;
  return { opened, writes, data, request };
}

it('F06 retains literal +900/-40 residuals and the same current/historical total without writes', async () => {
  const { opened, data, writes, request } = await fixture();
  try {
    const before = overviewModel(data.accounts);
    expect(data.netWorthEurCents).toBe(10860);
    expect(before.netWorthCents).toBe(data.netWorthEurCents);
    expect(before.closedValueCents).toBe(860);
    const { unmount } = render(
      <ClosedAccountDisclosure accounts={data.accounts} asOf={data.asOf} />,
    );
    const disclosure = screen.getByText('Geschlossene Konten · Restwerte im Nettovermögen');
    fireEvent.click(disclosure);
    expect(screen.getByText('108,60 €')).toBeTruthy();
    expect(screen.getByText('8,60 €')).toBeTruthy();
    expect(screen.getByText('Restwert · 9,00 €')).toBeTruthy();
    expect(screen.getByText('Restwert · −0,40 €')).toBeTruthy();
    expect(screen.getByText('Kein Restwert · 0,00 €')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Synthetic retained plus', hidden: true })
        .getAttribute('href'),
    ).toBe('/konten/plus');
    fireEvent.click(disclosure);
    unmount();
    const after = (await (await request('/accounts')).json()) as AccountList;
    expect(after).toEqual(data);
    expect(after.netWorthEurCents).toBe(10860);
    const historical = (await (await request('/accounts?asOf=2026-08-31')).json()) as AccountList;
    expect(historical.netWorthEurCents).toBe(10860);
    expect(overviewModel(historical.accounts).netWorthCents).toBe(10860);
    expect(writes).toEqual([]);
  } finally {
    opened.sqlite.close();
  }
});

it('distinguishes missing FX from zero and preserves unavailable totals', async () => {
  const { opened, data, writes } = await fixture(true);
  try {
    render(<ClosedAccountDisclosure accounts={data.accounts} asOf={data.asOf} />);
    expect(screen.getByText('Nicht verfügbar · Wechselkurs fehlt: USD')).toBeTruthy();
    expect(screen.getByText('Kein Restwert · 0,00 €')).toBeTruthy();
    expect(screen.getAllByText('Nicht verfügbar')).toHaveLength(2);
    expect(data.netWorthEurCents).toBeNull();
    expect(overviewModel(data.accounts).netWorthCents).toBeNull();
    expect(writes).toEqual([]);
  } finally {
    opened.sqlite.close();
  }
});

it('keeps both mounts absent with the production flag OFF', async () => {
  const { opened, data } = await fixture();
  try {
    flags.REDESIGN_ENABLED = false;
    const { container } = render(
      <>
        <ClosedAccountDisclosure accounts={data.accounts} asOf={data.asOf} />
        <ClosedAccountNotice account={data.accounts.find((a) => a.id === 'plus')!} />
      </>,
    );
    expect(container.innerHTML).toBe('');
  } finally {
    opened.sqlite.close();
  }
});

it('shows retained value on the closed detail and stays absent for open accounts', async () => {
  const { opened, data } = await fixture();
  try {
    const { rerender, container } = render(
      <ClosedAccountNotice account={data.accounts.find((a) => a.id === 'plus')!} />,
    );
    expect(screen.getByLabelText('Geschlossenes Konto').textContent).toContain('Restwert · 9,00 €');
    rerender(<ClosedAccountNotice account={data.accounts.find((a) => a.id === 'open')!} />);
    expect(container.innerHTML).toBe('');
  } finally {
    opened.sqlite.close();
  }
});
