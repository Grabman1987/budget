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
import { TriangleAlert, CircleCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppLink } from '../shell/app-link';
import { ApiError } from '../api/http';
import { previewReconciliation, reconcileAccount, type ReconcileRequest } from './api';
import { nativeCurrency, valuedCurrency, longDay, shortDay } from './format';
import { errorText } from './labels';
import { useLedgerWrites } from './mutations';
import { LEDGER_KEY, lookupsQuery } from './queries';
import { candidatesOf, findingOf } from './reconcile-model';
import { ErrorNote, LoadingNote } from './states';
import type { AccountRow, ReconcileResult } from './types';
import { SettingsFormDialog } from '../pages/settings-form-dialog';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { categoriesFor, pickableCategories } from './capture-model';
import {
  defaultCorrectionCategoryLabel,
  readCorrectionCategory,
  rememberCorrectionCategory,
} from './reconcile-category';

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
      <ReconcileFlow account={account} onDone={onClose} />
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
  useEffect(
    () => () => {
      closeContext?.onBusy(false);
    },
    [closeContext],
  );
  const [date, setDate] = useState(initialDate ?? today);
  const [text, setText] = useState('');
  const [adjustDate, setAdjustDate] = useState<string | null>(null);
  const [categoryChoice, setCategoryChoice] = useState(() => ({
    accountId: account.id,
    id: readCorrectionCategory(account.id),
  }));
  if (categoryChoice.accountId !== account.id)
    setCategoryChoice({ accountId: account.id, id: readCorrectionCategory(account.id) });
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
  const asked = useDebounced({ date, statement }, 300);
  // The bank balance of a day that has not happened yet does not exist: check up to today.
  const future = date > today;
  const ready =
    asked.statement !== null && /^\d{4}-\d{2}-\d{2}$/.test(asked.date) && asked.date <= today;

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
  const candidates = data ? candidatesOf(data) : [];
  const candidateScope = JSON.stringify([account.id, date, statement, data]);
  const [review, setReview] = useState<{ scope: string; ignored: string[] }>({
    scope: '',
    ignored: [],
  });
  if (review.scope !== candidateScope) setReview({ scope: candidateScope, ignored: [] });
  const ignored = review.scope === candidateScope ? review.ignored : [];
  const candidateBusy = writes.remove.isPending || writes.bulk.isPending;
  const unresolvedCandidates = candidates.some((row) => !ignored.includes(row.key));
  const canCorrect = !unresolvedCandidates && !candidateBusy;
  const money = (amount: number, sign = false) => nativeCurrency(amount, account.currency, sign);
  const finding = data ? findingOf(data) : null;
  // The same plain spending categories for a surplus and a shortfall; the server enforces it too.
  const categories = categoriesFor(pickableCategories(undefined, lookups.data), 'expense').filter(
    (c) =>
      isReconcileAdjustCategoryKind(c.kind) &&
      !lookups.data?.categories.find((row) => row.id === c.id)?.hiddenAt,
  );
  const selectedCategory =
    categoryChoice.accountId === account.id
      ? categoryChoice.id
      : readCorrectionCategory(account.id);
  const categoryId = categories.some((c) => c.id === selectedCategory) ? selectedCategory : '';
  const defaultCategoryLabel = defaultCorrectionCategoryLabel(account);
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? defaultCategoryLabel;
  if (lookups.isSuccess && selectedCategory && !categoryId)
    setCategoryChoice({ accountId: account.id, id: '' });
  useEffect(() => {
    if (lookups.isSuccess) rememberCorrectionCategory(account.id, categoryId);
  }, [account.id, lookups.isSuccess, categoryId]);
  // The panel shows the answer for what is typed now, not for the previous input.
  const current =
    ready &&
    asked.statement === statement &&
    asked.date === date &&
    data?.date === date &&
    data.statementBalanceCents === statement &&
    !preview.isPlaceholderData &&
    !preview.isFetching &&
    !preview.isError;

  const confirm = useMutation({
    onMutate: () => {
      closeContext?.onBusy(true);
    },
    mutationFn: (extra: Partial<ReconcileRequest>) => {
      const input = {
        date: asked.date,
        statementBalanceCents: asked.statement as number,
        ...extra,
        ...(closeContext && extra.adjust && reason.trim() ? { note: reason.trim() } : {}),
      };
      return closeContext ? closeContext.confirm(input) : reconcileAccount(account.id, input);
    },
    onSettled: () => {
      closeContext?.onBusy(false);
    },
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
      if (
        closeContext &&
        e instanceof ApiError &&
        (e.code === 'stale_close' || e.code === 'close_account_unavailable')
      )
        setStaleClose(true);
      setError(errorText(e));
    },
  });
  const run = (extra: Partial<ReconcileRequest>) => {
    if (closeContext && (confirm.isPending || staleClose || (extra.adjust && !reason.trim())))
      return;
    setError(null);
    confirm.mutate(extra);
  };
  const dropDuplicate = (id: string) => {
    if (closeContext) {
      run({ removeBookingIds: [id] });
      return;
    }
    setError(null);
    writes.remove.mutate(
      { id },
      {
        onError: (e) => setError(errorText(e)),
        onSettled: () => void qc.invalidateQueries({ queryKey: LEDGER_KEY }),
      },
    );
  };
  const confirmPending = (ids: string[]) => {
    setError(null);
    closeContext?.onBusy(true);
    writes.bulk.mutate(
      { ids, set: { status: 'confirmed' } },
      {
        onSuccess: (result) => {
          if (result.skipped.length)
            setError(
              `${result.skipped.length} Buchungen wurden nicht geändert. Bitte den Vorschlag in Buchungen prüfen.`,
            );
          // The month-close token is intentionally immutable after a separate canonical write.
          if (closeContext && result.changed.length) setStaleClose(true);
        },
        onError: (e) => setError(errorText(e)),
        onSettled: () => {
          closeContext?.onBusy(false);
          void qc.invalidateQueries({ queryKey: LEDGER_KEY });
        },
      },
    );
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
          disabled={confirm.isPending || Boolean(closeContext && bankDate !== closeContext.asOf)}
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
            disabled={Boolean(closeContext)}
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
        onChange={setText}
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
              <CircleCheck
                className="icon icon-sm"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Differenz {money(0)} · stimmt überein
            </p>
            <div className="panel-actions">
              <Button
                disabled={confirm.isPending || candidateBusy || staleClose}
                onClick={() => run({})}
              >
                Festschreiben ({data.toReconcileCount})
              </Button>
            </div>
          </>
        )}
        {data && current && finding && finding.kind !== 'ok' && (
          <>
            <p className="kdiff is-bad">
              <TriangleAlert
                className="icon icon-sm"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>
                {finding.kind === 'duplicate' && (
                  <>
                    <strong>Doppelt:</strong> {finding.candidate.payeeName ?? 'Buchung'}{' '}
                    {valuedCurrency(
                      finding.candidate.amountCents,
                      account.currency,
                      finding.candidate.valuation,
                    )}{' '}
                    am {shortDay(finding.candidate.date)} steht zweimal in der App, die Bank kennt
                    sie einmal. Differenz {money(data.differenceCents, true)}.
                  </>
                )}
                {finding.kind === 'pending' && (
                  <>
                    <strong>Fehlt:</strong>{' '}
                    {finding.bookingIds.length === 1
                      ? 'Eine vorgemerkte Buchung'
                      : `${finding.bookingIds.length} vorgemerkte Buchungen`}{' '}
                    ({money(finding.sumCents, true)}) hat die Bank schon gebucht. Bestätige sie,
                    dann geht die Rechnung auf.
                  </>
                )}
                {finding.kind === 'missing' && canCorrect && (
                  <>
                    <strong>
                      Es fehlt {finding.type === 'expense' ? 'eine Ausgabe' : 'eine Einnahme'}
                    </strong>{' '}
                    über {money(finding.amountCents)}: Die Bank meldet{' '}
                    {money(Math.abs(data.differenceCents))}{' '}
                    {data.differenceCents < 0 ? 'weniger' : 'mehr'} als die App. Keine doppelte
                    Buchung passt zu diesem Betrag.
                  </>
                )}
                {finding.kind === 'other' && canCorrect && (
                  <>
                    <strong>Differenz {money(data.differenceCents, true)}.</strong> Keine Buchung
                    erklärt sie.
                  </>
                )}
                {!canCorrect && (finding.kind === 'missing' || finding.kind === 'other') && (
                  <strong>
                    Differenz {money(data.differenceCents, true)}. Zuerst Kandidaten prüfen.
                  </strong>
                )}
              </span>
            </p>
            {candidates.length > 0 && (
              <section className="kform" aria-label="Kandidaten zuerst prüfen">
                <h3>Kandidaten zuerst prüfen</h3>
                <p>
                  Prüfe unbestätigte und möglicherweise doppelte Buchungen. Erst nach deiner Auswahl
                  wird ein verbleibender Unterschied als Ausgleich angeboten.
                </p>
                {candidates.map((row, index) => (
                  <section
                    className="kform"
                    key={row.key}
                    data-testid={`candidate-${row.key}`}
                    aria-label={`Kandidat ${index + 1}`}
                  >
                    <p>
                      <strong>
                        {row.kind === 'duplicate'
                          ? 'Mögliche doppelte Buchung'
                          : 'Vorgemerkte Buchung'}
                      </strong>{' '}
                      · {maskMoneyText(row.payeeName ?? 'Ohne Empfänger')}
                      {row.date && <> · {shortDay(row.date)}</>} ·{' '}
                      {valuedCurrency(row.amountCents, account.currency, row.valuation, true)}
                    </p>
                    <div className="panel-actions">
                      {ignored.includes(row.key) ? (
                        <Button
                          variant="ghost"
                          disabled={candidateBusy || confirm.isPending}
                          onClick={() =>
                            setReview({
                              scope: candidateScope,
                              ignored: ignored.filter((key) => key !== row.key),
                            })
                          }
                        >
                          Ignorieren rückgängig
                        </Button>
                      ) : (
                        <>
                          <Button
                            disabled={candidateBusy || confirm.isPending || staleClose}
                            onClick={() =>
                              row.kind === 'duplicate'
                                ? dropDuplicate(row.bookingIds[0]!)
                                : confirmPending(row.bookingIds)
                            }
                          >
                            {row.kind === 'duplicate'
                              ? closeContext
                                ? 'Doppelte Buchung entfernen und festschreiben'
                                : 'Doppelte Buchung entfernen'
                              : 'Bestätigen'}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={candidateBusy || confirm.isPending}
                            onClick={() =>
                              setReview({ scope: candidateScope, ignored: [...ignored, row.key] })
                            }
                          >
                            Ignorieren
                          </Button>
                        </>
                      )}
                    </div>
                  </section>
                ))}
                {unresolvedCandidates && (
                  <AppLink
                    className="btn btn-ghost"
                    to="/konten/buchungen"
                    search={{ konto: account.id, bis: asked.date }}
                  >
                    In Buchungen suchen
                  </AppLink>
                )}
              </section>
            )}
            {canCorrect && (
              <>
                <div className="kform">
                  {closeContext && (
                    <Field label="Grund für den Ausgleich">
                      {({ id }) => (
                        <TextInput
                          id={id}
                          value={reason}
                          maxLength={500}
                          disabled={confirm.isPending}
                          onChange={(event) => setReason(event.target.value)}
                          aria-required="true"
                        />
                      )}
                    </Field>
                  )}
                  {closeContext && (
                    <p className="kmeta">
                      Ein Grund ist nur erforderlich, wenn ein verbleibender Unterschied als
                      Ausgleich gebucht wird.
                    </p>
                  )}
                  <Field label="Ausgleichsdatum">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        type="date"
                        min={account.openingDate}
                        max={date}
                        value={adjustmentDay}
                        onChange={(e) => setAdjustDate(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Kategorie für den Ausgleich">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={categoryId}
                        disabled={!lookups.isSuccess || confirm.isPending}
                        onChange={(e) => {
                          setCategoryChoice({ accountId: account.id, id: e.target.value });
                          rememberCorrectionCategory(account.id, e.target.value);
                        }}
                      >
                        <option value="">{defaultCategoryLabel}</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {!adjustmentValid && (
                    <p className="field-error" role="alert">
                      Das Ausgleichsdatum muss zwischen Kontoeröffnung und Stichtag liegen.
                    </p>
                  )}
                  {locked && (
                    <>
                      <p className="field-error" role="alert">
                        Dieses Datum liegt in einem bereits geprüften Zeitraum (bis{' '}
                        {longDay(account.lastReconciledOn!)}). Der Ausgleich ändert diesen Zeitraum.
                      </p>
                      <label className="assignment-check">
                        <input
                          type="checkbox"
                          checked={unlock}
                          onChange={(e) => setUnlock(e.target.checked)}
                        />{' '}
                        Geprüften Zeitraum trotzdem ändern
                      </label>
                    </>
                  )}
                  <p className="text-muted">
                    Eine echte Buchung über {money(data.differenceCents, true)} wird am{' '}
                    {longDay(adjustmentDay)} mit{' '}
                    {categoryId
                      ? `Kategorie „${categoryName}“`
                      : defaultCategoryLabel === 'Zu verteilen'
                        ? 'Zu verteilen (ohne Kategorie)'
                        : 'keiner Kategorie'}{' '}
                    erstellt und festgeschrieben.
                  </p>
                </div>
                <div className="panel-actions">
                  {finding.kind === 'missing' && (
                    <Button
                      disabled={confirm.isPending}
                      onClick={() =>
                        setBookingState({
                          mode: 'create',
                          accountId: account.id,
                          prefill: {
                            kind: finding.type,
                            amount: formatDecimal(cents(finding.amountCents)),
                            date,
                            status: 'confirmed',
                          },
                        })
                      }
                    >
                      Fehlende Buchung erfassen
                    </Button>
                  )}
                  <Button
                    variant={
                      finding.kind === 'missing' || finding.kind === 'other' ? 'primary' : 'ghost'
                    }
                    disabled={
                      confirm.isPending ||
                      !lookups.isSuccess ||
                      staleClose ||
                      Boolean(closeContext && !reason.trim()) ||
                      !adjustmentValid ||
                      (locked && !unlock) ||
                      (categoryId !== '' && !categories.some((c) => c.id === categoryId))
                    }
                    onClick={() =>
                      run({
                        adjust: true,
                        ...(adjustDate === null ? {} : { adjustDate }),
                        ...(categoryId ? { categoryId } : {}),
                        ...(locked ? { unlockReconciled: true } : {}),
                      })
                    }
                  >
                    Differenz ausgleichen · {money(data.differenceCents, true)}
                  </Button>
                  <AppLink
                    className="btn btn-ghost"
                    to="/konten/buchungen"
                    search={{ konto: account.id, bis: asked.date }}
                  >
                    In Buchungen suchen
                  </AppLink>
                </div>
              </>
            )}
          </>
        )}
      </div>
      {staleClose && closeContext && (
        <Button variant="ghost" disabled={confirm.isPending} onClick={closeContext.onReload}>
          Prüfung schließen und Abschluss neu laden
        </Button>
      )}
      {error && (
        <p className="field-error" role="alert">
          {maskMoneyText(error)}
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
