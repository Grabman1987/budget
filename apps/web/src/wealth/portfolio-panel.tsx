import { Button, DetailPanel, Field, TextInput, useToast } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { undoGroup } from '../ledger/api';
import { errorText } from '../ledger/labels';
import { LoadingNote, ErrorNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { instrumentQuery, type PortfolioPosition } from './portfolio-api';
import { basisReason, moneyText, quoteStand, quoteText, unitsText } from './portfolio-format';

export function InstrumentPanel({
  id,
  position,
  asOf,
  onClose,
}: {
  id: string;
  position?: PortfolioPosition | undefined;
  asOf?: string | undefined;
  onClose: () => void;
}) {
  const instrument = useQuery(instrumentQuery(id));
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const close = () => {
    setDirty(false);
    setAsking(false);
    onClose();
  };
  return (
    <DetailPanel
      open={!!id}
      title={instrument.data?.security.name ?? 'Instrument'}
      onClose={close}
      beforeClose={() => {
        if (!dirty) return true;
        setAsking(true);
        return false;
      }}
    >
      {instrument.isPending && <LoadingNote what="Instrumentdaten" />}
      {instrument.isError && (
        <ErrorNote
          what="Instrumentdaten"
          error={instrument.error}
          onRetry={() => void instrument.refetch()}
        />
      )}
      {instrument.data && (
        <div className="instrument-detail">
          <dl className="instrument-metadata">
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
          <h3>Kurs</h3>
          <p className="instrument-quote">
            {quoteText(position?.quote ?? null)}
            <small>{quoteStand(position?.quote ?? null)}</small>
          </p>
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
          {asOf && (
            <ManualQuote
              key={id}
              securityId={id}
              currency={instrument.data.security.currency}
              asOf={asOf}
              onDirty={setDirty}
            />
          )}
          {asking && (
            <div className="instrument-discard" role="alert">
              <p>Ungespeicherten Kurs verwerfen?</p>
              <Button onClick={() => setAsking(false)}>Weiter bearbeiten</Button>
              <Button variant="ghost" onClick={close}>
                Verwerfen
              </Button>
            </div>
          )}
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
}: {
  securityId: string;
  currency: string;
  asOf: string;
  onDirty: (dirty: boolean) => void;
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
    </form>
  );
}
