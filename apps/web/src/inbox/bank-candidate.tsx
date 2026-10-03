import { Button, Field, Select } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { lookupsQuery, payeesQuery } from '../ledger/queries';
import { candidateAssignmentQuery } from '../assignment/api';
import { AssignmentSummary } from '../assignment/review';
import { ErrorNote, LoadingNote } from '../ledger/states';
import '../pages/data-sources.css';
import '../assignment/assignment.css';

/** Rule preparation never posts the candidate. Manual changes override every suggested action. */
export function BankCandidate({
  id,
  onConfirmed,
}: {
  id: string;
  onConfirmed?: ((bookingId: string) => void) | undefined;
}) {
  const lookups = useQuery(lookupsQuery()),
    payees = useQuery(payeesQuery());
  const review = useQuery(candidateAssignmentQuery(id));
  const [categoryId, setCategory] = useState(''),
    [payeeId, setPayee] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null | undefined>(),
    [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const first = review.data?.suggestions[0];
  const ruleId =
    selected === undefined && first?.automatic && !first.unavailable ? first.id : selected;
  const rule = review.data?.suggestions.find((r) => r.id === ruleId);
  const recipient = payeeId ?? review.data?.cleanup.payeeId ?? '';
  return (
    <div className="bank-candidate assignment-review">
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
