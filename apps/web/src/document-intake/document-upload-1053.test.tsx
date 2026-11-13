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
  useBudgetWrite: () => async (run: () => Promise<unknown>) => {
    // Like the real helper: a failed write is reported, not thrown.
    try {
      await run();
    } catch {
      // reported elsewhere
    }
  },
}));
vi.mock('../receipts/receipt-section', () => ({
  postReceipt: (file: File) => {
    receipt(file);
    if (failReceipt) return Promise.reject(new Error('synthetic failure'));
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
let failReceipt = false;
let result: Classification;
let classifyBodies: FormData[];
beforeEach(() => {
  classifyBodies = [];
  failReceipt = false;
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

const png = () => new File(['png'], 'synthetic.png', { type: 'image/png' });

it('offers only the receipt type for an image', async () => {
  result = {
    type: 'receipt',
    confidence: 'probable',
    hints: { mime: 'image/png' },
    needsPassword: false,
  };
  renderButton();
  await pick(png());
  await screen.findByText(/Erkannt: Beleg/);
  const options = Array.from(
    (screen.getByLabelText('Dokumenttyp') as HTMLSelectElement).options,
  ).map((o) => o.textContent);
  expect(options).toEqual(['Beleg']);
});

it('offers every type for a PDF', async () => {
  result = {
    type: 'receipt',
    confidence: 'unknown',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  renderButton();
  await pick(pdf());
  await screen.findByText(/Erkannt: Beleg/);
  expect((screen.getByLabelText('Dokumenttyp') as HTMLSelectElement).options).toHaveLength(4);
});

it('says so when a typed password does not open the PDF', async () => {
  result = {
    type: 'unreadable',
    confidence: 'unknown',
    hints: { mime: 'application/pdf' },
    needsPassword: true,
  };
  renderButton();
  const user = await pick(pdf());
  await screen.findByText('Das PDF ist passwortgeschützt.');
  expect(screen.queryByText(/Passwort falsch/)).toBeNull();
  await user.type(screen.getByLabelText('PDF-Passwort'), 'synthetic-wrong');
  await user.click(screen.getByRole('button', { name: 'Mit Passwort prüfen' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Passwort falsch. Bitte erneut eingeben.',
  );
});

it('shows a result summary with a link to Prüfen after filing a receipt, then closes', async () => {
  result = {
    type: 'receipt',
    confidence: 'unknown',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  renderButton();
  const user = await pick(pdf());
  await screen.findByText(/Erkannt: Beleg/);
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const summary = await screen.findByRole('region', { name: 'Ergebnis des Uploads' });
  expect(summary.textContent).toContain('Erkannt: Beleg');
  expect(summary.textContent).toContain('Es wurde nichts gebucht.');
  expect(screen.getByRole('link', { name: 'Zu Prüfen' }).getAttribute('href')).toBe(
    '/konten/pruefen',
  );
  await user.click(screen.getByRole('button', { name: 'Fertig' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Ergebnis des Uploads' })).toBeNull(),
  );
});

it('hands the detected type label to the statement and payslip flows', async () => {
  result = {
    type: 'payslip',
    confidence: 'certain',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  renderButton();
  const user = await pick(pdf());
  await screen.findByText(/Erkannt: Gehaltszettel/);
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  await waitFor(() => expect(payslip).toHaveBeenCalled());
  expect((payslip.mock.calls[0]![0] as { handoff: { typeLabel: string } }).handoff.typeLabel).toBe(
    'Gehaltszettel',
  );
});

it('renders an icon-only trigger with an accessible name when compact', async () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <DocumentUploadButton compact label="Neues Dokument hochladen" />
    </QueryClientProvider>,
  );
  const button = screen.getByRole('button', { name: 'Neues Dokument hochladen' });
  expect(button.textContent).toBe('');
  expect(button.className).toContain('icon-btn');
});
