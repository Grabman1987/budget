import './reconcile.css';
import {
  useAmountPrivacy,
  AmountInput,
  Button,
  Field,
  Select,
  TextInput,
  maskMoneyText,
} from '@budget/ui';
import {
  cents,
  formatDecimal,
  isReconcileAdjustCategoryKind,
  parseAmount,
  todayInVienna,
} from '@budget/domain';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLink } from '../shell/app-link';
import { ApiError } from '../api/http';
import { fetchBookings, previewReconciliation, reconcileAccount, type ReconcileRequest } from './api';
import { nativeCurrency, valuedCurrency, longDay } from './format';
import { errorText } from './labels';
import { useLedgerWrites } from './mutations';
import { LEDGER_KEY, lookupsQuery } from './queries';
import { findingOf, reconciliationCandidateKeys, reconciliationReviewKey } from './reconcile-model';
import { ErrorNote, LoadingNote } from './states';
import type { AccountRow, ReconcileResult } from './types';
import { SettingsFormDialog } from '../pages/settings-form-dialog';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { categoriesFor, pickableCategories } from './capture-model';

/** Value that follows `value` after a pause (the preview is asked for when typing stops). */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** Owner-triggered reconciliation in a form dialog. */
export function ReconcilePanel({
  account,
  open,
  onClose,
}: {
  account: AccountRow;
  open: boolean;
  onClose: () => void;
}) {
  useAmountPrivacy();
  return (
    <SettingsFormDialog open={open} onClose={onClose} title={`Kontostand prüfen · ${account.name}`}>
      <ReconcileFlow key={account.id} account={account} onDone={onClose} />
    </SettingsFormDialog>
  );
}

export function ReconcileFlow({
  account,
  onDone,
  initialDate,
  monthClose,
}: {
  account: AccountRow;
  onDone: () => void;
  initialDate?: string | undefined;
  monthClose?: {
    asOf: string;
    confirm: (input: ReconcileRequest & { note?: string }) => Promise<{ result: ReconcileResult }>;
    onReload: () => void;
    onBusy: (busy: boolean) => void;
  };
}) {
  useAmountPrivacy();
  const qc = useQueryClient();
  const writes = useLedgerWrites();
  const today = todayInVienna();
  // A dirty form retains the close revision captured when it was opened, never a silent refresh.
  const [closeContext] = useState(monthClose);
  const [reason, setReason] = useState('');
  const [staleClose, setStaleClose] = useState(false);
  useEffect(() => () => { closeContext?.onBusy(false); }, [closeContext]);
  const [date, setDate] = useState(initialDate ?? today);
  const [text, setText] = useState('');
  const [adjustDate, setAdjustDate] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<{ key: string; ids: ReadonlySet<string> }>({ key: '', ids: new Set() });
  const [candidateBusy, setCandidateBusy] = useState(false);
  const candidateActive = useRef(false);
  const [unlock, setUnlock] = useState(false);
  const [bookingState, setBookingState] = useState<BookingPanelState>(null);
  const [error, setError] = useState<string | null>(null);
  const lookups = useQuery(lookupsQuery());
  const bank = account.bankBalance;
  const bankDate = bank?.effectiveDate ?? null;
  const adjustmentDay = adjustDate ?? date;
  const adjustmentValid =
    /^\d{4}-\d{2}-\d{2}$/.test(adjustmentDay) &&
    Number.isFinite(Date.parse(`${adjustmentDay}T00:00:00Z`)) &&
    new Date(`${adjustmentDay}T00:00:00Z`).toISOString().startsWith(adjustmentDay) &&
    adjustmentDay >= account.openingDate &&
    adjustmentDay <= date;
  // An explicitly back-dated Ausgleich on or before the last check changes a period the bank
  // already confirmed. The default (the check day itself) is never asked, as on the server.
  const locked =
    adjustDate !== null &&
    adjustmentValid &&
    account.lastReconciledOn != null &&
    adjustmentDay <= account.lastReconciledOn;

  const parsed = parseAmount(text);
  const statement = parsed.ok && text.trim() !== '' ? parsed.cents : null;
  const previewInput = useMemo(() => ({ date, statement }), [date, statement]);
  const asked = useDebounced(previewInput, 300);
  // The bank balance of a day that has not happened yet does not exist: check up to today.
  const future = date > today;
  const ready =
    asked.statement !== null && /^\d{4}-\d{2}-\d{2}$/.test(asked.date) &&
    Number.isFinite(Date.parse(`${asked.date}T00:00:00Z`)) &&
    new Date(`${asked.date}T00:00:00Z`).toISOString().startsWith(asked.date) &&
    asked.date >= account.openingDate && asked.date <= today;

  const preview = useQuery({
    queryKey: [...LEDGER_KEY, 'reconcile', account.id, asked.date, asked.statement],
    queryFn: () =>
      previewReconciliation(account.id, {
        date: asked.date,
        statementBalanceCents: asked.statement as number,
      }),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  const data = preview.data;
  const money = (amount: number, sign = false) => nativeCurrency(amount, account.currency, sign);
  const finding = data ? findingOf(data) : null;
  // The same plain spending categories for a surplus and a shortfall; the server enforces it too.
  const categories = data?.adjustmentCategories ?? categoriesFor(pickableCategories(undefined, lookups.data), 'expense').filter(
    (c) => isReconcileAdjustCategoryKind(c.kind),
  );
  const chosenCategoryId = categoryId ?? data?.rememberedCategoryId ?? '';
  const effectiveCategoryId = categories.some((row) => row.id === chosenCategoryId) ? chosenCategoryId : '';
  const categoryName = categories.find((c) => c.id === effectiveCategoryId)?.name ?? 'Zu verteilen';
  const reviewKey = data ? reconciliationReviewKey(data) : '';
  const ignored = reviewed.key === reviewKey ? reviewed.ids : new Set<string>();
  const candidateKeys = data ? reconciliationCandidateKeys(data) : [];
  const candidatesReviewed = data?.pendingCandidates !== undefined && candidateKeys.every((key) => ignored.has(key));
  const ignoreCandidate = (key: string) => setReviewed((previous) => {
    const ids = new Set(previous.key === reviewKey ? previous.ids : []);
    if (ids.has(key)) ids.delete(key); else ids.add(key);
    return { key: reviewKey, ids };
  });
  // The panel shows the answer for what is typed now, not for the previous input.
  const current =
    ready &&
    asked.statement === statement &&
    asked.date === date &&
    data?.accountId === account.id &&
    data.date === date &&
    data.statementBalanceCents === statement &&
    !preview.isPlaceholderData &&
    !preview.isFetching &&
    !preview.isError;

  const confirm = useMutation({
    onMutate: () => { closeContext?.onBusy(true); },
    mutationFn: (extra: Partial<ReconcileRequest>) => {
      const input = {
        date: asked.date,
        statementBalanceCents: asked.statement as number,
        ...extra,
        ...(closeContext && extra.adjust && reason.trim() ? { note: reason.trim() } : {}),
      };
      return closeContext ? closeContext.confirm(input) : reconcileAccount(account.id, input);
    },
    onSettled: () => { closeContext?.onBusy(false); },
    onSuccess: ({ result }) => {
      void qc.invalidateQueries({ queryKey: LEDGER_KEY });
      writes.offerUndo(
        result.adjustmentBookingId
          ? `Kontostand geprüft, Ausgleich ${money(result.differenceCents, true)} gebucht.`
          : `Kontostand geprüft: ${result.reconciledCount} Buchungen festgeschrieben.`,
        result.groupId,
      );
      onDone();
    },
    onError: (e) => {
      if (closeContext && e instanceof ApiError && (e.code === 'stale_close' || e.code === 'close_account_unavailable' || e.code === 'conflict')) setStaleClose(true);
      setError(errorText(e));
    },
  });
  const run = (extra: Partial<ReconcileRequest>) => {
    if (!current || confirm.isPending || candidateBusy || writes.remove.isPending || writes.patch.isPending || staleClose ||
      (extra.adjust && (!candidatesReviewed || (closeContext && !reason.trim())))) return;
    const revision = data?.candidateRevision;
    if (extra.adjust && !revision) {
      setError('Die Prüfungsrevision fehlt. Bitte die Kontoprüfung neu laden.');
      return;
    }
    setError(null);
    confirm.mutate(extra.adjust ? { ...extra, candidateRevision: revision } : extra);
  };
  const busy = confirm.isPending || candidateBusy || writes.remove.isPending || writes.patch.isPending;
  const openCandidate = async (id: string) => {
    if (!current || busy || candidateActive.current || staleClose) return;
    candidateActive.current = true; setCandidateBusy(true); closeContext?.onBusy(true); setError(null);
    try {
      const row = (await fetchBookings({ id, accountId: account.id })).items.find((row) => row.id === id);
      if (!row) throw new Error('Die Buchung ist nicht mehr verfügbar. Lade die Prüfung neu.');
      setBookingState({ mode: 'edit', booking: row });
    } catch (error) { setError(errorText(error)); }
    finally { candidateActive.current = false; setCandidateBusy(false); closeContext?.onBusy(false); }
  };
  const resolveCandidate = async (id: string, action: 'confirm' | 'delete', explains: boolean) => {
    if (!current || busy || candidateActive.current || staleClose) return;
    if (explains && (closeContext || action === 'confirm')) {
      run(action === 'confirm' ? { confirmBookingIds: [id] } : { removeBookingIds: [id] });
      return;
    }
    candidateActive.current = true;
    setCandidateBusy(true); closeContext?.onBusy(true); setError(null);
    try {
      if (action === 'delete') await writes.remove.mutateAsync({ id });
      else await writes.patch.mutateAsync({ id, patch: { status: 'confirmed' } });
      // The month-close form intentionally retains its source revision. An independent
      // candidate write cannot silently replace that retained close decision.
      if (closeContext) setStaleClose(true);
      await qc.invalidateQueries({ queryKey: LEDGER_KEY });
    } catch (error) { setError(errorText(error)); }
    finally { candidateActive.current = false; setCandidateBusy(false); closeContext?.onBusy(false); }
  };


  return (
    <div className="kform kreconcile">
      <p className="text-muted">
        Vergleicht den gebuchten App-Saldo mit dem Saldo laut Bank. Stimmt beides überein, werden
        die bestätigten Buchungen als geprüft festgeschrieben. Vorgemerkte Buchungen zählen nicht.
      </p>
      {bank && bank.amountCents !== null && bankDate && (
        <Button
          variant="ghost"
          disabled={busy || Boolean(closeContext && bankDate !== closeContext.asOf)}
          onClick={() => {
            setDate(bankDate);
            setText(formatDecimal(cents(bank.amountCents!)));
          }}
        >
          Bankstand übernehmen ({money(bank.amountCents)} vom {longDay(bankDate)})
        </Button>
      )}
      <Field label="Stichtag">
        {({ id }) => (
          <TextInput
            id={id}
            type="date"
            disabled={busy || Boolean(closeContext)}
            min={account.openingDate}
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
      {future && (
        <p className="field-error" role="alert">
          Der Stichtag liegt in der Zukunft. Geprüft wird höchstens bis heute.
        </p>
      )}
      <p className="kmeta">
        Prüfung und Ausgleich in {account.currency}; EUR ist eine Bewertung zum Stichtag.
      </p>
      <AmountInput
        label={`${account.type === 'brokerage' || account.type === 'crypto' ? 'Bargeld-Saldo (ohne Wertpapiere)' : 'Saldo laut Bank'}${account.currency === 'EUR' ? '' : ` · ${account.currency}`}`}
        currency={account.currency}
        value={text}
        onChange={(value) => { if (!busy) setText(value); }}
      />
      {(account.type === 'credit_card' || account.type === 'loan') && (
        <p className="amount-hint">Schuld als Minus eingeben</p>
      )}
      {data && current && (
        <dl className="kv-list">
          <div>
            <dt>App-Saldo gebucht</dt>
            <dd>
              {valuedCurrency(data.bookedBalanceCents, account.currency, data.valuations?.booked)}
            </dd>
          </div>
          <div>
            <dt>vorgemerkt, nicht gezählt</dt>
            <dd>
              {valuedCurrency(data.pendingCents, account.currency, data.valuations?.pending, true)}
            </dd>
          </div>
          <div>
            <dt>Saldo laut Bank</dt>
            <dd>
              {valuedCurrency(
                data.statementBalanceCents,
                account.currency,
                data.valuations?.statement,
              )}
            </dd>
          </div>
          <div>
            <dt>Differenz</dt>
            <dd>
              {valuedCurrency(
                data.differenceCents,
                account.currency,
                data.valuations?.difference,
                true,
              )}
            </dd>
          </div>
        </dl>
      )}
      <div aria-live="polite">
        {ready && preview.isPending && <LoadingNote what="Vergleich" />}
        {preview.isError && (
          <ErrorNote
            what="Vergleich"
            error={preview.error}
            onRetry={() => void preview.refetch()}
          />
        )}
        {data && current && finding?.kind === 'ok' && (
          <>
            <p className="kdiff is-ok">
              <CheckCircle2
                className="icon icon-sm"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Differenz {money(0)} · stimmt überein
            </p>
            <div className="panel-actions">
              <Button disabled={busy} onClick={() => run({})}>
                Festschreiben ({data.toReconcileCount})
              </Button>
            </div>
          </>
        )}
        {data && current && finding && finding.kind !== 'ok' && <>
          <p className="kdiff is-bad">
            <AlertTriangle className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
            Differenz {money(data.differenceCents, true)}. Prüfe zuerst unbestätigte und möglicherweise doppelte Buchungen.
          </p>
          {candidateKeys.length > 0 && <section className="kreconcile-candidates" aria-labelledby="reconcile-candidates-title">
            <h3 id="reconcile-candidates-title">Kandidaten prüfen</h3>
            <p className="text-muted">Gleicher Betrag, Empfänger und Tag sind ein Hinweis auf eine mögliche doppelte Buchung. Ob die Bank eine vorgemerkte Buchung bereits gebucht hat, entscheidest du anhand deines Kontoauszugs. Die Anzeige ändert keine Buchung.</p>
            <ul>{(data.pendingCandidates ?? []).map((row) => {
              const key = `pending:${row.id}`, skipped = ignored.has(key);
              return <li key={key}>
                <strong>{maskMoneyText(row.payeeName ?? row.memo ?? 'Buchung')} · {money(row.amountCents, true)}</strong>
                <p>{longDay(row.date)} · Vorgemerkt{skipped ? ' · Für diese Prüfung ignoriert' : ''}</p>
                <div className="panel-actions">
                  <Button variant="ghost" disabled={busy || staleClose} onClick={() => void resolveCandidate(row.id, 'confirm', row.amountCents === data.differenceCents)}>
                    {row.amountCents === data.differenceCents ? 'Bestätigen und festschreiben' : 'Als gebucht bestätigen'}
                  </Button>
                  <Button variant="ghost" disabled={busy || staleClose} onClick={() => void openCandidate(row.id)}>Bearbeiten oder löschen</Button>
                  <Button variant="ghost" disabled={busy || staleClose} onClick={() => ignoreCandidate(key)}>{skipped ? 'Erneut prüfen' : 'Ignorieren'}</Button>
                  <AppLink className="btn btn-ghost" to="/konten/buchungen" search={{ buchung: row.id, konto: account.id }}>Buchung ansehen</AppLink>
                </div>
              </li>;
            })}
            {data.duplicates.map((row) => {
              const key = `duplicate:${row.removeId}:${row.keepId}`, skipped = ignored.has(key);
              return <li key={key}>
                <strong>Möglicherweise doppelt: {maskMoneyText(row.payeeName ?? 'Buchung')} · {money(row.amountCents, true)}</strong>
                <p>{longDay(row.date)} · Gleicher Betrag, Empfänger und Tag{skipped ? ' · Für diese Prüfung ignoriert' : ''}</p>
                <div className="panel-actions">
                  <Button variant="ghost" disabled={busy || staleClose} onClick={() => void resolveCandidate(row.removeId, 'delete', row.explainsDifference)}>
                    {closeContext && row.explainsDifference ? 'Doppelte entfernen und festschreiben' : 'Doppelte Buchung entfernen'}
                  </Button>
                  <Button variant="ghost" disabled={busy || staleClose} onClick={() => ignoreCandidate(key)}>{skipped ? 'Erneut prüfen' : 'Ignorieren'}</Button>
                  <AppLink className="btn btn-ghost" to="/konten/buchungen" search={{ buchung: row.removeId, konto: account.id }}>Mögliche doppelte ansehen</AppLink>
                  <AppLink className="btn btn-ghost" to="/konten/buchungen" search={{ buchung: row.keepId, konto: account.id }}>Vergleichsbuchung ansehen</AppLink>
                </div>
              </li>;
            })}</ul>
          </section>}
          {data.pendingMatches.map((match) => match.bookingIds.length > 1 && <div className="panel-actions" key={match.bookingIds.join('|')}>
            <p>Passende mögliche Kombination: {match.bookingIds.map((id) => { const row = data.pendingCandidates?.find((r) => r.id === id); return row ? `${maskMoneyText(row.payeeName ?? row.memo ?? 'Buchung')} · ${longDay(row.date)} · ${money(row.amountCents, true)}` : id; }).join(' / ')}</p>
            <Button variant="ghost" disabled={busy || staleClose} onClick={() => run({ confirmBookingIds: match.bookingIds })}>
              Diese {match.bookingIds.length} vorgemerkten Buchungen bestätigen und festschreiben · {money(match.sumCents, true)}
            </Button>
          </div>)}
          {data.pendingCandidates === undefined && <p role="alert">Die Kandidateninformationen sind nicht vollständig verfügbar. <Button variant="ghost" disabled={busy} onClick={() => void preview.refetch()}>Prüfung neu laden</Button></p>}
          {!candidatesReviewed && <p role="status">Bearbeite die Kandidaten oder ignoriere sie ausdrücklich. Erst danach wird ein verbleibender Unterschied als Ausgleich angeboten.</p>}
          {candidatesReviewed && <>
            <div className="kform">
              <h3>Verbleibende Differenz ausgleichen</h3>
              {closeContext && <Field label="Grund für den Ausgleich">{({ id }) => <TextInput id={id} value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} aria-required="true" />}</Field>}
              {closeContext && <p className="kmeta">Ein Grund ist nur erforderlich, wenn ein verbleibender Unterschied als Ausgleich gebucht wird.</p>}
              <Field label="Ausgleichsdatum">{({ id }) => <TextInput id={id} type="date" min={account.openingDate} max={date} value={adjustmentDay} disabled={busy} onChange={(event) => setAdjustDate(event.target.value)} />}</Field>
              <Field label="Kategorie für den Ausgleich">{({ id }) => <Select id={id} value={effectiveCategoryId} disabled={busy} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Zu verteilen</option>
                {categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </Select>}</Field>
              {chosenCategoryId !== '' && effectiveCategoryId === '' && <p className="kmeta">Die zuvor gewählte Kategorie ist nicht mehr verfügbar. Der Ausgleich verwendet Zu verteilen.</p>}
              <p className="kmeta">Die Kategorie wird nach einem gespeicherten Ausgleich für dieses Konto gemerkt. Rückgängig stellt auch die vorherige Wahl wieder her.</p>
              {!adjustmentValid && <p className="field-error" role="alert">Das Ausgleichsdatum muss zwischen Kontoeröffnung und Stichtag liegen.</p>}
              {locked && <>
                <p className="field-error" role="alert">Dieses Datum liegt in einem bereits geprüften Zeitraum (bis {longDay(account.lastReconciledOn!)}). Der Ausgleich ändert diesen Zeitraum.</p>
                <label className="assignment-check"><input type="checkbox" checked={unlock} disabled={busy} onChange={(event) => setUnlock(event.target.checked)} />Geprüften Zeitraum trotzdem ändern</label>
              </>}
              <p className="text-muted">Eine echte Buchung über {money(data.differenceCents, true)} wird am {longDay(adjustmentDay)} mit {effectiveCategoryId ? `Kategorie „${categoryName}“` : 'Zu verteilen'} erstellt und festgeschrieben.</p>
            </div>
            <div className="panel-actions">
              {finding.kind === 'missing' && <Button disabled={busy || staleClose} onClick={() => setBookingState({ mode: 'create', accountId: account.id, prefill: { kind: finding.type, amount: formatDecimal(cents(finding.amountCents)), date, status: 'confirmed' } })}>Fehlende Buchung erfassen</Button>}
              <Button disabled={busy || staleClose || Boolean(closeContext && !reason.trim()) || !adjustmentValid || (locked && !unlock)} onClick={() => run({ adjust: true, ...(adjustDate === null ? {} : { adjustDate }), ...(effectiveCategoryId ? { categoryId: effectiveCategoryId } : {}), ...(locked ? { unlockReconciled: true } : {}) })}>
                Differenz ausgleichen · {money(data.differenceCents, true)}
              </Button>
            </div>
          </>}
          <AppLink className="btn btn-ghost" to="/konten/buchungen" search={{ konto: account.id, bis: asked.date }}>In Buchungen suchen</AppLink>
        </>}

      </div>
      {staleClose && closeContext && <Button variant="ghost" disabled={busy} onClick={closeContext.onReload}>
        Prüfung schließen und Abschluss neu laden
      </Button>}
      {error && (
        <p className="field-error" role="alert">
          {maskMoneyText(error)}
          {!closeContext && <Button variant="ghost" disabled={busy} onClick={() => { setError(null); void preview.refetch(); }}>Prüfung neu laden</Button>}
        </p>
      )}
      <p className="text-muted">
        {account.lastReconciledOn
          ? `Zuletzt geprüft am ${longDay(account.lastReconciledOn)}.`
          : 'Dieses Konto wurde noch nie geprüft.'}
      </p>
      <BookingPanel state={bookingState} onClose={() => setBookingState(null)} />
    </div>
  );
}
