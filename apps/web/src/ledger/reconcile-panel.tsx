import { parseAmount, todayInVienna } from '@budget/domain';
import { AmountInput, Button, DetailPanel, Field, TextInput } from '@budget/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppLink } from '../shell/app-link';
import { previewReconciliation, reconcileAccount, type ReconcileRequest } from './api';
import { eur, longDay, shortDay } from './format';
import { errorText } from './labels';
import { useLedgerWrites } from './mutations';
import { LEDGER_KEY } from './queries';
import { findingOf } from './reconcile-model';
import { ErrorNote, LoadingNote } from './states';
import type { AccountRow } from './types';

/** Value that follows `value` after a pause (the preview is asked for when typing stops). */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** Kontostand prüfen in the side panel (desktop) or bottom sheet (phone). */
export function ReconcilePanel({
  account,
  open,
  onClose,
}: {
  account: AccountRow;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <DetailPanel open={open} onClose={onClose} title={`Kontostand prüfen · ${account.name}`}>
      <ReconcileFlow account={account} onDone={onClose} />
    </DetailPanel>
  );
}

function ReconcileFlow({ account, onDone }: { account: AccountRow; onDone: () => void }) {
  const qc = useQueryClient();
  const writes = useLedgerWrites();
  const [date, setDate] = useState(todayInVienna());
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsed = parseAmount(text);
  const statement = parsed.ok && text.trim() !== '' ? parsed.cents : null;
  const asked = useDebounced({ date, statement }, 300);
  const ready = asked.statement !== null && /^\d{4}-\d{2}-\d{2}$/.test(asked.date);

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
  const finding = data ? findingOf(data) : null;
  // The panel shows the answer for what is typed now, not for the previous input.
  const current = ready && asked.statement === statement && asked.date === date;

  const confirm = useMutation({
    mutationFn: (extra: Partial<ReconcileRequest>) =>
      reconcileAccount(account.id, {
        date: asked.date,
        statementBalanceCents: asked.statement as number,
        ...extra,
      }),
    onSuccess: ({ result }) => {
      void qc.invalidateQueries({ queryKey: LEDGER_KEY });
      writes.offerUndo(
        result.adjustmentBookingId
          ? `Kontostand geprüft, Ausgleich ${eur(result.differenceCents, { sign: true })} gebucht.`
          : `Kontostand geprüft: ${result.reconciledCount} Buchungen festgeschrieben.`,
        result.groupId,
      );
      onDone();
    },
    onError: (e) => setError(errorText(e)),
  });
  const run = (extra: Partial<ReconcileRequest>) => {
    setError(null);
    confirm.mutate(extra);
  };
  const dropDuplicate = (id: string) => {
    setError(null);
    writes.remove.mutate(
      { id },
      { onSettled: () => void qc.invalidateQueries({ queryKey: LEDGER_KEY }) },
    );
  };

  return (
    <div className="kform">
      <p className="text-muted">
        Vergleicht den gebuchten App-Saldo mit dem Saldo laut Bank. Stimmt beides überein, werden
        die bestätigten Buchungen als geprüft festgeschrieben. Vorgemerkte Buchungen zählen nicht.
      </p>
      <Field label="Stichtag">
        {({ id }) => (
          <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
      </Field>
      <AmountInput label="Saldo laut Bank" value={text} onChange={setText} />
      {data && current && (
        <dl className="kv-list">
          <div>
            <dt>App-Saldo gebucht</dt>
            <dd>{eur(data.bookedBalanceCents)}</dd>
          </div>
          <div>
            <dt>vorgemerkt, nicht gezählt</dt>
            <dd>{eur(data.pendingCents, { sign: true })}</dd>
          </div>
          <div>
            <dt>Saldo laut Bank</dt>
            <dd>{eur(data.statementBalanceCents)}</dd>
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
              Differenz 0,00 € · stimmt überein
            </p>
            <div className="panel-actions">
              <Button disabled={confirm.isPending} onClick={() => run({})}>
                Festschreiben ({data.toReconcileCount})
              </Button>
            </div>
          </>
        )}
        {data && current && finding && finding.kind !== 'ok' && (
          <>
            <p className="kdiff is-bad">
              <AlertTriangle
                className="icon icon-sm"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>
                {finding.kind === 'duplicate' && (
                  <>
                    <strong>Doppelt:</strong> {finding.candidate.payeeName ?? 'Buchung'}{' '}
                    {eur(finding.candidate.amountCents)} am {shortDay(finding.candidate.date)} steht
                    zweimal in der App, die Bank kennt sie einmal. Differenz{' '}
                    {eur(data.differenceCents, { sign: true })}.
                  </>
                )}
                {finding.kind === 'pending' && (
                  <>
                    <strong>Fehlt:</strong>{' '}
                    {finding.bookingIds.length === 1
                      ? 'Eine vorgemerkte Buchung'
                      : `${finding.bookingIds.length} vorgemerkte Buchungen`}{' '}
                    ({eur(finding.sumCents, { sign: true })}) hat die Bank schon gebucht. Bestätige
                    sie, dann geht die Rechnung auf.
                  </>
                )}
                {finding.kind === 'missing' && (
                  <>
                    <strong>
                      Es fehlt {finding.type === 'expense' ? 'eine Ausgabe' : 'eine Einnahme'}
                    </strong>{' '}
                    über {eur(finding.amountCents)}: Die Bank meldet{' '}
                    {eur(Math.abs(data.differenceCents))}{' '}
                    {data.differenceCents < 0 ? 'weniger' : 'mehr'} als die App. Keine doppelte
                    Buchung passt zu diesem Betrag.
                  </>
                )}
                {finding.kind === 'other' && (
                  <>
                    <strong>Differenz {eur(data.differenceCents, { sign: true })}.</strong> Keine
                    Buchung erklärt sie.
                  </>
                )}
              </span>
            </p>
            <div className="panel-actions">
              {finding.kind === 'duplicate' && (
                <Button
                  disabled={writes.remove.isPending}
                  onClick={() => dropDuplicate(finding.candidate.removeId)}
                >
                  Doppelte Buchung entfernen
                </Button>
              )}
              {finding.kind === 'pending' && (
                <Button
                  disabled={confirm.isPending}
                  onClick={() => run({ confirmBookingIds: finding.bookingIds })}
                >
                  Bestätigen und festschreiben
                </Button>
              )}
              <Button
                variant={
                  finding.kind === 'missing' || finding.kind === 'other' ? 'primary' : 'ghost'
                }
                disabled={confirm.isPending}
                onClick={() => run({ adjust: true })}
              >
                Differenz ausgleichen · {eur(data.differenceCents, { sign: true })}
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
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="text-muted">
        {account.lastReconciledOn
          ? `Zuletzt geprüft am ${longDay(account.lastReconciledOn)}.`
          : 'Dieses Konto wurde noch nie geprüft.'}
      </p>
    </div>
  );
}
