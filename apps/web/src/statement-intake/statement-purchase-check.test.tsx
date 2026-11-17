// @vitest-environment jsdom
import { emptyStatementFacts, type StatementPurchaseCheck } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { StatementPurchaseReview } from './statement-purchase-check';
import { notifyApiWrite } from '../api/http';
const source = { accountId: 'card', revision: 'revision', sha256: 'a'.repeat(64) };
const facts = {
  ...emptyStatementFacts(),
  currency: 'EUR' as const,
  payableCents: 1234,
  periodFrom: '2030-12-20',
  periodTo: '2031-01-19',
};
const line = { id: 'line', date: '2030-12-31', amountCents: -1234, description: 'Synthetic shop' };
const check = (patch: Partial<StatementPurchaseCheck> = {}): StatementPurchaseCheck => ({
  period: { from: '2030-12-20', to: '2031-01-19' },
  statementPurchaseCents: 1234,
  bookedPurchaseCents: 0,
  differenceCents: -1234,
  sumMatches: false,
  linesAvailable: true,
  matched: [],
  statementOnly: [{ line, ambiguous: false }],
  bookingOnly: [],
  amountDifferences: [],
  ...patch,
});
function transport(value: StatementPurchaseCheck, omittedBookings = 0) {
  return vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            check: value,
            omittedBookings,
            extractionIncomplete: !value.linesAvailable,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ),
  );
}
const props = { intakeId: 'intake', source, facts, password: '', disabled: false };
it('discards a delayed verdict after a competing local write', async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  render(<StatementPurchaseReview {...props} />);
  await userEvent.click(screen.getByRole('button'));
  await act(async () => {
    notifyApiWrite();
    resolve(
      new Response(JSON.stringify({ check: check({ sumMatches: true }), omittedBookings: 0 })),
    );
  });
  expect(screen.queryByText('Summe stimmt')).toBeNull();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAmountsHidden(false);
});
it('shows missing purchases and opens the existing capture flow without writing a booking', async () => {
  transport(check());
  render(<StatementPurchaseReview {...props} />);
  await userEvent.click(screen.getByRole('button', { name: 'Kartenkäufe jetzt abgleichen' }));
  const link = await screen.findByRole('link', { name: 'Fehlenden Kauf erfassen' });
  expect(link.getAttribute('href')).toBe(
    '/erfassen?konto=card&betrag=-12.34&empfaenger=Synthetic+shop',
  );
  expect(screen.getByText(/Summe weicht ab/).textContent).toContain('12,34');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
});
it('shows equal sums alongside unresolved ambiguity and booking drilldown', async () => {
  transport(
    check({
      sumMatches: true,
      differenceCents: 0,
      statementOnly: [{ line, ambiguous: true }],
      bookingOnly: [{ ...line, id: 'booking', date: '2030-12-31' }],
    }),
  );
  render(<StatementPurchaseReview {...props} />);
  await userEvent.click(screen.getByRole('button'));
  await screen.findByText('Summe stimmt');
  expect(screen.queryByRole('link', { name: 'Fehlenden Kauf erfassen' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Buchung öffnen' }).getAttribute('href')).toBe(
    '/konten/buchungen?konto=card&buchung=booking',
  );
  expect(screen.getByText(/Zuordnung mehrdeutig/)).toBeTruthy();
});
it('does not present omitted bookings or unreadable lines as a complete reconciliation and masks amounts', async () => {
  setAmountsHidden(true);
  transport(check({ sumMatches: true, linesAvailable: false, statementOnly: [] }), 1);
  render(<StatementPurchaseReview {...props} />);
  await userEvent.click(screen.getByRole('button'));
  await screen.findByText(/Abgleich unvollständig/);
  expect(screen.queryByText('Summe stimmt')).toBeNull();
  expect(screen.getByText(/Positionen nicht vollständig lesbar/)).toBeTruthy();
  expect(document.body.textContent).not.toContain('12,34');
});
it('invalidates a displayed result when draft facts change and supports explicit retry after an error', async () => {
  transport(check());
  const view = render(<StatementPurchaseReview {...props} />);
  await userEvent.click(screen.getByRole('button'));
  await screen.findByText(/Summe weicht ab/);
  view.rerender(<StatementPurchaseReview {...props} facts={{ ...facts, payableCents: 1235 }} />);
  expect(screen.queryByText(/Summe weicht ab/)).toBeNull();
  expect(screen.getByText(/Angaben geändert/)).toBeTruthy();
  vi.mocked(fetch).mockRejectedValueOnce(new Error('synthetic failure'));
  await userEvent.click(screen.getByRole('button'));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button'));
  await screen.findByText(/Summe weicht ab/);
});
it('does not offer capture when the cycle is unstated', async () => {
  transport(
    check({
      period: null,
      sumMatches: null,
      bookedPurchaseCents: null,
      differenceCents: null,
      statementOnly: [],
    }),
  );
  render(
    <StatementPurchaseReview {...props} facts={{ ...facts, periodFrom: null, periodTo: null }} />,
  );
  await userEvent.click(screen.getByRole('button'));
  await screen.findByText(/Zeitraum nicht angegeben/);
  expect(screen.queryByRole('link', { name: 'Fehlenden Kauf erfassen' })).toBeNull();
  expect(screen.queryByText('Summe stimmt')).toBeNull();
});
it('retains readable positions during incomplete extraction but never offers capture from incomplete evidence', async () => {
  transport(check({ linesAvailable: false }));
  render(<StatementPurchaseReview {...props} />);
  await userEvent.click(screen.getByRole('button'));
  await screen.findByText(/Positionen nicht vollständig lesbar/);
  expect(screen.queryByRole('link', { name: 'Fehlenden Kauf erfassen' })).toBeNull();
});
it('does not call a readable position missing when an omitted mixed booking may already contain it', async () => {
  transport(check(), 1);
  render(<StatementPurchaseReview {...props} />);
  await userEvent.click(screen.getByRole('button'));
  await screen.findByText(/Abgleich unvollständig/);
  expect(screen.queryByRole('link', { name: 'Fehlenden Kauf erfassen' })).toBeNull();
  expect(screen.queryByText(/Keine Buchung gefunden/)).toBeNull();
});
