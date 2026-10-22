import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import type { BankInboxAcceptance, BankInboxRef } from '@budget/db';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { nativeCurrency, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote } from '../ledger/states';
import { BookingAssignmentReview } from '../assignment/review';
import { BankBookingMerge, BankCandidateForm } from './bank-candidate';
import { INBOX_KEY, resolveInbox, type InboxBooking, type InboxEntry, type InboxStored } from './api';
import { acceptSafeBankSuggestions, readBankReviewRound } from './bank-suggestion-api';
import { InboxTypeIcon } from './type-icon';
import './bank-suggestion.css';

type BankRow = InboxBooking | InboxStored;
const bankRows = (rows: InboxEntry[]) => rows.filter((row): row is BankRow =>
  (row.type === 'booking' || row.type === 'stored') && row.bankSuggestion !== undefined);
const noop = () => undefined;
const ReviewContext = createContext({
  blocked: false,
  accept: (_rows: BankRow[]) => undefined as void,
  dismiss: (_row: InboxStored) => undefined as void,
  reviewed: (_ids: string[]) => undefined as void,
  editing: (_id: string, _editing: boolean) => undefined as void,
});

/** This is a bounded, in-page review round, never a lifetime reviewed/total counter. */
export function BankReviewSession({ rows, fresh, enabled, children }: {
  rows: InboxEntry[];
  fresh: boolean;
  enabled: boolean;
  children: ReactNode;
}) {
  useAmountPrivacy();
  const current = bankRows(rows).slice(0, 100);
  const [round, setRound] = useState<Array<{ key: string; ref: BankInboxRef }>>([]);
  const added = current.filter((row) => !round.some((known) => known.key === row.id))
    .map((row) => ({ key: row.id, ref: { type: row.bankSuggestion!.type, id: row.bankSuggestion!.id } }));
  if (enabled && added.length && round.length < 100)
    setRound([...round, ...added].slice(0, 100));
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const write = useBudgetWrite();
  const qc = useQueryClient();
  const refs = round.map((row) => row.ref);
  const membership = useQuery({
    queryKey: [...LEDGER_KEY, 'bank-review-round', refs],
    enabled: enabled && refs.length > 0 && acknowledged.size > 0,
    retry: false,
    refetchInterval: 60_000,
    queryFn: () => readBankReviewRound(refs),
  });
  const reviewed = useCallback((ids: string[]) => {
    setAcknowledged((previous) => new Set([...previous, ...ids]));
  }, []);
  const editing = useCallback((id: string, open: boolean) => {
    setEditingRows((previous) => {
      const next = new Set(previous);
      if (open) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const membershipReady = acknowledged.size === 0 || (membership.isSuccess && !membership.isFetching);
  const blocked = !fresh || busy || failed || !membershipReady;
  const accept = (chosen: BankRow[]) => {
    if (saving.current || blocked) return;
    const payload: BankInboxAcceptance[] = chosen.slice(0, 100).flatMap((row) => {
      const suggestion = row.bankSuggestion;
      return suggestion ? [{ type: suggestion.type, id: suggestion.id,
        ...(suggestion.state === 'ready' && !editingRows.has(row.id) ? { revision: suggestion.revision } : {}) }] : [];
    });
    const count = payload.filter((row) => row.revision).length;
    if (!count) return;
    saving.current = true;
    setBusy(true);
    void write(() => acceptSafeBankSuggestions(payload, count), (result) =>
      `${result.changedCount} Vorschläge übernommen · ${result.skippedCount} übersprungen.`,
    ).then((result) => {
      if (result) reviewed(result.accepted); else setFailed(true);
    }).finally(() => { saving.current = false; setBusy(false); });
  };
  const dismiss = (row: InboxStored) => {
    if (saving.current || blocked) return;
    saving.current = true;
    setBusy(true);
    void write(() => resolveInbox(row.id), () => 'Bankumsatz nicht übernommen.').then((result) => {
      if (result) reviewed([row.id]); else setFailed(true);
    }).finally(() => { saving.current = false; setBusy(false); });
  };
  // A fresh server read also sees Undo reopenings beyond the currently loaded page.
  const completed = round.filter((row) => acknowledged.has(row.key) &&
    membership.data?.states[row.key] === 'closed').length;
  const safe = current.filter((row) => row.bankSuggestion?.state === 'ready' && !editingRows.has(row.id)).length;
  return <ReviewContext.Provider value={{ blocked, accept, dismiss, reviewed, editing }}>
    {enabled && round.length > 0 && <section className="bank-review-round" aria-label="Fortschritt der Bankprüfung">
      {fresh && membershipReady ? <>
        <p role="status">{round.length - completed} offen · {completed} von {round.length} geprüft</p>
        <progress max={round.length} value={completed} aria-label="Geprüfte Umsätze dieser Prüfrunde" />
      </> : <p role="status">Der Stand der Prüfrunde wird aktualisiert.</p>}
      <p className="inbox-hint">Geladene Prüfrunde · höchstens 100 Umsätze. Gezählt werden bestätigte Aktionen; Rückgängig öffnet die betroffene Zeile wieder.</p>
      <Button disabled={blocked || safe === 0} onClick={() => accept(current)}>
        {busy ? 'Vorschläge werden übernommen …' : `${safe} Vorschläge übernehmen`}
      </Button>
      <Button variant="ghost" disabled={busy || !fresh} onClick={() => {
        setRound([]);
        setAcknowledged(new Set());
      }}>Neue Prüfrunde mit den geladenen Umsätzen</Button>
      {membership.isError && <ErrorNote what="Fortschritt der Bankprüfung" error={membership.error}
        onRetry={() => void membership.refetch()} />}
      {failed && <div role="alert">
        <p>Die Vorschläge wurden nicht übernommen. Bitte den aktuellen Stand neu laden.</p>
        <Button variant="ghost" onClick={() => {
          setFailed(false);
          void qc.invalidateQueries({ queryKey: INBOX_KEY });
        }}>Vorschläge neu laden</Button>
      </div>}
    </section>}
    {children}
  </ReviewContext.Provider>;
}

/** List metadata is sufficient for the initial decision; detailed reads start only at Ändern. */
export function BankSuggestedRow({ item, busy, onConfirmed, onEdit, onConfirm }: {
  item: BankRow;
  busy: boolean;
  onConfirmed: (id: string) => void;
  onEdit: (id: string) => void;
  onConfirm: (id: string) => void;
}) {
  useAmountPrivacy();
  const session = useContext(ReviewContext);
  const [changing, setChanging] = useState(false);
  const qc = useQueryClient();
  useEffect(() => () => session.editing(item.id, false), [item.id, session.editing]);
  const data = item.type === 'booking' ? item : item.bankCandidate;
  const suggestion = item.bankSuggestion;
  const ready = suggestion?.state === 'ready' && !changing && !session.blocked;
  const disabled = busy || session.blocked;
  const confirmed = (id: string) => { session.reviewed([item.id]); onConfirmed(id); };
  const toggle = () => {
    const next = !changing;
    setChanging(next);
    session.editing(item.id, next);
    if (!next) void qc.invalidateQueries({ queryKey: INBOX_KEY });
  };
  return <tr className="rev-row bank-inbox-row" data-testid="inbox-row">
    <td className="rev-mark"><InboxTypeIcon entry={item} /></td>
    <td className="rev-what">
      <strong>{data ? <>{maskMoneyText(data.payeeName || data.memo || 'Bankumsatz')} · {nativeCurrency(data.amountCents, data.currency)}</> : 'Bankumsatz'}</strong>
      <span>{data ? maskMoneyText(`${longDay(data.date)} · ${data.accountName}${data.memo && data.memo !== data.payeeName ? ` · ${data.memo}` : ''}`) : ''}</span>
      <span className="bank-precomputed-suggestion">{ready ? 'Vorschlag passt · ' : 'Vorschlag prüfen · '}{maskMoneyText(suggestion?.label.replace(/^Vorschlag prüfen · /, '') ?? 'Einzeln zuordnen')}</span>
    </td>
    <td className="rev-act kact">
      <div className="bank-suggestion-actions">
        <Button size="sm" disabled={disabled || !ready} onClick={() => session.accept([item])}>Passt ✓</Button>
        <Button size="sm" variant="ghost" disabled={disabled} aria-expanded={changing} onClick={toggle}>
          {changing ? 'Änderung schließen' : 'Ändern…'}
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled || item.type !== 'stored'}
          onClick={() => { if (item.type === 'stored') session.dismiss(item); }}>
          Nicht übernehmen
        </Button>
      </div>
      {item.type === 'booking' && <p className="inbox-hint">Gebuchte Umsätze bleiben im Register; „Nicht übernehmen“ löscht keine Buchung.</p>}
      {changing && <fieldset className="bank-manual-fields" disabled={disabled}>
        {item.type === 'stored' && item.refId ?
        <BankCandidateForm id={item.refId} onConfirmed={confirmed} onPrepared={noop} /> :
        item.type === 'booking' ? <div className="bank-manual-review">
          <BookingAssignmentReview id={item.bookingId} onApplied={(canLearn) => { if (canLearn) confirmed(item.bookingId); }} />
          {item.status === 'pending' && <BankBookingMerge bookingId={item.bookingId} />}
          <Button variant="ghost" disabled={disabled} onClick={() => onEdit(item.bookingId)}>Zuordnen</Button>
          {item.status === 'pending' && <Button variant="ghost" disabled={disabled} onClick={() => onConfirm(item.bookingId)}>Bestätigen</Button>}
        </div> : null}
      </fieldset>}
    </td>
  </tr>;
}
