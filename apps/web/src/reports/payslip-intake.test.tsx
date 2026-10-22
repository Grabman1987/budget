// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayslipIntakeDetail, PayslipSourceSection, PayslipUpload } from './payslip-intake';

const account = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  type: 'checking',
  onBudget: true,
  sortOrder: 1,
  closedAt: null,
  ...over,
});

beforeEach(() => {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
  if (!HTMLDialogElement.prototype.close)
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        accounts: [
          account('depot', 'Depot Muster', { type: 'brokerage', onBudget: false, sortOrder: 1 }),
          account('card', 'Karte Muster', { type: 'credit_card', sortOrder: 2 }),
          account('b', 'Giro B', { sortOrder: 2 }),
          account('a', 'Giro A', { sortOrder: 3 }),
          account('old', 'Altes Konto', { closedAt: '2026-05-01T00:00:00.000Z' }),
        ],
        passwordSet: false,
        passwordSource: null,
        passwordRememberAvailable: false,
        dropboxConnected: false,
        dropboxConfigured: false,
        dropboxWrite: false,
        lastScanAt: null,
        filesFound: 0,
        errors: 0,
        errorCode: null,
        config: { salaryAccountId: null, wageTypes: {} },
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('accepts a dropped PDF without the native chooser and rejects ambiguous or non-PDF drops', async () => {
  const fetch = vi.fn(async () => Response.json({ id: 'synthetic-intake', duplicate: false }));
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <PayslipUpload />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const drop = screen.getByRole('region', { name: 'Gehaltszettel-PDF ablegen' });
  const pdf = new File(['%PDF-1.7 synthetic'], 'synthetic.pdf', { type: 'application/pdf' });
  fireEvent.drop(drop, { dataTransfer: { files: [pdf, pdf] } });
  expect(screen.getByRole('alert').textContent).toContain('genau eine PDF');
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.drop(drop, {
    dataTransfer: { files: [new File(['synthetic'], 'synthetic.txt', { type: 'text/plain' })] },
  });
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.drop(drop, { dataTransfer: { files: [pdf] } });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await screen.findByRole('status');
});

describe('Gehaltskonto', () => {
  it('suggests the configured payout account and confirms the changed account explicitly', async () => {
    const writes: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (init.method === 'POST') {
          writes.push(JSON.parse(init.body as string));
          return Response.json({ groupId: 'synthetic-payout-group' });
        }
        const selected = new URL(url, 'http://localhost').searchParams.get('accountId') ?? 'b';
        return Response.json({
          id: 'intake',
          receiptId: 'receipt',
          status: 'pending',
          matches: [],
          payoutAccountId: selected,
          proposedPayoutDate: '2026-09-30',
          proposedPayeeId: null,
          selectedExpectedOccurrenceId: null,
          expectedPayouts: [],
          payees: [],
          accounts: [account('a', 'Giro A'), account('b', 'Giro B')],
          parsed: {
            documentType: 'payslip',
            periodSource: 'content',
            differenceCents: 0,
            warnings: [],
            draft: {
              month: '2026-09',
              kind: 'regular',
              grossCents: 400000,
              svCents: 70000,
              taxCents: 50000,
              netCents: 280000,
              lines: [],
            },
          },
        });
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <PayslipIntakeDetail id="intake" />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText('Gehaltszettel prüfen'));
    const suggested = await screen.findByLabelText('Auszahlungskonto');
    expect((suggested as HTMLSelectElement).value).toBe('b');
    fireEvent.change(suggested, { target: { value: 'a' } });
    await waitFor(() =>
      expect((screen.getByLabelText('Auszahlungskonto') as HTMLSelectElement).value).toBe('a'),
    );
    expect(screen.getByRole('option', { name: 'Neue Auszahlung vormerken' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
    await waitFor(() =>
      expect(writes).toEqual([
        {
          action: 'confirm',
          bookingId: null,
          accountId: 'a',
          payoutDate: '2026-09-30',
          payeeId: null,
        },
      ]),
    );
  });

  it('shows account groups in order, by sort order, without closed accounts', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <PayslipSourceSection />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const select = await screen.findByLabelText('Gehaltskonto');
    const groups = [...select.querySelectorAll('optgroup')];
    expect(groups.map((g) => g.label)).toEqual(['Budget-Konten', 'Kreditkarten', 'Investments']);
    expect([...groups[0]!.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Giro B',
      'Giro A',
    ]);
    expect(screen.queryByRole('option', { name: 'Altes Konto' })).toBeNull();
  });
});

it('requires an explicit payout date when neither the PDF nor an expectation supplied one', async () => {
  const writes: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        writes.push(JSON.parse(init.body as string));
        return Response.json({ groupId: 'synthetic-group' });
      }
      return Response.json({
        id: 'synthetic-intake',
        receiptId: 'synthetic-receipt',
        status: 'pending',
        matches: [],
        payoutAccountId: 'salary-account',
        proposedPayoutDate: null,
        proposedPayeeId: null,
        selectedExpectedOccurrenceId: null,
        expectedPayouts: [],
        payees: [],
        accounts: [account('salary-account', 'Synthetic salary account')],
        parsed: {
          documentType: 'payslip',
          periodSource: 'content',
          differenceCents: 0,
          warnings: [],
          draft: {
            month: '2026-09',
            kind: 'regular',
            grossCents: 400000,
            svCents: 70000,
            taxCents: 50000,
            netCents: 280000,
            lines: [],
          },
        },
      });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <PayslipIntakeDetail id="synthetic-intake" inline />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const confirm = await screen.findByRole('button', { name: 'Bestätigen' });
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Auszahlungsdatum'), { target: { value: '28.09.2026' } });
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Bestätigen' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
  await waitFor(() =>
    expect(writes).toEqual([
      {
        action: 'confirm',
        bookingId: null,
        accountId: 'salary-account',
        payoutDate: '2026-09-28',
        payeeId: null,
      },
    ]),
  );
});

it('uses the server-selected sole salary expectation as date, payee and settlement link', async () => {
  const writes: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        writes.push(JSON.parse(init.body as string));
        return Response.json({ groupId: 'synthetic-group' });
      }
      return Response.json({
        id: 'synthetic-intake',
        receiptId: 'synthetic-receipt',
        status: 'pending',
        matches: [],
        payoutAccountId: 'salary-account',
        proposedPayoutDate: '2026-09-28',
        proposedPayeeId: 'synthetic-payee',
        selectedExpectedOccurrenceId: 'synthetic-occurrence',
        expectedPayouts: [
          {
            occurrenceId: 'synthetic-occurrence',
            paymentId: 'synthetic-payment',
            name: 'Synthetic salary',
            dueDate: '2026-09-28',
            amountCents: 280000,
            currency: 'EUR',
            accountId: 'salary-account',
            payeeId: 'synthetic-payee',
            payeeName: 'Synthetic employer',
          },
        ],
        payees: [{ id: 'synthetic-payee', name: 'Synthetic employer' }],
        accounts: [account('salary-account', 'Synthetic salary account')],
        parsed: {
          documentType: 'payslip',
          periodSource: 'content',
          differenceCents: 0,
          warnings: [],
          draft: {
            month: '2026-09',
            kind: 'regular',
            grossCents: 400000,
            svCents: 70000,
            taxCents: 50000,
            netCents: 280000,
            lines: [],
          },
        },
      });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <PayslipIntakeDetail id="synthetic-intake" inline />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const confirm = await screen.findByRole('button', { name: 'Bestätigen' });
  expect((confirm as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByLabelText('Gehalts-Erwartung') as HTMLSelectElement).value).toBe(
    'synthetic-occurrence',
  );
  expect((screen.getByLabelText('Von') as HTMLSelectElement).value).toBe('synthetic-payee');
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(writes).toEqual([
      {
        action: 'confirm',
        bookingId: null,
        accountId: 'salary-account',
        payoutDate: '2026-09-28',
        payeeId: 'synthetic-payee',
        expectedOccurrenceId: 'synthetic-occurrence',
      },
    ]),
  );
  fireEvent.change(screen.getByLabelText('Gehalts-Erwartung'), { target: { value: '' } });
  await waitFor(() =>
    expect((screen.getByLabelText('Gehalts-Erwartung') as HTMLSelectElement).value).toBe(''),
  );
  fireEvent.change(screen.getByLabelText('Auszahlungsdatum'), { target: { value: '' } });
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Bestätigen' }) as HTMLButtonElement).disabled).toBe(
      true,
    ),
  );
  fireEvent.change(screen.getByLabelText('Auszahlungsdatum'), {
    target: { value: '02.10.2026' },
  });
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Bestätigen' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
  await waitFor(() =>
    expect(writes[1]).toEqual({
      action: 'confirm',
      bookingId: null,
      accountId: 'salary-account',
      payoutDate: '2026-10-02',
      payeeId: null,
      expectedOccurrenceId: null,
    }),
  );
});

it('offers section choices only for unknown wage types and reparses the selected mapping', async () => {
  let mappingBody: unknown;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'PUT') {
        mappingBody = JSON.parse(init.body as string);
        return Response.json({ groupId: 'synthetic-mapping' });
      }
      return Response.json({
        id: 'synthetic-intake',
        receiptId: 'synthetic-receipt',
        status: 'pending',
        matches: [],
        payoutAccountId: null,
        proposedPayoutDate: null,
        proposedPayeeId: null,
        selectedExpectedOccurrenceId: null,
        expectedPayouts: [],
        payees: [],
        accounts: [],
        parsed: {
          documentType: 'payslip',
          periodSource: 'content',
          differenceCents: 0,
          warnings: ['Unknown wage type 899'],
          unmappedWageTypes: [{ code: '899', label: 'Synthetic allowance', amountCents: 1234 }],
          draft: {
            month: '2026-09',
            kind: 'regular',
            grossCents: 400000,
            svCents: 70000,
            taxCents: 50000,
            netCents: 280000,
            lines: [],
          },
        },
      });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <PayslipIntakeDetail id="synthetic-intake" inline />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const section = await screen.findByRole('combobox', { name: /899/ });
  fireEvent.change(section, { target: { value: 'reimbursement' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zuordnen und neu auswerten' }));
  await waitFor(() => expect(mappingBody).toEqual({ wageTypes: { '899': 'reimbursement' } }));
});
