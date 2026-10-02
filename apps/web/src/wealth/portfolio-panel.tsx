import { Button, DetailPanel, Field, TextInput, useToast } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../api/http';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { LoadingNote, ErrorNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { instrumentQuery, type PortfolioPosition } from './portfolio-api';
import { basisReason, moneyText, quoteStand, quoteText, unitsText } from './portfolio-format';
import { InstrumentForm, INSTRUMENT_KIND } from './instrument-form';

export function InstrumentPanel({
  id,
  position,
  asOf,
  onClose,
  onSelect,
  positionState,
  onRetryPositions,
}: {
  id: string;
  position?: PortfolioPosition | undefined;
  asOf?: string | undefined;
  onClose: () => void;
  onSelect: (id?: string) => void;
  positionState: 'loading' | 'unavailable' | 'ready';
  onRetryPositions: () => void;
}) {
  const creating = id === 'neu';
  const instrument = useQuery(instrumentQuery(creating ? '' : id));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<'close' | 'edit' | 'navigation'>('close');
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const blockedDuringSaveRef = useRef(false);
  const setDirtyNow = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);
  const setSavingNow = useCallback((value: boolean) => {
    savingRef.current = value;
    setSaving(value);
  }, []);
  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (savingRef.current) {
        blockedDuringSaveRef.current = true;
      }
      return dirtyRef.current || savingRef.current;
    },
    withResolver: true,
    enableBeforeUnload: () => dirtyRef.current || savingRef.current,
  });
  const { status: blockerStatus, reset: resetBlockedNavigation } = blocker;
  useEffect(() => {
    if (blockerStatus !== 'blocked') return;
    if (blockedDuringSaveRef.current || savingRef.current) {
      blockedDuringSaveRef.current = false;
      setAsking(false);
      resetBlockedNavigation();
      return;
    }
    setDiscardTarget('navigation');
    setAsking(true);
  }, [blockerStatus, resetBlockedNavigation, saving]);
  const close = () => {
    setDirtyNow(false);
    setAsking(false);
    setEditing(false);
    onClose();
  };
  return (
    <DetailPanel
      open={!!id}
      title={
        creating
          ? 'Instrument anlegen'
          : editing
            ? 'Stammdaten bearbeiten'
            : (instrument.data?.security.name ?? 'Instrument')
      }
      onClose={close}
      beforeClose={() => {
        if (savingRef.current || blocker.status === 'blocked') return false;
        if (!dirtyRef.current) return true;
        setDiscardTarget('close');
        setAsking(true);
        return false;
      }}
    >
      {!creating && instrument.isPending && <LoadingNote what="Instrumentdaten" />}
      {!creating && instrument.isError && (
        <ErrorNote
          what="Instrumentdaten"
          error={instrument.error}
          onRetry={() => void instrument.refetch()}
        />
      )}
      {creating || (editing && instrument.data) ? (
        <InstrumentForm
          key={id}
          security={creating ? undefined : instrument.data?.security}
          onDirty={setDirtyNow}
          onSaved={(security) => {
            setDirtyNow(false);
            setSavingNow(false);
            setAsking(false);
            setEditing(false);
            onSelect(security.id);
          }}
          onSelect={onSelect}
          onBusy={setSavingNow}
        />
      ) : (
        instrument.data && (
          <div className="instrument-detail">
            <dl className="instrument-metadata">
              <div>
                <dt>Art</dt>
                <dd>{INSTRUMENT_KIND[instrument.data.security.kind]}</dd>
              </div>
              <div>
                <dt>Währung</dt>
                <dd>{instrument.data.security.currency}</dd>
              </div>
              <div>
                <dt>ISIN</dt>
                <dd>{instrument.data.security.isin ?? '—'}</dd>
              </div>
              <div>
                <dt>Symbol</dt>
                <dd>{instrument.data.security.symbol ?? '—'}</dd>
              </div>
            </dl>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                if (dirty) {
                  setDiscardTarget('edit');
                  setAsking(true);
                } else setEditing(true);
              }}
            >
              Stammdaten bearbeiten
            </Button>
            {!position && positionState === 'loading' && <LoadingNote what="Bestände" />}
            {!position && positionState === 'unavailable' && (
              <ErrorNote what="Bestände" error={undefined} onRetry={onRetryPositions} />
            )}
            {!position && positionState === 'ready' && (
              <p className="vnote">Dieses Instrument hat keinen aktuellen Bestand.</p>
            )}
            {position && (
              <>
                <h3>Kurs</h3>
                <p className="instrument-quote">
                  {quoteText(position?.quote ?? null)}
                  <small>{quoteStand(position?.quote ?? null)}</small>
                </p>
              </>
            )}
            {position && (
              <>
                <h3>Bestand je Konto</h3>
                <table className="instrument-accounts">
                  <caption className="sr-only">
                    Bestand des Instruments je Konto und Plattform
                  </caption>
                  <thead>
                    <tr>
                      <th>Konto / Plattform</th>
                      <th className="num">Stück / Wert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {position.accounts.map((a) => (
                      <tr key={a.accountId}>
                        <th scope="row">
                          <AppLink to={`/konten/${encodeURIComponent(a.accountId)}`}>
                            {a.name}
                          </AppLink>
                          <small>{a.institution ?? 'Kein Institut zugeordnet'}</small>
                        </th>
                        <td className="num">
                          {unitsText(a.unitsE8)}
                          <small>
                            {a.valueCents === null
                              ? a.valueStatus === 'missing_price'
                                ? 'Kurs fehlt'
                                : 'Wechselkurs fehlt'
                              : moneyText(a.valueCents)}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="vnote">
                  {position.costCents === null
                    ? basisReason(position.accounts)
                    : `Einstand ${moneyText(position.costCents)}`}{' '}
                  · Wertzuwachs {moneyText(position.gainCents)}
                </p>
              </>
            )}
            {asOf && position && (
              <ManualQuote
                key={id}
                securityId={id}
                currency={instrument.data.security.currency}
                asOf={asOf}
                onDirty={setDirtyNow}
                onBusy={setSavingNow}
              />
            )}
          </div>
        )
      )}
      {asking && (
        <div className="instrument-discard" role="alert">
          <p>
            {creating || editing
              ? 'Ungespeicherte Angaben verwerfen?'
              : 'Ungespeicherten Kurs verwerfen?'}
          </p>
          <Button
            disabled={saving}
            onClick={() => {
              setAsking(false);
              if (discardTarget === 'navigation' && blocker.status === 'blocked') blocker.reset();
            }}
          >
            Weiter bearbeiten
          </Button>
          <Button
            disabled={saving}
            variant="ghost"
            onClick={() => {
              if (discardTarget === 'edit') {
                setDirtyNow(false);
                setAsking(false);
                setEditing(true);
              } else if (discardTarget === 'navigation' && blocker.status === 'blocked') {
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
function ManualQuote({
  securityId,
  currency,
  asOf,
  onDirty,
  onBusy,
}: {
  securityId: string;
  currency: string;
  asOf: string;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [date, setDate] = useState(asOf);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries();
  const undo = (groupId: string, redo = false) =>
    void undoGroup(groupId).then(
      async (result) => {
        await refresh();
        toast.show({
          message: redo ? 'Wiederholt.' : 'Rückgängig gemacht.',
          actionLabel: redo ? 'Rückgängig' : 'Wiederholen',
          onAction: () => undo(result.groupId, !redo),
        });
      },
      (err: unknown) => toast.show({ message: errorText(err) }),
    );
  const save = async () => {
    if (busy) return;
    const decimal = price.trim().replace(',', '.');
    if (!/^\d+(\.\d{1,6})?$/.test(decimal) || !/[1-9]/.test(decimal)) {
      setError('Positiven Kurs mit höchstens sechs Nachkommastellen eingeben.');
      return;
    }
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const result = await request<{ groupId: string }>(
        'PUT',
        `/api/securities/${encodeURIComponent(securityId)}/prices/${encodeURIComponent(date)}`,
        { price: decimal },
      );
      setPrice('');
      onDirty(false);
      await refresh();
      toast.show({
        message: 'Manueller Kurs gespeichert.',
        actionLabel: 'Rückgängig',
        onAction: () => undo(result.groupId),
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <form
      className="manual-quote"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="instrument-fields" disabled={busy}>
        <h3>Kurs eintragen</h3>
        <p className="vnote">Ein manueller Kurs wird beim automatischen Kursabruf beibehalten.</p>
        <Field label="Kursdatum">
          {({ id }) => (
            <TextInput
              id={id}
              type="date"
              value={date}
              max={asOf}
              required
              onChange={(event) => {
                setDate(event.target.value);
                onDirty(true);
              }}
            />
          )}
        </Field>
        <Field label={`Kurs (${currency})`}>
          {({ id }) => (
            <TextInput
              id={id}
              inputMode="decimal"
              value={price}
              required
              maxLength={30}
              placeholder="0,00"
              onChange={(event) => {
                setPrice(event.target.value);
                onDirty(true);
              }}
            />
          )}
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Kurs wird gespeichert …' : 'Kurs speichern'}
        </Button>
      </fieldset>
    </form>
  );
}
