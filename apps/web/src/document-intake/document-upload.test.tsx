// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentUploadButton, type Classification } from './document-upload';

const statement = vi.fn(),
  payslip = vi.fn(),
  receipt = vi.fn();
vi.mock('../budget/use-category-writes', () => ({
  useBudgetWrite: () => async (run: () => Promise<unknown>) => run(),
}));
vi.mock('../receipts/receipt-section', () => ({
  postReceipt: (file: File) => {
    receipt(file);
    return Promise.resolve({ groupId: 'synthetic-group' });
  },
}));
vi.mock('../statement-intake/statement-review-726', () => ({
  AccountStatementIntake: (props: { accountId: string; handoff: { file: File } }) => {
    statement(props);
    return <p>statement flow</p>;
  },
}));
vi.mock('../reports/payslip-panel', () => ({
  PayslipUploadDialog: (props: { handoff: { file: File } }) => {
    payslip(props);
    return <p>payslip flow</p>;
  },
}));

const ACCOUNT = 'synthetic-card-account';
let result: Classification;
let classifyBodies: FormData[];
beforeEach(() => {
  classifyBodies = [];
  // jsdom has no showModal and no matchMedia (desktop layout).
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  statement.mockReset();
  payslip.mockReset();
  receipt.mockReset();
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/api/document-intake/classify') {
      classifyBodies.push(init?.body as FormData);
      return Response.json(result);
    }
    if (path === '/api/accounts')
      return Response.json({
        accounts: [
          { id: 'synthetic-giro', name: 'Muster Giro', type: 'checking' },
          { id: ACCOUNT, name: 'Muster Karte', type: 'credit_card' },
        ],
      });
    return new Response('{}', { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function renderButton(accountId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<DocumentUploadButton {...(accountId ? { accountId } : {})} />, { wrapper: wrap });
}
const pick = async (file: File) => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Dokument hochladen' }));
  await user.upload(screen.getByLabelText('Dokument auswählen'), file);
  return user;
};
const pdf = () => new File(['%PDF-1.7'], 'synthetic.pdf', { type: 'application/pdf' });

it('shows the detected type and hands the same file to the statement flow with the account', async () => {
  result = {
    type: 'card_statement',
    confidence: 'certain',
    hints: { mime: 'application/pdf', accountHint: '****1234' },
    needsPassword: false,
  };
  renderButton(ACCOUNT);
  const file = pdf();
  const user = await pick(file);
  expect(await screen.findByText('Erkannt: Kreditkartenabrechnung')).toBeTruthy();
  expect(screen.getByText(/Nur wenn für dieses Konto die automatische Abrechnung/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  await waitFor(() => expect(statement).toHaveBeenCalled());
  const props = statement.mock.calls[0]![0] as { accountId: string; handoff: { file: File } };
  expect(props.accountId).toBe(ACCOUNT);
  expect(props.handoff.file).toBe(file);
  expect(receipt).not.toHaveBeenCalled();
});

it('lets the owner correct the type: payslip hands the same file to the payslip flow', async () => {
  result = {
    type: 'receipt',
    confidence: 'unknown',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  renderButton();
  const file = pdf();
  const user = await pick(file);
  expect(await screen.findByText(/Erkannt: Beleg/)).toBeTruthy();
  await user.selectOptions(screen.getByLabelText('Dokumenttyp'), 'payslip');
  expect(screen.getByText(/Auszahlung automatisch erfasst/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  await waitFor(() => expect(payslip).toHaveBeenCalled());
  expect((payslip.mock.calls[0]![0] as { handoff: { file: File } }).handoff.file).toBe(file);
  expect(statement).not.toHaveBeenCalled();
});

it('requires an account for a statement chosen without context', async () => {
  result = {
    type: 'bank_statement',
    confidence: 'probable',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  renderButton();
  const user = await pick(pdf());
  await screen.findByText(/Erkannt: Kontoauszug/);
  const next = screen.getByRole('button', { name: 'Weiter' }) as HTMLButtonElement;
  expect(next.disabled).toBe(true);
  await user.selectOptions(await screen.findByLabelText('Konto'), 'synthetic-giro');
  expect(next.disabled).toBe(false);
});

it('files an unreadable document as a receipt and offers a password for encrypted PDFs', async () => {
  result = {
    type: 'unreadable',
    confidence: 'unknown',
    hints: { mime: 'application/pdf' },
    needsPassword: true,
  };
  renderButton();
  const file = pdf();
  const user = await pick(file);
  expect(await screen.findByText('Das PDF ist passwortgeschützt.')).toBeTruthy();
  result = { ...result, type: 'unreadable', needsPassword: false };
  await user.type(screen.getByLabelText('PDF-Passwort'), 'synthetic-secret');
  await user.click(screen.getByRole('button', { name: 'Mit Passwort prüfen' }));
  expect(await screen.findByText('Dieses Dokument konnte nicht gelesen werden.')).toBeTruthy();
  expect(classifyBodies[1]!.get('password')).toBe('synthetic-secret');
  expect((screen.getByLabelText('Dokumenttyp') as HTMLSelectElement).value).toBe('receipt');
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  await waitFor(() => expect(receipt).toHaveBeenCalledWith(file));
  expect(statement).not.toHaveBeenCalled();
  expect(payslip).not.toHaveBeenCalled();
});
