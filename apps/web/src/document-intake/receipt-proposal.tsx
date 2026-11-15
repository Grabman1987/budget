import { cents, formatDecimal, parseAmount, type ReceiptProposal } from '@budget/domain';
import { Field, TextInput } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { eur, longDay } from '../ledger/format';

/** What the owner sees and may correct; nothing here is saved until "Weiter". */
export type ReceiptEdit = {
  amount: string;
  currency: string;
  date: string;
  payee: string;
  bookingId: string;
};
type Match = {
  id: string;
  date: string;
  amountCents: number;
  accountId: string;
  payee: string | null;
};

export const proposalToEdit = (proposal: ReceiptProposal): ReceiptEdit => ({
  amount: proposal.totalCents === null ? '' : formatDecimal(cents(proposal.totalCents)),
  currency: proposal.currency,
  date: proposal.date ?? '',
  payee: proposal.payee ?? '',
  bookingId: '',
});

/** Signed cents of the edited amount (negative = credit note), or null while empty or invalid. */
export function editedCents(value: ReceiptEdit): number | null {
  const parsed = parseAmount(value.amount);
  return parsed.ok && parsed.cents !== 0 ? parsed.cents : null;
}
const validDate = (day: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day));

async function loadMatches(
  totalCents: number,
  currency: string,
  date: string,
  payee: string,
): Promise<Match[]> {
  const response = await fetch('/api/document-intake/receipt-matches', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      totalCents,
      currency,
      date,
      ...(payee.trim() ? { payee: payee.trim().slice(0, 80) } : {}),
    }),
  });
  if (!response.ok) throw new Error('matches');
  return ((await response.json()) as { matches: Match[] }).matches;
}

/**
 * Editable proposal read from the receipt's text, plus existing bookings with the same amount
 * within five days. Choosing one attaches the receipt to it in the same upload.
 */
export function ReceiptProposalPanel({
  value,
  onChange,
  disabled,
}: {
  value: ReceiptEdit;
  onChange: (next: ReceiptEdit) => void;
  disabled: boolean;
}) {
  const total = editedCents(value);
  const lookup = total !== null && validDate(value.date);
  const matches = useQuery({
    queryKey: [
      'document-intake',
      'receipt-matches',
      total,
      value.currency,
      value.date,
      value.payee,
    ],
    queryFn: () => loadMatches(total!, value.currency, value.date, value.payee),
    enabled: lookup,
    retry: false,
  });
  return (
    <section className="document-proposal" aria-label="Erkannte Angaben">
      <p className="document-proposal-note">
        Vorschlag aus dem Text des Belegs. Bitte prüfen und bei Bedarf ändern.
      </p>
      <Field
        label="Betrag"
        hint={value.amount && total === null ? 'Kein gültiger Betrag.' : undefined}
      >
        {({ id }) => (
          <TextInput
            id={id}
            inputMode="decimal"
            money
            autoComplete="off"
            value={value.amount}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, amount: event.target.value, bookingId: '' })}
          />
        )}
      </Field>
      <Field label="Belegdatum">
        {({ id }) => (
          <TextInput
            id={id}
            type="date"
            value={value.date}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, date: event.target.value, bookingId: '' })}
          />
        )}
      </Field>
      <Field label="Zahlungsempfänger">
        {({ id }) => (
          <TextInput
            id={id}
            autoComplete="off"
            maxLength={80}
            value={value.payee}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, payee: event.target.value, bookingId: '' })}
          />
        )}
      </Field>
      {lookup && (
        <fieldset className="document-proposal-matches" disabled={disabled}>
          <legend>Passende Buchung anhängen</legend>
          {matches.isPending && <p role="status">Buchungen werden gesucht …</p>}
          {matches.isError && <p role="alert">Die Suche nach Buchungen ist fehlgeschlagen.</p>}
          {matches.data?.length === 0 && (
            <p>Keine Buchung mit diesem Betrag im Zeitraum von fünf Tagen gefunden.</p>
          )}
          {matches.data && matches.data.length > 0 && (
            <>
              {matches.data.map((row) => (
                <label key={row.id} className="document-proposal-match">
                  <input
                    type="radio"
                    name="receipt-booking"
                    checked={value.bookingId === row.id}
                    onChange={() => onChange({ ...value, bookingId: row.id })}
                  />
                  <span>
                    {longDay(row.date)} · {eur(row.amountCents)}
                    {row.payee ? ` · ${row.payee}` : ''}
                  </span>
                </label>
              ))}
              <label className="document-proposal-match">
                <input
                  type="radio"
                  name="receipt-booking"
                  checked={value.bookingId === ''}
                  onChange={() => onChange({ ...value, bookingId: '' })}
                />
                <span>Keine Buchung, nur den Beleg ablegen</span>
              </label>
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
