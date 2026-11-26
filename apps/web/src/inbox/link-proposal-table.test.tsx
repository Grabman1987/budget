// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { InboxStored } from './api';
import { LinkProposalTable } from './link-proposal-table';
import { TaskSourceSummary } from './task-source-summary';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, search, children, ...rest }: Record<string, unknown>) => (
    <a href={String(to)} data-search={JSON.stringify(search)} {...rest}>
      {children as never}
    </a>
  ),
}));

let client: QueryClient;
afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});
const wrap = (node: React.ReactNode) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  );
};

const proposal = (id: string, occurrenceId: string, bookingId: string, bookingCents = -2500) =>
  ({
    type: 'stored',
    id,
    title: 'Abbuchung zuordnen',
    linkProposal: {
      occurrenceId,
      bookingId,
      view: {
        paymentName: 'Muster Abo',
        payeeName: 'Muster GmbH',
        dueDate: '2026-11-05',
        expectedAmountCents: -2500,
        bookingDate: '2026-11-04',
        bookingAmountCents: bookingCents,
        currency: 'EUR',
        reason: 'Empfänger nicht bestätigt',
      },
    },
  }) as unknown as InboxStored & { linkProposal: NonNullable<InboxStored['linkProposal']> };

it('shows one table row per payment with de-AT dates and compact actions', async () => {
  const writes: string[] = [];
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'POST') writes.push(path);
    return Response.json({ result: { groupId: 'g1' } });
  });
  const open = vi.fn();
  const reject = vi.fn();
  wrap(
    <LinkProposalTable
      items={[proposal('p1', 'o1', 'b1')]}
      busyId={null}
      onOpenBooking={open}
      onReject={reject}
    />,
  );
  const row = screen.getByRole('row', { name: /Muster Abo/ });
  expect(within(row).getByText('Muster Abo')).toBeTruthy();
  expect(within(row).getByText('Muster GmbH')).toBeTruthy();
  expect(row.textContent).toContain('05.11.');
  expect(row.textContent).toContain('04.11.');
  expect(row.textContent).not.toContain('2026-11');
  expect(screen.queryByText('Abbuchung zuordnen')).toBeNull();
  fireEvent.click(within(row).getByRole('button', { name: /04\.11\./ }));
  expect(open).toHaveBeenCalledWith('b1');
  fireEvent.click(within(row).getByRole('button', { name: 'Ablehnen' }));
  expect(reject).toHaveBeenCalledTimes(1);
  fireEvent.click(within(row).getByRole('button', { name: 'Zuordnen' }));
  await waitFor(() => expect(writes).toHaveLength(1));
});

it('offers the candidate bookings of one occurrence as a choice and links the chosen one', async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'POST') bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ result: { groupId: 'g1' } });
  });
  wrap(
    <LinkProposalTable
      items={[proposal('p1', 'o1', 'b1'), proposal('p2', 'o1', 'b2', -2600)]}
      busyId={null}
      onOpenBooking={() => undefined}
      onReject={() => undefined}
    />,
  );
  expect(screen.getAllByRole('row')).toHaveLength(2);
  const select = screen.getByRole('combobox', { name: /Buchung wählen/ });
  expect(within(select).getAllByRole('option')).toHaveLength(2);
  expect(screen.getByText(/mehrere möglich/)).toBeTruthy();
  fireEvent.change(select, { target: { value: 'p2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zuordnen' }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(JSON.stringify(bodies[0])).toContain('b2');
});

it('counts open plan problems in the Plan row and links to the plan', () => {
  const counts = { accounts: 0, plan: 0, receipts: 0, payslips: 0, other: 0 };
  render(
    <TaskSourceSummary
      counts={counts}
      selected={undefined}
      onSelect={() => undefined}
      planState={{ month: '2026-11', assignmentCents: -500, overspentCount: 16 }}
    />,
  );
  expect(screen.getByText(/16 Kategorien überzogen · zu viel zugewiesen/)).toBeTruthy();
  const link = screen.getByRole('link', { name: 'Prüfen · Plan' });
  expect(link.getAttribute('href')).toBe('/plan/monat');
  expect(link.getAttribute('data-search')).toContain('triage');
});
