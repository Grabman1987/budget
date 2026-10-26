import { Button, Field, FormDialog, Select, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
const NO_MATCHES: Match[] = [];
export type PreparedBankSuggestion = (
  { action: 'rule'; ruleId: string; revision: string } | { action: 'merge'; bookingId: string }
) & { candidateRevision?: string; label: string };
type PreparedCallback = (suggestion: PreparedBankSuggestion | undefined) => void;

export function BankReview({
  children,
  suggestion,
}: {
  children: ReactNode;
  suggestion?: PreparedBankSuggestion | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details className="bank-review" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>{suggestion?.label ?? 'Vorschläge beim Öffnen prüfen'}</summary>
      {expanded && children}
    </details>
  );
}

export function BankCandidate({
  id,
  onConfirmed,
  onPrepared,
  description,
  disabled,
}: {
  id: string;
  onConfirmed?: ((id: string) => void) | undefined;
  onPrepared?: PreparedCallback | undefined;
  description?: string | undefined;
  disabled?: boolean | undefined;
}) {
  useAmountPrivacy();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visited, setVisited] = useState(false);
  const prepare = useCallback<PreparedCallback>(
    (suggestion) => onPrepared?.(suggestion),
    [onPrepared],
  );
  return (
    <>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => {
          setVisited(true);
          setOpen(true);
        }}
      >
        Übernehmen
      </Button>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Buchung übernehmen"
        beforeClose={() => !busy}
      >
        {/* Retain choices and prepared bulk suggestions when the popup is closed. Opening only reads. */}
        {visited && (
          <BankCandidateForm
            id={id}
            onConfirmed={onConfirmed}
            onPrepared={prepare}
            description={description}
            onClose={() => setOpen(false)}
            onBusy={setBusy}
          />
        )}
      </FormDialog>
    </>
  );
}
/**
 * Explicit owner confirmation; the regular editor remains available after posting. Rule
 * preparation never posts the candidate, and manual changes override every suggested action.
 */
function BankCandidateForm({
  id,
  onConfirmed,
  onPrepared,
  description,
  onClose,
  onBusy,
}: {
  id: string;
  onConfirmed?: ((bookingId: string) => void) | undefined;
  onPrepared: PreparedCallback;
  description?: string | undefined;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  useAmountPrivacy();
  const lookups = useQuery(lookupsQuery()),
    payees = useQuery(payeesQuery());
  const categoryGroups = useMemo(() => {
    const categories = (lookups.data?.categories ?? [])
      .filter((c) => c.kind !== 'card_payment')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const groups = [...(lookups.data?.groups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const known = new Set(groups.map((g) => g.id));
    const grouped = groups.map((g) => ({
      id: g.id,
      name: g.name,
      categories: categories.filter((c) => c.groupId === g.id),
    }));
    grouped.push({
      id: '',
      name: 'Ohne Gruppe',
      categories: categories.filter((c) => !c.groupId || !known.has(c.groupId)),
    });
    return grouped.filter((g) => g.categories.length > 0);
  }, [lookups.data]);
  const review = useQuery(candidateAssignmentQuery(id));
  const [categoryId, setCategory] = useState(''),
    [payeeId, setPayee] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null | undefined>(),
    [busy, setBusy] = useState(false);
  const [mergeId, setMerge] = useState(''),
    [transferId, setTransfer] = useState('');
  useEffect(() => onBusy(busy), [busy, onBusy]);
  const matches = useQuery({
    queryKey: [...LEDGER_KEY, 'bank-matches', id],
    queryFn: () =>
      request<{ merge: Match[]; link?: Match[]; transfers: Match[] }>(
        'GET',
        '/api/bank-sync/candidates/' + encodeURIComponent(id) + '/matches',
      ),
  });
  const write = useBudgetWrite();
  const first = review.data?.suggestions[0];
  const ruleId =
    selected === undefined &&
    (first?.automatic || first?.id.startsWith('inbox-learn:')) &&
    !first.unavailable
      ? first.id
      : selected;
  const rule = review.data?.suggestions.find((r) => r.id === ruleId);
  const recipient = payeeId ?? review.data?.cleanup.payeeId ?? '';
  const mergeRows = [...(matches.data?.merge ?? []), ...(matches.data?.link ?? [])];
  const merge = mergeRows.find((row) => row.id === mergeId) ?? mergeRows[0];
  useEffect(() => {
    const candidateRevision = review.data?.candidateRevision;
    onPrepared(
      // Without a settled match check a rule could be prepared although a merge target exists.
      !candidateRevision ||
        review.isError ||
        matches.isError ||
        matches.isPending ||
        matches.isFetching
        ? undefined
        : merge
          ? {
              action: 'merge',
              bookingId: merge.id,
              candidateRevision,
              label: `Mit Buchung ${shortDay(merge.date)} zusammenführen`,
            }
          : rule && !rule.unavailable && !categoryId && payeeId === undefined
            ? {
                action: 'rule',
                ruleId: rule.id,
                revision: rule.revision,
                candidateRevision,
                label: rule.name,
              }
            : undefined,
    );
  }, [
    onPrepared,
    review.data?.candidateRevision,
    review.isError,
    matches.isError,
    matches.isPending,
    matches.isFetching,
    merge,
    rule,
    categoryId,
    payeeId,
  ]);
  return (
    <form className="bkform bank-candidate-dialog" onSubmit={(event) => event.preventDefault()}>
      <div className="bk-head">
        <strong className="bk-kind">Buchung übernehmen</strong>
        <button
          type="button"
          className="icon-btn bk-close"
          aria-label="Schließen"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="bk-body kform">
        {description && <p className="kmeta">{maskMoneyText(description)}</p>}
        <div className="bank-candidate assignment-review">
          {matches.isError && (
            <ErrorNote
              what="Buchungsvorschläge"
              error={matches.error}
              onRetry={() => void matches.refetch()}
            />
          )}
          {(['merge', 'transfer'] as const).map((action) => {
            const rows =
              action === 'merge'
                ? [...(matches.data?.merge ?? []), ...(matches.data?.link ?? [])]
                : matches.data?.transfers;
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
                    ? 'Kategorie, Anteile und Notiz bleiben erhalten. Die Bankreferenz wird übernommen; bei eigenen Buchungen auch das Bankdatum.'
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
                    )
                      .then((result) => {
                        if (result) onClose();
                      })
                      .finally(() => setBusy(false));
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
            <ErrorNote
              what="Vorschläge"
              error={review.error}
              onRetry={() => void review.refetch()}
            />
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
                    {categoryGroups.map((g) => (
                      <optgroup key={g.id} label={g.name}>
                        {g.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                )}
              </Field>
            </>
          )}
        </div>
      </div>
      <div className="bk-foot">
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Abbrechen
        </Button>
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
                if (result) onClose();
              })
              .finally(() => setBusy(false));
          }}
        >
          {rule?.id.startsWith('inbox-learn:') ? 'Übernehmen' : 'Als Buchung bestätigen'}
        </Button>
      </div>
    </form>
  );
}

/**
 * A booked bank row is already an unchecked booking (decision 41). Offer the merge into an earlier
 * manual entry; nothing is shown while there is no match or the booking is not eligible.
 */
export function BankBookingMerge({
  bookingId,
  onPrepared,
}: {
  bookingId: string;
  onPrepared?: PreparedCallback | undefined;
}) {
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
  const rows = matches.data?.merge ?? NO_MATCHES;
  const selected = chosen || rows[0]?.id;
  useEffect(() => {
    const row = rows.find((r) => r.id === selected);
    onPrepared?.(
      row && !matches.isError && !matches.isFetching
        ? {
            action: 'merge',
            bookingId: row.id,
            label: `Mit Buchung ${shortDay(row.date)} zusammenführen`,
          }
        : undefined,
    );
  }, [onPrepared, selected, matches.isError, matches.isFetching, rows]);
  if (!rows.length) return null;
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
