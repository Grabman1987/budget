import { Button, Field, Select } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur, shortDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote } from '../ledger/states';
import { lookupsQuery } from '../ledger/queries';
import '../pages/data-sources.css';

type Match = {
  id: string;
  date: string;
  accountName: string;
  memo: string | null;
  amountCents: number;
};
/** Explicit owner confirmation; the regular editor remains available after posting. */
export function BankCandidate({ id }: { id: string }) {
  const query = useQuery(lookupsQuery());
  const matches = useQuery({
    queryKey: [...LEDGER_KEY, 'bank-matches', id],
    queryFn: () =>
      request<{ merge: Match[]; transfers: Match[] }>(
        'GET',
        '/api/bank-sync/candidates/' + encodeURIComponent(id) + '/matches',
      ),
  });
  const [mergeId, setMerge] = useState('');
  const [transferId, setTransfer] = useState('');
  const [categoryId, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  return (
    <div className="bank-candidate">
      {matches.isError && (
        <ErrorNote
          what="Buchungsvorschläge"
          error={matches.error}
          onRetry={() => void matches.refetch()}
        />
      )}
      {(['merge', 'transfer'] as const).map((action) => {
        const rows = action === 'merge' ? matches.data?.merge : matches.data?.transfers;
        if (!rows?.length) return null;
        const selected = (action === 'merge' ? mergeId : transferId) || rows[0]!.id;
        const setSelected = action === 'merge' ? setMerge : setTransfer;
        return (
          <div key={action}>
            <Field
              label={
                action === 'merge'
                  ? 'Passende Buchung (geringster Datumsabstand zuerst)'
                  : 'Passende Gegenbuchung'
              }
            >
              {({ id: fieldId }) => (
                <Select
                  id={fieldId}
                  value={selected}
                  disabled={busy}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {shortDay(row.date)} · {row.accountName} · {row.memo || 'Buchung'} ·{' '}
                      {eur(row.amountCents, { sign: true })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="kmeta">
              {action === 'merge'
                ? 'Kategorie, Anteile und Notiz bleiben erhalten. Datum und Bankreferenz werden übernommen.'
                : 'Kategorien werden entfernt. Beide Buchungstage bleiben erhalten.'}
            </p>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void write(
                  () =>
                    request<{ groupId: string }>(
                      'POST',
                      '/api/bank-sync/candidates/' + encodeURIComponent(id) + '/' + action,
                      { bookingId: selected },
                    ),
                  () =>
                    action === 'merge'
                      ? 'Bankumsatz mit Buchung zusammengeführt.'
                      : 'Als Umbuchung verbunden.',
                ).finally(() => setBusy(false));
              }}
            >
              {action === 'merge'
                ? 'Mit Buchung ' +
                  shortDay(rows.find((r) => r.id === selected)?.date ?? rows[0]!.date) +
                  ' zusammenführen'
                : 'Als Umbuchung verbinden'}
            </Button>
          </div>
        );
      })}
      <Field label="Kategorie">
        {({ id }) => (
          <Select
            id={id}
            value={categoryId}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Später zuordnen / Zu verteilen</option>
            {query.data?.categories
              .filter((c) => c.kind !== 'card_payment')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        )}
      </Field>
      <Button
        disabled={busy}
        size="sm"
        onClick={() => {
          setBusy(true);
          void write(
            () =>
              request<{ groupId: string }>(
                'POST',
                '/api/bank-sync/candidates/' + encodeURIComponent(id) + '/confirm',
                { categoryId: categoryId || null },
              ),
            () => 'Bankumsatz als Buchung bestätigt.',
          ).finally(() => setBusy(false));
        }}
      >
        Als Buchung bestätigen
      </Button>
    </div>
  );
}

/**
 * A booked bank row is already an unchecked booking (decision 41). Offer the merge into an earlier
 * manual entry; nothing is shown while there is no match or the booking is not eligible.
 */
export function BankBookingMerge({ bookingId }: { bookingId: string }) {
  const matches = useQuery({
    queryKey: [...LEDGER_KEY, 'bank-booking-matches', bookingId],
    queryFn: () =>
      request<{ merge: Match[] }>(
        'GET',
        '/api/bank-sync/bookings/' + encodeURIComponent(bookingId) + '/matches',
      ),
    retry: false,
  });
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const rows = matches.data?.merge ?? [];
  if (!rows.length) return null;
  const selected = chosen || rows[0]!.id;
  return (
    <div className="bank-candidate">
      <Field label="Passende eigene Buchung (geringster Datumsabstand zuerst)">
        {({ id: fieldId }) => (
          <Select
            id={fieldId}
            value={selected}
            disabled={busy}
            onChange={(e) => setChosen(e.target.value)}
          >
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {shortDay(row.date)} · {row.accountName} · {row.memo || 'Buchung'} ·{' '}
                {eur(row.amountCents, { sign: true })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <p className="kmeta">
        Deine Buchung bleibt mit Kategorie, Anteilen und Notiz erhalten und übernimmt Datum und
        Bankreferenz. Die doppelte Bankbuchung entfällt.
      </p>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void write(
            () =>
              request<{ groupId: string }>(
                'POST',
                '/api/bank-sync/bookings/' + encodeURIComponent(bookingId) + '/merge',
                { bookingId: selected },
              ),
            () => 'Bankbuchung mit eigener Buchung zusammengeführt.',
          ).finally(() => setBusy(false));
        }}
      >
        Mit eigener Buchung zusammenführen
      </Button>
    </div>
  );
}
