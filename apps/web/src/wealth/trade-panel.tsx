import {
  useAmountPrivacy,
  Button,
  FormDialog,
  Field,
  Select,
  TextInput,
  useToast,
  maskMoneyText,
  privateAmount,
} from '@budget/ui';
import { formatDecimal, parseAmount, parseScaledDecimal, type Cents } from '@budget/domain';
import type { RecordedSecurityTransferPreview } from '@budget/db';
import { confirmSavings, type SavingsExecutionProposal } from './savings-api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { ApiError } from '../api/http';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { accountsQuery, LEDGER_KEY, lookupsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { AccountRow } from '../ledger/types';
import { instrumentsQuery, type SecurityRecord } from './portfolio-api';
import {
  applySecurityTransfer,
  previewSecurityTransfer,
  removeTrade,
  saveTrade,
  sourceMoney,
  tradeQuery,
  type SecurityTransferProposal,
  type TradeRow,
} from './trade-api';
import { unitsText } from './portfolio-format';
import {
  hasUnits,
  hasDeductions,
  TRADE_LABELS,
  tradeDraft,
  validateTrade,
  type TradeDraft,
  type TradeErrors,
} from './trade-draft';

export function TradePanel({
  id,
  securityId,
  proposal,
  onClose,
  onSaved,
}: {
  id: string;
  securityId?: string | undefined;
  proposal?: SavingsExecutionProposal | undefined;
  onClose: () => void;
  onSaved: (securityId: string) => void;
}) {
  const editing = !!id && id !== 'neu';
  const trade = useQuery(tradeQuery(editing ? id : ''));
  const accounts = useQuery({ ...accountsQuery(), retry: false, enabled: !!id });
  const securities = useQuery({ ...instrumentsQuery(), enabled: !!id });
  const lookups = useQuery({ ...lookupsQuery(), retry: false, enabled: !!id });
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const uncertainRef = useRef(false);
  const blockedDuringSaveRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [mode, setMode] = useState<'trade' | 'transfer'>('trade');
  const [hasDraft, setHasDraft] = useState(false);
  const setDirtyNow = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setHasDraft(value);
  }, []);
  const setBusyNow = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);
  const setUncertainNow = useCallback((value: boolean) => {
    uncertainRef.current = value;
    if (value) setAsking(false);
  }, []);
  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (busyRef.current) blockedDuringSaveRef.current = true;
      return dirtyRef.current || busyRef.current || uncertainRef.current;
    },
    withResolver: true,
    enableBeforeUnload: () => dirtyRef.current || busyRef.current || uncertainRef.current,
  });
  const { status: blockerStatus, reset: resetBlockedNavigation } = blocker;
  useEffect(() => {
    if (blockerStatus !== 'blocked') return;
    if (blockedDuringSaveRef.current || busyRef.current || uncertainRef.current) {
      blockedDuringSaveRef.current = false;
      setAsking(false);
      resetBlockedNavigation();
      return;
    }
    setAsking(true);
  }, [blockerStatus, resetBlockedNavigation, busy]);
  const close = () => {
    if (busyRef.current || uncertainRef.current) return;
    setDirtyNow(false);
    setAsking(false);
    setMode('trade');
    setUncertainNow(false);
    onClose();
  };
  const eligible = accounts.data?.accounts.filter(
    (account) => account.role === 'investment' && !account.closedAt,
  );
  const ready = accounts.data && securities.data && (!editing || trade.data);
  const beforeClose = () => {
    if (busyRef.current || uncertainRef.current || blocker.status === 'blocked') return false;
    if (!dirtyRef.current) return true;
    setAsking(true);
    return false;
  };

  const title = proposal
    ? 'Sparplanausführung bestätigen'
    : editing
      ? 'Handel bearbeiten'
      : mode === 'transfer' ? 'Wertpapierübertrag prüfen' : 'Handel erfassen';
  return (
    <FormDialog open={!!id} title={title} onClose={close} beforeClose={beforeClose}>
      <div className="bk-head">
        <h2>{title}</h2>
        <Button
          variant="ghost"
          onClick={() => {
            if (beforeClose()) close();
          }}
        >
          Schließen
        </Button>
      </div>
      <div className="bk-body">
        {!editing && !proposal && (
          <div className="instrument-actions" aria-label="Art der Erfassung">
            <Button type="button" variant={mode === 'trade' ? 'primary' : 'ghost'}
              aria-pressed={mode === 'trade'} disabled={busy || hasDraft}
              onClick={() => setMode('trade')}>Handel</Button>
            <Button type="button" variant={mode === 'transfer' ? 'primary' : 'ghost'}
              aria-pressed={mode === 'transfer'} disabled={busy || hasDraft}
              onClick={() => setMode('transfer')}>Wertpapierübertrag</Button>
          </div>
        )}
        {accounts.isPending && <LoadingNote what="Anlagekonten" />}
        {securities.isPending && <LoadingNote what="Instrumente" />}
        {editing && trade.isPending && <LoadingNote what="Handel" />}
        {accounts.isError && (
          <ErrorNote
            what="Anlagekonten"
            error={accounts.error}
            onRetry={() => void accounts.refetch()}
          />
        )}
        {securities.isError && (
          <ErrorNote
            what="Instrumente"
            error={securities.error}
            onRetry={() => void securities.refetch()}
          />
        )}
        {editing && trade.isError && (
          <ErrorNote what="Handel" error={trade.error} onRetry={() => void trade.refetch()} />
        )}
        {lookups.isError && (
          <ErrorNote
            what="Institutsnamen"
            error={lookups.error}
            onRetry={() => void lookups.refetch()}
          />
        )}
        {id && ready && mode === 'transfer' && !editing && !proposal && (
          <TransferPreviewForm
            key={id}
            date={accounts.data!.asOf}
            securityId={securityId}
            accounts={accounts.data!.accounts}
            securities={securities.data!.securities}
            onDirty={setDirtyNow}
            onBusy={setBusyNow}
            onUncertain={setUncertainNow}
            onAttemptStart={() => setAsking(false)}
            onSaved={(savedSecurityId) => {
              setDirtyNow(false);
              setBusyNow(false);
              setAsking(false);
              onSaved(savedSecurityId);
            }}
          />
        )}
        {id && ready && (mode === 'trade' || editing || !!proposal) && (
          <TradeForm
            key={id}
            trade={editing ? trade.data?.trade : undefined}
            date={accounts.data!.asOf}
            securityId={securityId}
            proposal={proposal}
            accounts={accounts.data!.accounts}
            eligible={eligible ?? []}
            securities={securities.data!.securities}
            institutions={lookups.data?.institutions ?? []}
            onDirty={setDirtyNow}
            onBusy={setBusyNow}
            onSaved={(securityId) => {
              setDirtyNow(false);
              setBusyNow(false);
              setAsking(false);
              onSaved(securityId);
            }}
          />
        )}
        {asking && (
          <div className="instrument-discard" role="alert">
            <p>{mode === 'transfer' ? 'Angaben zur Übertragsvorschau verwerfen?' : 'Ungespeicherte Handelsangaben verwerfen?'}</p>
            <Button
              disabled={busy || uncertainRef.current}
              onClick={() => {
                setAsking(false);
                if (blocker.status === 'blocked') blocker.reset();
              }}
            >
              Weiter bearbeiten
            </Button>
            <Button
              disabled={busy || uncertainRef.current}
              variant="ghost"
              onClick={() => {
                if (busyRef.current || uncertainRef.current) return;
                if (blocker.status === 'blocked') {
                  setDirtyNow(false);
                  setAsking(false);
                  blocker.proceed();
                } else close();
              }}
            >
              Verwerfen
            </Button>
          </div>
        )}
      </div>
    </FormDialog>
  );
}
function TradeForm({
  trade,
  date,
  securityId,
  proposal,
  accounts,
  eligible,
  securities,
  institutions,
  onDirty,
  onBusy,
  onSaved,
}: {
  trade?: TradeRow | undefined;
  date: string;
  securityId?: string | undefined;
  proposal?: SavingsExecutionProposal | undefined;
  accounts: AccountRow[];
  eligible: AccountRow[];
  securities: SecurityRecord[];
  institutions: { id: string; name: string }[];
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onSaved: (securityId: string) => void;
}) {
  useAmountPrivacy();
  const [original] = useState(() => ({
    ...tradeDraft(date, securityId, eligible.length === 1 ? eligible[0]!.id : '', trade),
    ...(proposal
      ? {
          accountId: proposal.accountId,
          securityId: proposal.securityId,
          date: proposal.date,
          amount: formatDecimal(proposal.amountCents as Cents),
        }
      : {}),
  }));
  const [draft, setDraft] = useState(original);
  const [errors, setErrors] = useState<TradeErrors>({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saving = useRef(false);
  const qc = useQueryClient();
  const toast = useToast();
  const account = accounts.find((account) => account.id === draft.accountId);
  const changed = JSON.stringify(draft) !== JSON.stringify(original);
  const update = (key: keyof TradeDraft, value: string) => {
    const next = {
      ...draft,
      [key]: value,
      ...(key === 'kind' && value === 'split' ? { amount: '0' } : {}),
    };
    setDraft(next);
    setErrors({});
    onDirty(JSON.stringify(next) !== JSON.stringify(original));
  };
  const refresh = () => qc.invalidateQueries({ queryKey: LEDGER_KEY });
  const reverse = (groupId: string, redo = false) =>
    void undoGroup(groupId).then(
      async (result) => {
        await refresh();
        toast.show({
          message: redo ? 'Wiederholt.' : 'Rückgängig gemacht.',
          actionLabel: redo ? 'Rückgängig' : 'Wiederholen',
          onAction: () => reverse(result.groupId, !redo),
        });
      },
      (error: unknown) => toast.show({ message: errorText(error) }),
    );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current || deleting || (trade && !changed)) return;
    const validated = validateTrade(draft);
    setErrors(validated.errors);
    if (!validated.values) return;
    saving.current = true;
    setBusy(true);
    onBusy(true);
    try {
      const result = proposal
        ? await confirmSavings(proposal, validated.values)
        : await saveTrade(validated.values, trade?.id);
      onDirty(false);
      await refresh();
      onSaved(result.trade.securityId);
      toast.show({
        message: proposal
          ? 'Sparplanausführung erfasst.'
          : trade
            ? 'Handel gespeichert.'
            : 'Handel erfasst.',
        actionLabel: 'Rückgängig',
        onAction: () => reverse(result.groupId),
      });
    } catch (error) {
      setErrors({
        form:
          proposal && error instanceof ApiError && error.status === 409
            ? 'Der Vorschlag ist nicht mehr aktuell oder bereits erfasst. Bitte schließen und neu laden.'
            : error instanceof ApiError && error.code === 'account_closed'
              ? 'Das Anlagekonto wurde geschlossen. Bitte zuerst wieder öffnen.'
              : error instanceof ApiError && error.status === 400
                ? 'Handel konnte nicht gespeichert werden. Bitte Angaben prüfen.'
                : errorText(error),
      });
    } finally {
      saving.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  const remove = async () => {
    if (!trade || saving.current) return;
    saving.current = true;
    setBusy(true);
    onBusy(true);
    try {
      const result = await removeTrade(trade.id);
      onDirty(false);
      await refresh();
      onSaved(trade.securityId);
      toast.show({
        message: trade.bookingId
          ? 'Handel und zugehörige Kontobuchung gelöscht.'
          : 'Handel gelöscht.',
        actionLabel: 'Rückgängig',
        onAction: () => reverse(result.groupId),
      });
    } catch (error) {
      setErrors({ form: errorText(error) });
    } finally {
      saving.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  const preview = validateTrade(draft);
  const taxInput = parseAmount(draft.tax);
  const showTax = hasDeductions(draft.kind) || !taxInput.ok || taxInput.cents !== 0;
  const feeInput = parseAmount(draft.fee);
  const showFee =
    draft.kind === 'buy' || hasDeductions(draft.kind) || !feeInput.ok || feeInput.cents !== 0;
  const accountLabel = (account: AccountRow) =>
    `${account.name}${account.institutionId ? ` · ${institutions.find((institution) => institution.id === account.institutionId)?.name ?? 'Institut'}` : ''} (${account.currency})`;
  return (
    <form className="kform" onSubmit={(event) => void save(event)}>
      <fieldset className="instrument-fields" disabled={busy}>
        {proposal && (
          <p className="vnote">
            {proposal.securityName} · {proposal.month} · geplant{' '}
            {sourceMoney(proposal.amountCents, proposal.currency)}. Tatsächliche Stückzahl, Betrag
            und Gebühren aus der Abrechnung übernehmen. Die Bestätigung erfasst einen Kauf auf{' '}
            {proposal.accountName}.{' '}
            {proposal.sourceAccountName
              ? `Die Einzahlung von ${proposal.sourceAccountName} separat prüfen.`
              : 'Eine Einzahlung separat prüfen.'}{' '}
            Kein Bankauftrag und keine automatische Umbuchung.
          </p>
        )}
        <Field label="Handelsart">
          {({ id }) => (
            <Select
              id={id}
              value={draft.kind}
              disabled={!!trade || !!proposal}
              onChange={(event) => update('kind', event.target.value)}
            >
              {Object.entries(TRADE_LABELS).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Anlagekonto"
          error={errors.accountId}
          hint={trade ? 'Das Konto eines gespeicherten Handels bleibt unverändert.' : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              value={draft.accountId}
              required
              disabled={!!trade || !!proposal}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(event) => update('accountId', event.target.value)}
            >
              <option value="">Anlagekonto auswählen</option>
              {(trade ? accounts.filter((a) => a.id === trade.accountId) : eligible).map(
                (account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </option>
                ),
              )}
            </Select>
          )}
        </Field>
        {!trade && !eligible.length && (
          <p className="vnote">Zuerst ein offenes Anlagekonto in den Kontoeinstellungen anlegen.</p>
        )}
        <Field label="Instrument" error={errors.securityId}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              value={draft.securityId}
              disabled={!!trade?.savingsPlanId || !!proposal}
              required
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(event) => update('securityId', event.target.value)}
            >
              <option value="">Instrument auswählen</option>
              {securities.map((security) => (
                <option key={security.id} value={security.id}>
                  {security.name} · {security.currency}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Handelsdatum" error={errors.date}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="date"
              value={draft.date}
              required
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(event) => update('date', event.target.value)}
            />
          )}
        </Field>
        {hasUnits(draft.kind) && (
          <Field
            label={draft.kind === 'split' ? 'Stückänderung' : 'Stück'}
            error={errors.units}
            hint={
              draft.kind === 'split'
                ? 'Vorzeichenbehaftete Änderung, nicht der neue Gesamtbestand. Beispiel: 10 auf 20 Stück = +10; 20 auf 10 = −10.'
                : 'Positive Stückzahl, bis zu acht Nachkommastellen.'
            }
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={draft.units}
                required
                maxLength={30}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                onChange={(event) => update('units', event.target.value)}
              />
            )}
          </Field>
        )}
        {(
          [
            ...(draft.kind === 'split' ? [] : ['amount']),
            ...(showFee ? ['fee'] : []),
            ...(showTax ? ['tax'] : []),
          ] as ('amount' | 'fee' | 'tax')[]
        ).map((key) => (
          <Field
            key={key}
            label={`${key === 'amount' ? (draft.kind.startsWith('delivery') ? 'Dokumentierter Einstand / Lieferwert' : 'Bruttobetrag') : key === 'fee' ? 'Gebühren' : 'Einbehaltene Steuer'} (${account?.currency ?? 'Kontowährung'})`}
            error={errors[key]}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={draft[key]}
                money
                required
                maxLength={40}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                onChange={(event) => update(key, event.target.value)}
              />
            )}
          </Field>
        ))}
        {draft.kind === 'buy' && showTax && (
          <p className="vnote">
            Ein Kauf hat keine einbehaltene Steuer. Steuer auf 0 setzen oder Verkauf wählen.
          </p>
        )}
        <p className="vnote">
          Aus der Abrechnung übernehmen. Gebühren und Steuern werden nicht geschätzt oder nochmals
          berechnet.
        </p>
        {draft.kind.startsWith('delivery') && (
          <p className="vnote">
            Lieferungen ändern den Bestand ohne Kontobuchung. Den dokumentierten Lieferwert
            übernehmen; Einlieferungen verwenden ihn als Einstand.
          </p>
        )}
        {draft.kind === 'split' && (
          <p className="vnote">
            Keine Kontobuchung; der Einstand bleibt erhalten. Gespeicherte Kurse auf den Split
            prüfen.
          </p>
        )}
        {preview.settlement !== undefined && account && (
          <p className="vnote" role="status">
            Kontobuchung: {sourceMoney(preview.settlement, account.currency)}
          </p>
        )}
        <Field label="Notiz" hint="Optional, etwa eine Belegreferenz.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              value={draft.note}
              maxLength={500}
              aria-describedby={describedBy}
              onChange={(event) => update('note', event.target.value)}
            />
          )}
        </Field>
        {errors.form && (
          <p className="field-error" role="alert">
            {maskMoneyText(errors.form)}
          </p>
        )}
        <Button
          type="submit"
          disabled={busy || deleting || !account || !securities.length || (!!trade && !changed)}
        >
          {busy
            ? 'Wird gespeichert …'
            : proposal
              ? 'Ausführung bestätigen'
              : trade
                ? 'Handel speichern'
                : 'Handel erfassen'}
        </Button>
        {trade && (
          <Button variant="ghost" type="button" onClick={() => setDeleting(true)}>
            Handel löschen
          </Button>
        )}
        {deleting && (
          <div className="instrument-discard" role="alert">
            <p>
              Handel löschen? Die zugehörige Kontobuchung wird gemeinsam entfernt. Separate
              Einzahlungen oder Umbuchungen bleiben bestehen. Ungespeicherte Angaben werden
              verworfen.
            </p>
            <Button type="button" variant="alert" onClick={() => void remove()}>
              Löschen bestätigen
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDeleting(false)}>
              Abbrechen
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

/** Recorded-ledger proposal, explicit confirmation and one idempotent audited action. */
function TransferPreviewForm({ date, securityId, accounts, securities,
  onDirty, onBusy, onUncertain, onAttemptStart, onSaved }: {
  date: string;
  securityId?: string | undefined;
  accounts: AccountRow[];
  securities: SecurityRecord[];
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onUncertain: (uncertain: boolean) => void;
  onAttemptStart: () => void;
  onSaved: (securityId: string) => void;
}) {
  const hidden = useAmountPrivacy();
  const qc = useQueryClient();
  const toast = useToast();
  const eligible = accounts.filter((account) => account.role === 'investment' &&
    !account.onBudget && account.currency === 'EUR' && !account.closedAt);
  const [original] = useState(() => ({ securityId: securityId ?? '', sourceAccountId: '',
    destinationAccountId: '', date, units: '', sourceReference: '' }));
  const [draft, setDraft] = useState(original);
  const [result, setResult] = useState<RecordedSecurityTransferPreview | null>(null);
  const [proposal, setProposal] = useState<SecurityTransferProposal | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [delivery, setDelivery] = useState<{
    proposal: SecurityTransferProposal; factFingerprint: string; intentKey: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const update = (key: keyof typeof draft, value: string) => {
    if (pending.current || delivery || saved) return;
    const next = { ...draft, [key]: value,
      ...(key === 'sourceAccountId' && value === draft.destinationAccountId
        ? { destinationAccountId: '' } : {}) };
    setDraft(next);
    setResult(null);
    setProposal(null);
    setConfirmed(false);
    setError('');
    onDirty(JSON.stringify(next) !== JSON.stringify(original));
  };
  const calculate = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || delivery || saved) return;
    setError('');
    if (!draft.securityId || !draft.sourceAccountId || !draft.destinationAccountId ||
        draft.sourceAccountId === draft.destinationAccountId) {
      setError('Ein Wertpapier und zwei verschiedene Anlagekonten auswählen.');
      return;
    }
    let unitsE8: number;
    try {
      const units = draft.units.trim().replace(',', '.');
      if (!/^\d+(\.\d{1,8})?$/.test(units)) throw new RangeError();
      unitsE8 = parseScaledDecimal(units, 8);
      if (!Number.isSafeInteger(unitsE8) || unitsE8 <= 0) throw new RangeError();
    } catch {
      setError('Positive Stückzahl mit höchstens acht Nachkommastellen eingeben.');
      return;
    }
    pending.current = true;
    setBusy(true);
    onBusy(true);
    try {
      const input: SecurityTransferProposal = { securityId: draft.securityId,
        sourceAccountId: draft.sourceAccountId, destinationAccountId: draft.destinationAccountId,
        date: draft.date, unitsE8, sourceReference: draft.sourceReference.trim() || null };
      const preview = await previewSecurityTransfer(input);
      setProposal(input);
      setResult(preview);
      setConfirmed(false);
    } catch (cause) {
      setResult(null);
      setProposal(null);
      setError(errorText(cause));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  const refresh = async () => {
    try {
      await qc.invalidateQueries();
      return true;
    } catch {
      return false;
    }
  };
  const reverse = (groupId: string, redo = false) =>
    void undoGroup(groupId).then(async (undone) => {
      const refreshed = await refresh();
      toast.show({
        message: `${redo ? 'Wiederholt.' : 'Rückgängig gemacht.'}${refreshed ? '' :
          ' Andere Ansichten konnten nicht aktualisiert werden.'}`,
        actionLabel: redo ? 'Rückgängig' : 'Wiederholen',
        onAction: () => reverse(undone.groupId, !redo),
      });
    }, (cause: unknown) => toast.show({ message: errorText(cause) }));
  const save = async () => {
    if (pending.current || saved || !confirmed || !proposal || !result?.available ||
        !result.applyAvailable) return;
    const attempt = delivery ?? { proposal, factFingerprint: result.factFingerprint,
      intentKey: crypto.randomUUID() };
    onAttemptStart();
    setDelivery(attempt);
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const written = await applySecurityTransfer(attempt.proposal,
        attempt.factFingerprint, attempt.intentKey);
      setDelivery(null);
      onUncertain(false);
      if (!written.live) {
        setResult(null);
        setProposal(null);
        setConfirmed(false);
        setError('Dieser Übertrag wurde bereits rückgängig gemacht. Für eine neue Aktion bitte erneut prüfen.');
        return;
      }
      setSaved(true);
      onDirty(false);
      const refreshed = await refresh();
      toast.show({
        message: `${written.duplicate ? 'Übertrag war bereits gespeichert.' :
          'Wertpapierübertrag als eine Aktion gespeichert.'}${refreshed ? '' :
          ' Andere Ansichten konnten nicht aktualisiert werden.'}`,
        actionLabel: 'Rückgängig',
        onAction: () => reverse(written.groupId),
      });
      onSaved(attempt.proposal.securityId);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        if (delivery) {
          // A rejected retry does not tell us whether the earlier lost reply committed.
          onUncertain(true);
          setError('Der erneute Versuch wurde abgewiesen. Der erste Speicherstand bleibt unklar; ' +
            'mit demselben Sendeschlüssel später erneut versuchen. ' + errorText(cause));
        } else {
          setDelivery(null);
          onUncertain(false);
          setResult(null);
          setProposal(null);
          setConfirmed(false);
          setError('Der Übertrag wurde nicht gespeichert. Bitte die Angaben erneut prüfen. ' +
            errorText(cause));
        }
      } else {
        onUncertain(true);
        setError('Der Speicherstand ist unklar. Mit demselben Sendeschlüssel erneut versuchen. ' +
          errorText(cause));
      }
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <form className="kform" onSubmit={(event) => void calculate(event)}>
      <fieldset className="instrument-fields" disabled={busy || Boolean(delivery) || saved}>
        <p className="vnote">Vorschau aus gespeicherten Käufen, Verkäufen und Splits.
          Sie erstellt keine Brokerorder; das Erfassen bucht nur zwei Wertpapierlieferungen ohne Geldbewegung.</p>
        <Field label="Wertpapier">
          {({ id }) => <Select id={id} value={draft.securityId} required
            onChange={(event) => update('securityId', event.target.value)}>
            <option value="">Wertpapier auswählen</option>
            {securities.map((security) => <option key={security.id} value={security.id}>
              {security.name} · {security.currency}
            </option>)}
          </Select>}
        </Field>
        <Field label="Abgang von">
          {({ id }) => <Select id={id} value={draft.sourceAccountId} required
            onChange={(event) => update('sourceAccountId', event.target.value)}>
            <option value="">Quellkonto auswählen</option>
            {eligible.map((account) => <option key={account.id} value={account.id}>
              {account.name} · EUR
            </option>)}
          </Select>}
        </Field>
        <Field label="Zugang auf">
          {({ id }) => <Select id={id} value={draft.destinationAccountId} required
            onChange={(event) => update('destinationAccountId', event.target.value)}>
            <option value="">Zielkonto auswählen</option>
            {eligible.filter((account) => account.id !== draft.sourceAccountId)
              .map((account) => <option key={account.id} value={account.id}>
                {account.name} · EUR
              </option>)}
          </Select>}
        </Field>
        <Field label="Übertragsdatum">
          {({ id }) => <TextInput id={id} type="date" value={draft.date} required
            onChange={(event) => update('date', event.target.value)} />}
        </Field>
        <Field label="Stückzahl" hint="Positive Stückzahl, bis zu acht Nachkommastellen.">
          {({ id, describedBy }) => <TextInput id={id} inputMode="decimal" value={draft.units}
            money required maxLength={30} aria-describedby={describedBy}
            onChange={(event) => update('units', event.target.value)} />}
        </Field>
        <Field label="Belegreferenz (optional)" hint="Nur eine tatsächlich vorhandene Referenz eintragen.">
          {({ id, describedBy }) => <TextInput id={id} type={hidden ? 'password' : 'text'}
            value={draft.sourceReference} maxLength={200} aria-describedby={describedBy}
            onChange={(event) => update('sourceReference', event.target.value)} />}
        </Field>
        {!eligible.length && <p className="vnote">Zwei offene, budgetfreie EUR-Anlagekonten werden benötigt.</p>}
        {error && <p className="field-error" role="alert">{maskMoneyText(error)}</p>}
        <Button type="submit" disabled={busy || eligible.length < 2}>
          {busy ? 'Vorschau wird berechnet …' : 'Übertrag prüfen'}
        </Button>
        {result && !result.available &&
          <p className="field-error" role="alert">{maskMoneyText(result.message)}</p>}
        {result?.available && <div className="vnote" role="status">
          <p><strong>Übertrag von {privateAmount(unitsText(result.unitsE8))} Stück</strong>
            {' · '}{result.method === 'fifo' ? 'FIFO' : 'Durchschnittseinstand'}</p>
          <p>Abgang: {privateAmount(unitsText(result.source.beforeUnitsE8))} Stück /{' '}
            {sourceMoney(result.source.beforeBasisCents, 'EUR')} Einstand →{' '}
            {privateAmount(unitsText(result.source.remainingUnitsE8))} Stück /{' '}
            {sourceMoney(result.source.remainingBasisCents, 'EUR')} verbleiben.</p>
          <p>Zugang: {privateAmount(unitsText(result.destination.beforeUnitsE8))} Stück /{' '}
            {sourceMoney(result.destination.beforeBasisCents, 'EUR')} Einstand →{' '}
            {privateAmount(unitsText(result.destination.afterUnitsE8))} Stück /{' '}
            {sourceMoney(result.destination.afterBasisCents, 'EUR')}.</p>
          <p>Übertragener Einstand: {sourceMoney(result.transferredBasisCents, 'EUR')}.
            Cent-Reste bleiben bis zum vollständigen Übertrag beim Quellbestand.</p>
          {result.method === 'fifo' ? <details>
            <summary>Betroffene Anschaffungen ({result.movedLots.length})</summary>
            <ul>{result.movedLots.map((lot) => <li key={lot.acquisitionId}>
              Kauf vom {lot.acquiredOn}: {privateAmount(unitsText(lot.unitsE8))} Stück /{' '}
              {sourceMoney(lot.basisCents, 'EUR')} Einstand
            </li>)}</ul>
          </details> : <p>Die Kostenbasis stammt aus dem belegten Durchschnittspool;
            einzelne Anschaffungen erhalten keinen erfundenen Cent-Anteil.</p>}
          <p>Keine Barbewegung, kein realisierter Gewinn.</p>
          {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>}
      </fieldset>
      {result?.available && result.applyAvailable && !saved && !delivery && <div className="vnote">
        <label><input type="checkbox" checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)} />{' '}
          Ich bestätige, dass beide Konten dasselbe Wertpapier betreffen und der gezeigte
          Einstand aus meinen gespeicherten Buchungen für diesen Übertrag verwendet werden soll.
        </label>
        <Button type="button" disabled={!confirmed || busy} onClick={() => void save()}>
          Übertrag als eine Aktion erfassen
        </Button>
      </div>}
      {result?.available && !result.applyAvailable &&
        <p className="vnote">Dieser Übertrag kann wegen der angezeigten Konten- oder Stichtagssperre nicht erfasst werden.</p>}
      {delivery && !busy && <div className="vnote" role="alert">
        <p>Der Ausgang des Speicherns ist unklar. Angaben und Sendeschlüssel bleiben erhalten;
          erneut versuchen, damit kein zweiter Übertrag entsteht. Bis zur Klärung bleibt dieses Fenster offen.</p>
        <Button type="button" onClick={() => void save()}>Mit gleichem Sendeschlüssel erneut versuchen</Button>
      </div>}
    </form>
  );
}
