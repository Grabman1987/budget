// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSplit } from '../ledger/booking-model';
import { BankCandidate } from './bank-candidate';
import {
  bankConfirmExtras,
  bankSplitLines,
  bankSplitRest,
  emptyBankFields,
  fillRest,
  startSplit,
} from './bank-all-fields-model';

// #1048: "Alle Felder" in the bank confirmation. Synthetic data only.
const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);

const line = { accountId: 'giro', date: '2026-09-30', amountCents: -1201 };

describe('bank split model', () => {
  it('starts with the whole amount on the chosen category and blocks until the rest is 0', () => {
    const splits = startSplit(line, 'essen');
    expect(splits.map((s) => [s.categoryId, s.amount])).toEqual([
      ['essen', '12,01'],
      ['', ''],
    ]);
    expect(bankSplitLines(line, splits)).toEqual({
      ok: false,
      error: 'Jede Zeile braucht einen Betrag.',
    });
    const over = [
      { ...splits[0]!, amount: '10' },
      { ...splits[1]!, amount: '2,02' },
    ];
    expect(bankSplitRest(line, over)).toBe(-1);
    expect(bankSplitLines(line, over)).toEqual({
      ok: false,
      error: 'Die Aufteilung ergibt nicht den Gesamtbetrag.',
    });
    const exact = fillRest(line, over, splits[1]!.key);
    expect(exact[1]!.amount).toBe('2,01');
    expect(bankSplitRest(line, exact)).toBe(0);
    expect(bankSplitLines(line, exact)).toEqual({
      ok: true,
      lines: [
        { categoryId: 'essen', amountCents: -1000 },
        { categoryId: null, amountCents: -201 },
      ],
    });
  });

  it('signs income lines positively and evaluates arithmetic with the domain parser', () => {
    const income = { ...line, amountCents: 5000 };
    const splits = [
      newSplit({ categoryId: 'a', amount: '20+10' }),
      newSplit({ categoryId: 'b', amount: '20' }),
    ];
    expect(bankSplitLines(income, splits)).toEqual({
      ok: true,
      lines: [
        { categoryId: 'a', amountCents: 3000 },
        { categoryId: 'b', amountCents: 2000 },
      ],
    });
  });

  it('caps split lines at 50 with a form message', () => {
    const many = Array.from({ length: 51 }, () => newSplit({ categoryId: 'a', amount: '1' }));
    expect(bankSplitLines({ ...line, amountCents: -5100 }, many)).toEqual({
      ok: false,
      error: 'Höchstens 50 Zeilen.',
    });
  });

  it('adds nothing to the request while all fields stay untouched', () => {
    expect(bankConfirmExtras(line, emptyBankFields(), [])).toEqual({ ok: true, extras: {} });
    expect(
      bankConfirmExtras(line, { ...emptyBankFields(), memo: '  Notiz ', projectId: 'p' }, ['r']),
    ).toEqual({ ok: true, extras: { memo: 'Notiz', projectId: 'p', receiptIds: ['r'] } });
  });
});

type Sent = { path: string; method: string; body: unknown };
let sent: Sent[];
let suggestions: unknown[];
let candidate: unknown;

beforeEach(() => {
  flags.REDESIGN_ENABLED = true;
  sent = [];
  suggestions = [];
  candidate = { ...line, currency: 'EUR', memo: 'Shop A' };
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      sent.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json(
        path.endsWith('/confirm')
          ? { groupId: 'group-1', bookingId: 'booking-1' }
          : { groupId: 'group-2' },
      );
    }
    if (path.includes('/matches')) return Response.json({ merge: [], link: [], transfers: [] });
    if (path.includes('/assignment-rules/candidates/'))
      return Response.json({
        candidate,
        suggestions,
        cleanup: { cleaned: 'Shop A', payeeId: null },
        candidateRevision: 'a'.repeat(64),
        existingTransfer: null,
      });
    return Response.json({
      groups: [{ id: 'g', name: 'Fixkosten', sortOrder: 1 }],
      categories: [
        { id: 'essen', name: 'Essen', groupId: 'g', kind: 'normal', sortOrder: 1 },
        { id: 'reise', name: 'Reise', groupId: 'g', kind: 'normal', sortOrder: 2 },
      ],
      projects: [
        { id: 'proj', name: 'Projekt A', archivedAt: null },
        { id: 'old', name: 'Altprojekt', archivedAt: '2026-01-01' },
      ],
      incomeTypes: [],
      payees: [],
      contacts: [],
    });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function openDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BankCandidate id="synthetic-0" />
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
  const summary = await screen.findByText('Alle Felder');
  return { client, details: summary.closest('details')! };
}
const confirm = () => screen.getByRole('button', { name: 'Als Buchung bestätigen' });
const confirmBody = () => sent.find((s) => s.path.endsWith('/confirm'))?.body;

describe('Alle Felder in the bank confirmation', () => {
  it('is collapsed by default inside the same dialog and shows the bank facts read-only', async () => {
    const { client, details } = await openDialog();
    expect(details.open).toBe(false);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(within(details).getByText('Alle Felder'));
    details.open = true;
    expect(within(details).getByText('Betrag laut Bank')).toBeTruthy();
    expect(within(details).getByText('Datum laut Bank')).toBeTruthy();
    // Bank facts are text, never inputs.
    expect(within(details).queryByLabelText('Betrag laut Bank')).toBeNull();
    expect(within(details).getByLabelText('Notiz').tagName).toBe('TEXTAREA');
    const project = within(details).getByLabelText('Projekt');
    // Archived projects cannot be assigned on a new booking.
    expect(within(project).queryByText('Altprojekt')).toBeNull();
    client.clear();
  });

  it('sends note and project on confirm and offers the grouped undo', async () => {
    const { client, details } = await openDialog();
    details.open = true;
    await waitFor(() => expect(within(details).getByLabelText('Projekt')).toBeTruthy());
    fireEvent.change(within(details).getByLabelText('Notiz'), {
      target: { value: 'Synthetische Notiz' },
    });
    fireEvent.change(within(details).getByLabelText('Projekt'), { target: { value: 'proj' } });
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'essen' } });
    await waitFor(() => expect((confirm() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm());
    await waitFor(() => expect(confirmBody()).toBeTruthy());
    expect(confirmBody()).toEqual({
      categoryId: 'essen',
      candidateRevision: 'a'.repeat(64),
      actions: { categoryId: 'essen', payeeId: null },
      memo: 'Synthetische Notiz',
      projectId: 'proj',
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    await waitFor(() =>
      expect(sent.find((s) => s.path === '/api/undo')?.body).toEqual({ groupId: 'group-1' }),
    );
    client.clear();
  });

  it('keeps the OFF build dialog unchanged (rollback path)', async () => {
    flags.REDESIGN_ENABLED = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <BankCandidate id="synthetic-0" />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await screen.findByLabelText('Kategorie');
    expect(screen.queryByText('Alle Felder')).toBeNull();
    client.clear();
  });

  it('keeps the previous dialog when the bank facts are incomplete', async () => {
    candidate = { id: 'synthetic-0' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <BankCandidate id="synthetic-0" />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await screen.findByLabelText('Kategorie');
    expect(screen.queryByText('Alle Felder')).toBeNull();
    client.clear();
  });

  it('keeps the previous request when the section stays untouched', async () => {
    const { client } = await openDialog();
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'essen' } });
    await waitFor(() => expect((confirm() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm());
    await waitFor(() =>
      expect(confirmBody()).toEqual({
        categoryId: 'essen',
        candidateRevision: 'a'.repeat(64),
        actions: { categoryId: 'essen', payeeId: null },
      }),
    );
    client.clear();
  });

  it('blocks confirm until split lines leave no rest, with labelled line controls', async () => {
    const { client, details } = await openDialog();
    details.open = true;
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'essen' } });
    fireEvent.click(within(details).getByRole('button', { name: 'Aufteilen' }));
    // Split lines replace the single category field.
    expect(screen.queryByLabelText('Kategorie')).toBeNull();
    expect((within(details).getByLabelText('Kategorie 1') as HTMLSelectElement).value).toBe(
      'essen',
    );
    fireEvent.change(within(details).getByLabelText('Betrag 1'), { target: { value: '10' } });
    fireEvent.change(within(details).getByLabelText('Kategorie 2'), {
      target: { value: 'reise' },
    });
    expect(within(details).getByRole('status').textContent).toContain('Rest');
    expect((confirm() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(details).getByRole('button', { name: 'Rest in Zeile 2 übernehmen' }));
    expect((within(details).getByLabelText('Betrag 2') as HTMLInputElement).value).toBe('2,01');
    await waitFor(() => expect((confirm() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm());
    await waitFor(() => expect(confirmBody()).toBeTruthy());
    expect(confirmBody()).toEqual({
      categoryId: null,
      candidateRevision: 'a'.repeat(64),
      actions: { payeeId: null },
      splits: [
        { categoryId: 'essen', amountCents: -1000 },
        { categoryId: 'reise', amountCents: -201 },
      ],
    });
    client.clear();
  });

  it('stops adding split lines at the cap and says why', async () => {
    const { client, details } = await openDialog();
    details.open = true;
    fireEvent.click(within(details).getByRole('button', { name: 'Aufteilen' }));
    const add = within(details).getByRole('button', { name: 'Zeile hinzufügen' });
    for (let i = 2; i < 50; i++) fireEvent.click(add);
    expect(within(details).getAllByTestId('bank-split-line')).toHaveLength(50);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(within(details).getByText('Höchstens 50 Zeilen.')).toBeTruthy();
    client.clear();
  });

  it('lets manual split lines replace an applied rule, and a chosen rule end them', async () => {
    suggestions = [
      {
        id: 'rule-1',
        name: 'Shop A aufteilen',
        revision: 'b'.repeat(64),
        automatic: true,
        unavailable: null,
        actions: {
          splits: [
            { categoryId: 'essen', weightBp: 5000 },
            { categoryId: 'reise', weightBp: 5000 },
          ],
        },
      },
    ];
    const { client, details } = await openDialog();
    details.open = true;
    const rule = await screen.findByLabelText('Regelvorschlag');
    expect((rule as HTMLSelectElement).value).toBe('rule-1');
    fireEvent.click(within(details).getByRole('button', { name: 'Selbst aufteilen' }));
    expect((screen.getByLabelText('Regelvorschlag') as HTMLSelectElement).value).toBe('');
    expect(within(details).getByLabelText('Kategorie 1')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Regelvorschlag'), { target: { value: 'rule-1' } });
    expect(within(details).queryByLabelText('Kategorie 1')).toBeNull();
    fireEvent.click(confirm());
    await waitFor(() =>
      expect(confirmBody()).toEqual({
        categoryId: null,
        ruleId: 'rule-1',
        revision: 'b'.repeat(64),
        candidateRevision: 'a'.repeat(64),
      }),
    );
    client.clear();
  });

  it('stacks split lines into one column on phones', () => {
    const css = readFileSync('apps/web/src/inbox/inbox.css', 'utf8');
    const phone = css.slice(css.lastIndexOf('@media (max-width: 767px)'));
    expect(phone).toMatch(/\.bank-split-line\s*{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(css).toMatch(
      /\.bank-all-fields \.btn,\s*\.bank-all-fields \.icon-btn\s*{[^}]*var\(--touch\)/,
    );
  });
});
