// @vitest-environment jsdom
// Lazy chunk resolved from the module cache, so the dialog opens within the test's wait.
import './document-upload-flow';
import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  AccountStatementIntake: (props: {
    accountId: string;
    handoff: { file: File };
    onHandoffClose: () => void;
  }) => {
    statement(props);
    return (
      <>
        <button onClick={props.onHandoffClose}>Close statement flow</button>
        <a
          href="/konten/pruefen"
          onClick={(event) => {
            event.preventDefault();
            if (allowStatementClose) props.onHandoffClose();
          }}
        >
          Zu Prüfen im Einzelablauf
        </a>
      </>
    );
  },
}));
vi.mock('../reports/payslip-panel', () => ({
  PayslipUploadDialog: (props: { handoff: { file: File } }) => {
    payslip(props);
    return <p>payslip flow</p>;
  },
}));

const ACCOUNT = 'synthetic-card-account';
let noticeItems: {
  id: string;
  receiptId: string;
  filename: string;
  classification: string;
  status: string;
  token: string;
}[] = [];
let archiveRequests: unknown[] = [];
let failReceipt = false;
let allowStatementClose = true;
let result: Classification;
let classifyBodies: FormData[];
beforeEach(() => {
  classifyBodies = [];
  noticeItems = [];
  archiveRequests = [];
  failReceipt = false;
  allowStatementClose = true;
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
    if (path === '/api/document-intake/notices/archive') {
      archiveRequests.push(JSON.parse(String(init?.body)));
      return Response.json({ groupId: 'synthetic-batch-group' });
    }
    if (path === '/api/document-intake/notices') {
      if (init?.method === 'POST') return Response.json({ groupId: 'synthetic-group' });
      return Response.json({ items: noticeItems });
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
  await user.upload(await screen.findByLabelText('Dokument auswählen'), file);
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

it('proposes the only matching account and lets the owner change it', async () => {
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
  expect(next.disabled).toBe(false);
  expect((screen.getByLabelText('Konto') as HTMLSelectElement).value).toBe('synthetic-giro');
  await user.selectOptions(await screen.findByLabelText('Konto'), ACCOUNT);
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

it('keeps the dialog and the file when saving the receipt fails, and closes on success', async () => {
  result = {
    type: 'receipt',
    confidence: 'unknown',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  renderButton();
  const file = pdf();
  const user = await pick(file);
  await screen.findByText(/Erkannt: Beleg/);
  failReceipt = true;
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  await waitFor(() => expect(receipt).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('button', { name: 'Weiter' })).toBeTruthy();
  failReceipt = false;
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  await waitFor(() => expect(receipt).toHaveBeenCalledTimes(2));
  expect(receipt).toHaveBeenLastCalledWith(file);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Weiter' })).toBeNull());
});

it('routes a recognised notice to an explicit archive action without opening payroll review', async () => {
  result = {
    type: 'pension',
    confidence: 'certain',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  renderButton();
  const user = await pick(pdf());
  await screen.findByText('Erkannt: Pensionskassen-Mitteilung');
  expect(screen.getByText(/Original bleibt mit seiner Klassifikation/)).toBeTruthy();
  await user.click(
    screen.getByRole('button', {
      name: 'Als Bonus-/Pensionsmitteilung archivieren; keinen Gehaltsimport erstellen',
    }),
  );
  expect(await screen.findByText('Original: im Mitteilungsarchiv gespeichert.')).toBeTruthy();
  expect(
    screen.getByText('Gehaltsimport-Vorschlag: verworfen. Es wurde nichts gebucht.'),
  ).toBeTruthy();
  expect(payslip).not.toHaveBeenCalled();
  expect(receipt).not.toHaveBeenCalled();
});

it('previews each stored notice before sending one explicit batch decision', async () => {
  noticeItems = ['one', 'two'].map((id) => ({
    id,
    receiptId: id,
    filename: `synthetic-${id}.pdf`,
    classification: 'pension',
    status: 'pending',
    token: id,
  }));
  renderButton();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Dokument hochladen' }));
  await user.click(await screen.findByText('Mitteilungsarchiv und offene Importvorschl\u00e4ge'));
  await user.click(await screen.findByRole('button', { name: 'Archivierung pr\u00fcfen (2)' }));
  expect(screen.getByRole('region', { name: 'Archivierungsvorschau' }).textContent).toContain(
    'synthetic-one.pdf',
  );
  expect(screen.getByRole('region', { name: 'Archivierungsvorschau' }).textContent).toContain(
    'synthetic-two.pdf',
  );
  expect(archiveRequests).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Mitteilungen gemeinsam archivieren' }));
  await waitFor(() =>
    expect(archiveRequests).toEqual([
      {
        items: [
          { id: 'one', token: 'one' },
          { id: 'two', token: 'two' },
        ],
      },
    ]),
  );
});

it('keeps separate rows and retries only a failed file without writing any document', async () => {
  result = {
    type: 'card_statement',
    confidence: 'certain',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  const baseFetch = fetch;
  let fail = true;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (
      String(input).endsWith('/classify') &&
      (init?.body as FormData).get('file') instanceof File
    ) {
      const file = (init?.body as FormData).get('file') as File;
      if (file.name === 'failed.pdf' && fail) {
        classifyBodies.push(init?.body as FormData);
        return Response.json(
          { error: 'synthetic_failure', message: 'Prüfung fehlgeschlagen.' },
          { status: 422 },
        );
      }
    }
    return baseFetch(input, init);
  });
  renderButton();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Dokument hochladen' }));
  await user.upload(await screen.findByLabelText('Dokument auswählen'), [
    new File(['pdf'], 'good.pdf', { type: 'application/pdf' }),
    new File(['pdf'], 'failed.pdf', { type: 'application/pdf' }),
  ]);
  const good = within(screen.getByRole('region', { name: 'good.pdf' }));
  const failed = within(screen.getByRole('region', { name: 'failed.pdf' }));
  await good.findByText('Erkannt: Kreditkartenabrechnung');
  await failed.findByRole('alert');
  expect((good.getByLabelText('Konto') as HTMLSelectElement).value).toBe(ACCOUNT);
  await user.selectOptions(good.getByLabelText('Konto'), 'synthetic-giro');
  fail = false;
  await user.click(failed.getByRole('button', { name: 'Erneut versuchen' }));
  await failed.findByText('Erkannt: Kreditkartenabrechnung');
  expect(classifyBodies.map((body) => (body.get('file') as File).name)).toEqual([
    'good.pdf',
    'failed.pdf',
    'failed.pdf',
  ]);
  expect((good.getByLabelText('Konto') as HTMLSelectElement).value).toBe('synthetic-giro');
  expect(receipt).not.toHaveBeenCalled();
  expect(statement).not.toHaveBeenCalled();
  expect(payslip).not.toHaveBeenCalled();
  await user.click(good.getByRole('button', { name: 'Weiter' }));
  await waitFor(() => expect(statement).toHaveBeenCalled());
  expect(statement.mock.calls[0]![0].accountId).toBe('synthetic-giro');
  await user.click(screen.getByRole('button', { name: 'Close statement flow' }));
  expect(good.getByText(/Einzelprüfung geschlossen/)).toBeTruthy();
  expect(failed.getByText('Erkannt: Kreditkartenabrechnung')).toBeTruthy();
  await user.upload(
    await screen.findByLabelText('Dokument auswählen'),
    new File(['pdf'], 'next.pdf', { type: 'application/pdf' }),
  );
  const next = within(screen.getByRole('region', { name: 'next.pdf' }));
  await next.findByText('Erkannt: Kreditkartenabrechnung');
  expect((next.getByLabelText('Konto') as HTMLSelectElement).value).toBe('synthetic-giro');
});

it('leaves an ambiguous account proposal empty until the owner chooses', async () => {
  result = {
    type: 'bank_statement',
    confidence: 'certain',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  const baseFetch = fetch;
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (String(input).endsWith('/api/accounts'))
      return Response.json({
        accounts: [
          { id: 'synthetic-one', name: 'Muster Eins', type: 'checking' },
          { id: 'synthetic-two', name: 'Muster Zwei', type: 'checking' },
        ],
      });
    return baseFetch(input, init);
  });
  renderButton();
  const user = await pick(pdf());
  await screen.findByText('Erkannt: Kontoauszug');
  expect((screen.getByLabelText('Konto') as HTMLSelectElement).value).toBe('');
  expect((screen.getByRole('button', { name: 'Weiter' }) as HTMLButtonElement).disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText('Konto'), 'synthetic-two');
  expect((screen.getByRole('button', { name: 'Weiter' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it('keeps the batch until the nested review allows outcome navigation', async () => {
  result = {
    type: 'card_statement',
    confidence: 'certain',
    hints: { mime: 'application/pdf' },
    needsPassword: false,
  };
  renderButton(ACCOUNT);
  const user = await pick(pdf());
  await screen.findByText('Erkannt: Kreditkartenabrechnung');
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const link = await screen.findByRole('link', { name: 'Zu Prüfen im Einzelablauf' });
  allowStatementClose = false;
  await user.click(link);
  expect(screen.getByRole('button', { name: 'Close statement flow' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'synthetic.pdf' })).toBeTruthy();
  allowStatementClose = true;
  await user.click(link);
  await waitFor(() => expect(screen.queryByRole('region', { name: 'synthetic.pdf' })).toBeNull());
});
