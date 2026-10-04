import { Button, Field, Select, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur, shortDay } from '../ledger/format';
import { LEDGER_KEY, lookupsQuery, payeesQuery } from '../ledger/queries';
import { candidateAssignmentQuery } from '../assignment/api';
import { AssignmentSummary } from '../assignment/review';
import { ErrorNote, LoadingNote } from '../ledger/states';
import '../pages/data-sources.css';
import '../assignment/assignment.css';

type Match = {
  id: string;
  date: string;
  accountName: string;
  memo: string | null;
  amountCents: number;
};
/**
 * Explicit owner confirmation; the regular editor remains available after posting. Rule
 * preparation never posts the candidate, and manual changes override every suggested action.
 */
export function BankCandidate({
  id,
  onConfirmed,
}: {
  id: string;
  onConfirmed?: ((bookingId: string) => void) | undefined;
}) {
  useAmountPrivacy();
  const lookups = useQuery(lookupsQuery()),
    payees = useQuery(payeesQuery());
  const review = useQuery(candidateAssignmentQuery(id));
  const [categoryId, setCategory] = useState(''),
    [payeeId, setPayee] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null | undefined>(),
    [busy, setBusy] = useState(false);
  const [mergeId, setMerge] = useState(''),
    [transferId, setTransfer] = useState('');
  const matches = useQuery({
    queryKey: [...LEDGER_KEY, 'bank-matches', id],
    queryFn: () =>
      request<{ merge: Match[]; transfers: Match[] }>(
        'GET',
        '/api/bank-sync/candidates/' + encodeURIComponent(id) + '/matches',
      ),
  });
  const write = useBudgetWrite();
  const first = review.data?.suggestions[0];
  const ruleId =
    selected === undefined && first?.automatic && !first.unavailable ? first.id : selected;
  const rule = review.data?.suggestions.find((r) => r.id === ruleId);
  const recipient = payeeId ?? review.data?.cleanup.payeeId ?? '';
  return (
    <div className="bank-candidate assignment-review">
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
      {review.isPending && <LoadingNote what="Vorschläge" />}
      {review.isError && (
        <ErrorNote what="Vorschläge" error={review.error} onRetry={() => void review.refetch()} />
      )}
      {review.data?.existingTransfer && (
        <p>
          Dieser Umsatz ergänzt eine bereits gebuchte Umbuchung. Die Bestätigung verbindet die
          Bankdaten mit der Gegenbuchung.
        </p>
      )}
      {review.data && !review.data.existingTransfer && (
        <>
          <span>
            Bereinigter Empfänger:{' '}
            {review.data.cleanup.payeeName ?? (review.data.cleanup.cleaned || 'nicht erkannt')}
            {review.data.cleanup.learned ? ' · gemerkter Alias' : ''}
          </span>
          {!!review.data.suggestions.length && (
            <Field label="Regelvorschlag">
              {({ id }) => (
                <Select
                  id={id}
                  disabled={busy}
                  value={ruleId ?? ''}
                  onChange={(e) => setSelected(e.target.value || null)}
                >
                  <option value="">Manuell zuordnen</option>
                  {review.data.suggestions.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.name}
                      {r.unavailable
                        ? ' · prüfen'
                        : r.automatic
                          ? ' · automatisch vorbereitet'
                          : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {rule && (
            <>
              <AssignmentSummary rule={rule} />
              <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
                Vorschlag ablehnen
              </Button>
            </>
          )}
        </>
      )}
      {!rule && !review.data?.existingTransfer && (
        <>
          <Field label="Empfänger">
            {({ id }) => (
              <Select
                id={id}
                disabled={busy}
                value={recipient}
                onChange={(e) => setPayee(e.target.value)}
              >
                <option value="">Ohne Empfänger</option>
                {payees.data?.payees
                  .filter((p) => !p.systemKind)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Kategorie">
            {({ id }) => (
              <Select
                id={id}
                value={categoryId}
                disabled={busy}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Später zuordnen / Zu verteilen</option>
                {lookups.data?.categories
                  .filter((c) => c.kind !== 'card_payment')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </>
      )}
      <Button
        disabled={busy || review.isPending || review.isError || !!rule?.unavailable}
        size="sm"
        onClick={() => {
          setBusy(true);
          void write(
            () =>
              request<{ groupId: string; bookingId: string }>(
                'POST',
                '/api/bank-sync/candidates/' + encodeURIComponent(id) + '/confirm',
                rule
                  ? {
                      categoryId: null,
                      ruleId: rule.id,
                      revision: rule.revision,
                      candidateRevision: review.data?.candidateRevision,
                    }
                  : {
                      categoryId: categoryId || null,
                      candidateRevision: review.data?.candidateRevision,
                      actions: { categoryId: categoryId || null, payeeId: recipient || null },
                    },
              ),
            () => 'Bankumsatz als Buchung bestätigt.',
          )
            .then((result) => {
              if (result && (rule?.actions.categoryId || rule?.actions.splits || categoryId))
                onConfirmed?.(result.bookingId);
            })
            .finally(() => setBusy(false));
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
  useAmountPrivacy();
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
