import { parseAmount } from '@budget/domain';
import { Button, DetailPanel, Field, Select, TextInput, useToast } from '@budget/ui';
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
import { saveTrade, sourceMoney, tradeQuery, type TradeRow } from './trade-api';
import { tradeDraft, validateTrade, type TradeDraft, type TradeErrors } from './trade-draft';

export function TradePanel({
  id,
  securityId,
  onClose,
  onSaved,
}: {
  id: string;
  securityId?: string | undefined;
  onClose: () => void;
  onSaved: (securityId: string) => void;
}) {
  const editing = id !== 'neu';
  const trade = useQuery(tradeQuery(editing ? id : ''));
  const accounts = useQuery({ ...accountsQuery(), retry: false });
  const securities = useQuery(instrumentsQuery());
  const lookups = useQuery({ ...lookupsQuery(), retry: false });
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const blockedDuringSaveRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const setDirtyNow = useCallback((value: boolean) => {
    dirtyRef.current = value;
  }, []);
  const setBusyNow = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);
  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (busyRef.current) blockedDuringSaveRef.current = true;
      return dirtyRef.current || busyRef.current;
    },
    withResolver: true,
    enableBeforeUnload: () => dirtyRef.current || busyRef.current,
  });
  const { status: blockerStatus, reset: resetBlockedNavigation } = blocker;
  useEffect(() => {
    if (blockerStatus !== 'blocked') return;
    if (blockedDuringSaveRef.current || busyRef.current) {
      blockedDuringSaveRef.current = false;
      setAsking(false);
      resetBlockedNavigation();
      return;
    }
    setAsking(true);
  }, [blockerStatus, resetBlockedNavigation, busy]);
  const close = () => {
    setDirtyNow(false);
    setAsking(false);
    onClose();
  };
  const eligible = accounts.data?.accounts.filter(
    (account) => account.role === 'investment' && !account.closedAt,
  );
  const ready = accounts.data && securities.data && (!editing || trade.data);
  return (
    <DetailPanel
      open
      title={editing ? 'Handel bearbeiten' : 'Handel erfassen'}
      onClose={close}
      beforeClose={() => {
        if (busyRef.current || blocker.status === 'blocked') return false;
        if (!dirtyRef.current) return true;
        setAsking(true);
        return false;
      }}
    >
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
      {ready && editing && trade.data?.trade.kind !== 'buy' && trade.data?.trade.kind !== 'sell' ? (
        <p className="vnote">Diese Handelsart kann hier noch nicht bearbeitet werden.</p>
      ) : (
        ready && (
          <TradeForm
            trade={editing ? trade.data?.trade : undefined}
            date={accounts.data!.asOf}
            securityId={securityId}
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
        )
      )}
      {asking && (
        <div className="instrument-discard" role="alert">
          <p>Ungespeicherte Handelsangaben verwerfen?</p>
          <Button
            disabled={busy}
            onClick={() => {
              setAsking(false);
              if (blocker.status === 'blocked') blocker.reset();
            }}
          >
            Weiter bearbeiten
          </Button>
          <Button
            disabled={busy}
            variant="ghost"
            onClick={() => {
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
    </DetailPanel>
  );
}
function TradeForm({
  trade,
  date,
  securityId,
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
  accounts: AccountRow[];
  eligible: AccountRow[];
  securities: SecurityRecord[];
  institutions: { id: string; name: string }[];
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onSaved: (securityId: string) => void;
}) {
  const [original] = useState(() =>
    tradeDraft(date, securityId, eligible.length === 1 ? eligible[0]!.id : '', trade),
  );
  const [draft, setDraft] = useState(original);
  const [errors, setErrors] = useState<TradeErrors>({});
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const qc = useQueryClient();
  const toast = useToast();
  const account = accounts.find((account) => account.id === draft.accountId);
  const changed = JSON.stringify(draft) !== JSON.stringify(original);
  const update = (key: keyof TradeDraft, value: string) => {
    const next = { ...draft, [key]: value };
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
    if (saving.current || (trade && !changed)) return;
    const validated = validateTrade(draft);
    setErrors(validated.errors);
    if (!validated.values) return;
    saving.current = true;
    setBusy(true);
    onBusy(true);
    try {
      const result = await saveTrade(validated.values, trade?.id);
      onDirty(false);
      await refresh();
      onSaved(result.trade.securityId);
      toast.show({
        message: trade ? 'Handel gespeichert.' : 'Handel erfasst.',
        actionLabel: 'Rückgängig',
        onAction: () => reverse(result.groupId),
      });
    } catch (error) {
      setErrors({
        form:
          error instanceof ApiError && error.code === 'account_closed'
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
  const preview = validateTrade(draft);
  const taxInput = parseAmount(draft.tax);
  const showTax = draft.kind === 'sell' || !taxInput.ok || taxInput.cents !== 0;
  const accountLabel = (account: AccountRow) =>
    `${account.name}${account.institutionId ? ` · ${institutions.find((institution) => institution.id === account.institutionId)?.name ?? 'Institut'}` : ''} (${account.currency})`;
  return (
    <form className="kform" onSubmit={(event) => void save(event)}>
      <fieldset className="instrument-fields" disabled={busy}>
        <Field label="Handelsart">
          {({ id }) => (
            <Select
              id={id}
              value={draft.kind}
              disabled={!!trade}
              onChange={(event) => update('kind', event.target.value)}
            >
              <option value="buy">Kauf</option>
              <option value="sell">Verkauf</option>
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
              disabled={!!trade}
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
        <Field
          label="Stück"
          error={errors.units}
          hint="Positive Stückzahl, bis zu acht Nachkommastellen."
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
        {(['amount', 'fee', ...(showTax ? ['tax'] : [])] as ('amount' | 'fee' | 'tax')[]).map(
          (key) => (
            <Field
              key={key}
              label={`${key === 'amount' ? 'Bruttobetrag' : key === 'fee' ? 'Gebühren' : 'Einbehaltene Steuer'} (${account?.currency ?? 'Kontowährung'})`}
              error={errors[key]}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  value={draft[key]}
                  required
                  maxLength={40}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onChange={(event) => update(key, event.target.value)}
                />
              )}
            </Field>
          ),
        )}
        {draft.kind === 'buy' && showTax && (
          <p className="vnote">
            Ein Kauf hat keine einbehaltene Steuer. Steuer auf 0 setzen oder Verkauf wählen.
          </p>
        )}
        <p className="vnote">
          Aus der Abrechnung übernehmen. Gebühren und Steuern werden nicht geschätzt oder nochmals
          berechnet.
        </p>
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
              maxLength={4000}
              aria-describedby={describedBy}
              onChange={(event) => update('note', event.target.value)}
            />
          )}
        </Field>
        {errors.form && (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button
          type="submit"
          disabled={busy || !account || !securities.length || (!!trade && !changed)}
        >
          {busy ? 'Wird gespeichert …' : trade ? 'Handel speichern' : 'Handel erfassen'}
        </Button>
      </fieldset>
    </form>
  );
}
