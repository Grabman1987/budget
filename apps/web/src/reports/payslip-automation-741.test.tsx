// @vitest-environment jsdom
import { useState, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAmountsHidden, ToastProvider } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PAYSLIP_PARSER_VERSION, type ParsedPayrollDocument } from '@budget/domain';
import { PayslipIntakeDetail, PayslipSourceSection, PayslipUpload } from './payslip-intake';

const ID = '74100000-0000-4000-8000-000000000701';
const ACCOUNT = '74100000-0000-4000-8000-000000000702';
const EMPLOYER = '74100000-0000-4000-8000-000000000703';
const PAYOUT = '74100000-0000-4000-8000-000000000704';
const FINANCIAL_GROUP = '74100000-0000-4000-8000-000000000705';
const parsed: ParsedPayrollDocument = {
  documentType: 'payslip',
  periodSource: 'content',
  parserVersion: PAYSLIP_PARSER_VERSION,
  payoutDate: '2031-01-31',
  differenceCents: 0,
  warnings: [],
  draft: {
    month: '2031-01',
    kind: 'regular',
    specialType: null,
    grossCents: 400000,
    svCents: 68000,
    taxCents: 44000,
    netCents: 297500,
    bookingId: null,
    receiptId: null,
    lines: [
      { section: 'deduction', label: 'Synthetic deduction', amountCents: 500 },
      { section: 'reimbursement', label: 'Synthetic reimbursement', amountCents: 10000 },
    ],
  },
};
const account = {
  id: ACCOUNT,
  name: 'Muster Gehaltskonto',
  type: 'checking',
  onBudget: true,
  sortOrder: 0,
  closedAt: null,
};
const clients: QueryClient[] = [];
type Call = { method: string; path: string; body: unknown };
function transport(initial: 'confirmed' | 'pending' | 'rejected' | 'legacy' = 'confirmed') {
  const calls: Call[] = [];
  let state = initial;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname,
      method = init?.method ?? 'GET';
    const body: unknown =
      init?.body instanceof FormData
        ? init.body
        : init?.body
          ? JSON.parse(String(init.body))
          : undefined;
    calls.push({ method, path, body });
    const json = (value: unknown) => Response.json(value);
    if (path === '/api/payslip-intake/upload') {
      state = 'confirmed';
      return json({
        id: ID,
        duplicate: false,
        sourceGroupId: 'synthetic-source-only-group',
        groupId: FINANCIAL_GROUP,
        automation: {
          status: 'booked',
          reason: 'unambiguous_source',
          groupId: FINANCIAL_GROUP,
          payslipId: 'synthetic-payslip',
          bookingId: PAYOUT,
        },
      });
    }
    if (path === '/api/undo') {
      state = 'pending';
      return json({ groupId: 'synthetic-undone-group' });
    }
    if (path === `/api/payslip-intake/${ID}`)
      return json({
        id: ID,
        receiptId: 'synthetic-receipt',
        status: state === 'legacy' ? 'confirmed' : state,
        parsed,
        payoutAccountId: ACCOUNT,
        proposedPayoutDate: '2031-01-31',
        accounts: [account],
        matches: [],
        payees: [],
        proposedPayeeId: null,
        selectedExpectedOccurrenceId: null,
        expectedPayouts: [],
        ...(state === 'legacy'
          ? {}
          : {
              payout:
                state === 'confirmed'
                  ? { payslipId: 'synthetic-payslip', bookingId: PAYOUT, accountId: ACCOUNT }
                  : null,
            }),
      });
    if (path === '/api/payslip-intake/status')
      return json({
        accounts: [account],
        payees: [{ id: EMPLOYER, name: 'Muster Arbeitgeber' }],
        config: { salaryAccountId: null, wageTypes: {} },
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
      });
    if (path === '/api/payslip-intake/config' && method === 'PUT')
      return json({ groupId: 'synthetic-config-group' });
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
  });
  return calls;
}
function mount(child: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>{child}</ToastProvider>
    </QueryClientProvider>,
  );
}
function UploadAndResult() {
  const [id, setId] = useState<string>();
  return (
    <>
      <PayslipUpload onUploaded={(result) => setId(result.id)} />
      {id && <PayslipIntakeDetail id={id} inline />}
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal('CSS', { escape: (value: string) => value });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  setAmountsHidden(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('sends eligible intent and targets the committed financial group rather than source staging when Undo is clicked', async () => {
  const calls = transport();
  mount(<UploadAndResult />);
  await userEvent.upload(
    screen.getByLabelText('Gehaltszettel-PDF auswählen'),
    new File(['%PDF- transport-only fixture'], 'synthetic-payroll.pdf', {
      type: 'application/pdf',
    }),
  );
  const link = await screen.findByRole('link', { name: 'Gespeicherte Auszahlung öffnen' });
  expect(link.getAttribute('href')).toBe(`/konten/buchungen?konto=${ACCOUNT}&buchung=${PAYOUT}`);
  const upload = calls.find((call) => call.path === '/api/payslip-intake/upload')!;
  const body = upload.body as FormData;
  expect([...body.keys()].sort()).toEqual(['automation', 'file']);
  expect(body.get('automation')).toBe('eligible');
  await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: 'Gespeicherte Auszahlung öffnen' })).toBeNull(),
  );
  expect(calls.filter((call) => call.path === '/api/undo').map((call) => call.body)).toEqual([
    { groupId: FINANCIAL_GROUP },
  ]);
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(2);
});

it('loads the actual association again after a new component mount instead of relying on upload state', async () => {
  const calls = transport();
  mount(<PayslipIntakeDetail id={ID} inline />);
  await screen.findByRole('link', { name: 'Gespeicherte Auszahlung öffnen' });
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  mount(<PayslipIntakeDetail id={ID} inline />);
  expect(
    (await screen.findByRole('link', { name: 'Gespeicherte Auszahlung öffnen' })).getAttribute(
      'href',
    ),
  ).toBe(`/konten/buchungen?konto=${ACCOUNT}&buchung=${PAYOUT}`);
  expect(
    calls.filter((call) => call.method === 'GET' && call.path === `/api/payslip-intake/${ID}`),
  ).toHaveLength(2);
});

it.each(['pending', 'rejected', 'legacy'] as const)(
  'does not infer a payout result from %s source data',
  async (state) => {
    const calls = transport(state);
    mount(<PayslipIntakeDetail id={ID} inline />);
    await screen.findByRole('link', { name: 'Original-PDF herunterladen' });
    expect(screen.queryByRole('link', { name: 'Gespeicherte Auszahlung öffnen' })).toBeNull();
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
  },
);

it('immediately masks and restores already rendered payroll figures without refetching or losing the payout link', async () => {
  const calls = transport();
  mount(<PayslipIntakeDetail id={ID} inline />);
  const payout = await screen.findByRole('link', { name: 'Gespeicherte Auszahlung öffnen' });
  expect(screen.getAllByText(/2\.975,00\s*€/)).toHaveLength(2);
  expect(screen.getAllByText(/4\.000,00\s*€/)).toHaveLength(2);
  const beforeCalls = [...calls];
  act(() => setAmountsHidden(true));
  expect(screen.queryByText(/2\.975,00\s*€/)).toBeNull();
  expect(screen.queryByText(/4\.000,00\s*€/)).toBeNull();
  expect(screen.getAllByText('••• €').length).toBeGreaterThanOrEqual(7);
  expect(payout.getAttribute('href')).toBe(`/konten/buchungen?konto=${ACCOUNT}&buchung=${PAYOUT}`);
  expect(calls).toEqual(beforeCalls);
  act(() => setAmountsHidden(false));
  expect(screen.getAllByText(/2\.975,00\s*€/)).toHaveLength(2);
  expect(screen.getAllByText(/4\.000,00\s*€/)).toHaveLength(2);
  expect(calls).toEqual(beforeCalls);
});

it('saves the explicitly selected real sender and account through the existing source configuration', async () => {
  const calls = transport();
  mount(<PayslipSourceSection />);
  await userEvent.selectOptions(await screen.findByLabelText('Gehaltskonto'), ACCOUNT);
  await userEvent.selectOptions(
    screen.getByLabelText('Arbeitgeber / Absender für automatische Gehaltszettel'),
    EMPLOYER,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Zuordnung speichern' }));
  await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
  expect(calls.find((call) => call.method === 'PUT')!.body).toEqual({
    salaryAccountId: ACCOUNT,
    automation: { payeeId: EMPLOYER },
    wageTypes: {},
  });
});
