import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { LEDGER_KEY } from '../ledger/queries';

export interface ReconciliationChangesData {
  checkId: string;
  date: string;
  statementBalanceCents: number;
  currentBalanceCents: number;
  explainedCents: number;
  unexplainedCents: number;
  changes: {
    bookingId: string;
    at: string;
    change: 'created' | 'changed' | 'deleted' | 'restored';
    date: string;
    payeeName: string | null;
    amountBeforeCents: number | null;
    amountAfterCents: number | null;
    effectCents: number;
  }[];
}
const CHANGE: Record<ReconciliationChangesData['changes'][number]['change'], string> = {
  created: 'angelegt',
  changed: 'geändert',
  deleted: 'gelöscht',
  restored: 'wiederhergestellt',
};

/**
 * Konten › Prüfen: why a confirmed balance differs later. Lists the bookings created, changed or
 * deleted after the check inside its period, next to "bei Erstellung" and "aktuell". Read-only.
 */
export function ReconciliationChanges({ accountId }: { accountId: string }) {
  useAmountPrivacy();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'reconciliation-changes', accountId],
    queryFn: () =>
      request<{ changes: ReconciliationChangesData | null }>(
        'GET',
        `/api/accounts/${encodeURIComponent(accountId)}/reconciliation-changes`,
      ),
    enabled: open,
  });
  const data = query.data?.changes;
  return (
    <section className="reconciliation-changes" aria-label="Änderungen seit dem Abgleich">
      <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
        {open ? 'Änderungen ausblenden' : 'Was hat sich geändert?'}
      </Button>
      {open && query.isPending && <LoadingNote what="Änderungen seit dem Abgleich" />}
      {open && query.isError && (
        <ErrorNote
          what="Änderungen seit dem Abgleich"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {open && query.isSuccess && !data && <p>Kein Abgleich für dieses Konto gefunden.</p>}
      {open && data && (
        <>
          <dl>
            <dt>Bei Erstellung (Kontoauszug {longDay(data.date)})</dt>
            <dd>{maskMoneyText(eur(data.statementBalanceCents))}</dd>
            <dt>Aktuell gebucht</dt>
            <dd>{maskMoneyText(eur(data.currentBalanceCents))}</dd>
            <dt>Differenz</dt>
            <dd>
              {maskMoneyText(eur(data.currentBalanceCents - data.statementBalanceCents))}
              {data.unexplainedCents === 0
                ? ' · vollständig durch die Änderungen unten erklärt'
                : ` · davon ${maskMoneyText(eur(data.unexplainedCents))} nicht durch Buchungsänderungen erklärt`}
            </dd>
          </dl>
          {data.changes.length === 0 ? (
            <p>Seit dem Abgleich wurde keine Buchung im geprüften Zeitraum geändert.</p>
          ) : (
            <ul>
              {data.changes.map((c, index) => (
                <li key={`${c.bookingId}-${c.at}-${index}`}>
                  {longDay(c.date)} · {c.payeeName ?? 'Ohne Empfänger'} · {CHANGE[c.change]} ·{' '}
                  {c.amountBeforeCents !== null && c.amountBeforeCents !== c.amountAfterCents
                    ? `${maskMoneyText(eur(c.amountBeforeCents))} → `
                    : ''}
                  {c.amountAfterCents !== null ? maskMoneyText(eur(c.amountAfterCents)) : ''} ·
                  Wirkung auf den Saldo {maskMoneyText(eur(c.effectCents))}
                </li>
              ))}
            </ul>
          )}
          <p>
            Es wird nichts automatisch gebucht oder angepasst. Zum Neu-Abgleichen „Kontostand
            prüfen“ öffnen.
          </p>
        </>
      )}
    </section>
  );
}
