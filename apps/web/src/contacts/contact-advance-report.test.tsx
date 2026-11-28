// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContactAdvanceReport } from './contact-advance-report';

const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../api/http', () => ({ request: http.request }));

const month = (m: string, over: Record<string, unknown> = {}) => ({
  month: m,
  advancedCents: 0,
  repaidCents: 0,
  waivedCents: 0,
  openCents: 0,
  byPurpose: [],
  ...over,
});
const data = {
  months: [
    month('2026-11', {
      advancedCents: 8000,
      repaidCents: 2000,
      waivedCents: 500,
      openCents: 5500,
      byPurpose: [
        { purposeCategoryId: 'essen', cents: 5000 },
        { purposeCategoryId: null, cents: 3000 },
      ],
    }),
    month('2026-10', { openCents: 0 }),
  ],
  purposeTotals: [
    { purposeCategoryId: 'essen', cents: 5000 },
    { purposeCategoryId: null, cents: 3000 },
  ],
  averageDaysToSettle: 36,
  settledOutlays: 2,
  peakOpenCents: 15000,
  purposeNames: { essen: 'Essen' },
};
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContactAdvanceReport contactId="k1" asOf="2026-11-28" />
    </QueryClientProvider>,
  );
}
beforeEach(() => http.request.mockReset());
afterEach(cleanup);

it('shows advanced, repaid (with taken over) and open per month with purposes and the averages', async () => {
  http.request.mockResolvedValue(data);
  mount();
  await screen.findByText('Vorgestreckt pro Monat');
  expect(http.request.mock.calls[0]![1]).toBe('/api/contacts/k1/advance-report?asOf=2026-11-28');
  const rows = screen.getAllByRole('row');
  // The empty month (October) is left out.
  expect(rows).toHaveLength(2);
  const november = within(rows[1]!);
  expect(november.getByRole('rowheader').textContent).toBe('November 2026');
  const cells = november.getAllByRole('cell').map((c) => c.textContent);
  expect(cells[0]).toMatch(/^80,00\s€Essen 50,00\s€ · ohne Zweck 30,00\s€$/);
  expect(cells.slice(1)).toEqual([
    expect.stringMatching(/^20,00\s€übernommen 5,00\s€$/),
    expect.stringMatching(/^55,00\s€$/),
  ]);
  expect(screen.getByTestId('advance-stats').textContent).toMatch(
    /Im Schnitt 36 Tage bis zum vollständigen Ausgleich \(2 ausgeglichene Auslagen\)\. Höchststand offen: 150,00\s€\./,
  );
});

it('renders nothing without advances and shows a waiver only where there is one', async () => {
  http.request.mockResolvedValue({
    ...data,
    months: [month('2026-11')],
    purposeTotals: [],
    peakOpenCents: 0,
  });
  mount();
  await waitFor(() => expect(http.request).toHaveBeenCalled());
  expect(screen.queryByText('Vorgestreckt pro Monat')).toBeNull();
  cleanup();
  http.request.mockResolvedValue({
    ...data,
    months: [month('2026-11', { advancedCents: 1000, openCents: 1000 })],
    averageDaysToSettle: null,
  });
  mount();
  await screen.findByText('Vorgestreckt pro Monat');
  expect(screen.queryByText(/übernommen/)).toBeNull();
  expect(screen.getByTestId('advance-stats').textContent).toMatch(
    /^Noch keine Auslage vollständig ausgeglichen\./,
  );
});
