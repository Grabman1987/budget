import { useQuery } from '@tanstack/react-query';
import { privateAmount, useAmountPrivacy } from '@budget/ui';
import type { SavingsPlanRecord } from './savings-api';
import { nextPlanExecution, planPurchases, savingsMonthStrip } from './savings-model';
import { tradesQuery } from './trade-api';
import { unitsText } from './portfolio-format';
import { TradeHistory } from './trade-history';
import { longDay, nativeCurrency } from '../ledger/format';
import { LoadingNote, ErrorNote } from '../ledger/states';

export function SavingsDetail({
  rows,
  today,
  currency,
}: {
  rows: SavingsPlanRecord[];
  today: string;
  currency: string | undefined;
}) {
  useAmountPrivacy();
  const query = useQuery(tradesQuery(rows[0]!.securityId));
  const next = nextPlanExecution(rows, today);
  const purchases = planPurchases(rows, query.data?.trades ?? [], today);
  const months = savingsMonthStrip(rows, query.data?.trades ?? [], today);
  const status = { not_planned: 'Nicht geplant', open: 'Offen', missing_link: 'Zuordnung fehlt', executed: 'Ausgeführt · zugeordnet', ambiguous: 'Zuordnung prüfen' };
  const money = (value: number | null) =>
    value !== null && currency ? nativeCurrency(value, currency) : 'Nicht verfügbar';
  return (
    <>
      <dl className="savings-summary">
        <div>
          <dt>Nächste Ausführung · geplant</dt>
          <dd data-testid="savings-next">
            {next
              ? `${longDay(next.date)} · ${money(next.amountCents)}`
              : 'Keine eindeutige künftige Ausführung'}
          </dd>
        </div>
        <div>
          <dt>Eingezahlt seit {purchases.since ? longDay(purchases.since) : 'Beginn'}</dt>
          <dd data-testid="savings-paid">
            {query.isSuccess ? money(purchases.totalCents) : 'Wird geladen …'}
          </dd>
        </div>
      </dl>
      <p className="vnote">
        Summe der erfassten Kaufbeträge ohne Gebühren und Steuern für dieses Instrument im
        Anlagekonto seit Sparplanbeginn, einschließlich manueller Käufe. Keine Bestätigung einer
        Bankausführung.
      </p>
      {query.isPending && <LoadingNote what="Käufe" />}
      {query.isError && (
        <ErrorNote what="Käufe" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.isSuccess && <>
        <section className="savings-months" aria-labelledby="savings-months-title">
          <h3 id="savings-months-title">Letzte zwölf Monate</h3>
          <p className="vnote">Stand {longDay(today)}. „Ausgeführt“ bedeutet ausdrücklich zugeordneter Kauf, keine Bestätigung der Bank. Manuelle oder nur ähnlich erkannte Käufe bleiben in der Kaufhistorie; bei fehlender Zuordnung bitte den Posteingang prüfen.</p>
          <ol>{months.map((slot) => <li key={slot.month}>
            <strong>{slot.month}</strong><span>{status[slot.status]}</span>
            <span>{slot.amountCents !== null ? money(slot.amountCents) : slot.plannedCents !== null ? `Geplant: ${money(slot.plannedCents)}` : 'Kein geplanter Betrag'}</span>
            <span>Stück: {slot.unitsE8 === null ? 'nicht zugeordnet' : privateAmount(unitsText(slot.unitsE8))}</span>
            {slot.tradeDate && <small>Kauf am {longDay(slot.tradeDate)}</small>}
          </li>)}</ol>
        </section>
        <details className="savings-purchases"><summary>Käufe anzeigen</summary>
          <TradeHistory securityId={rows[0]!.securityId} trades={purchases.buys} disabled purchases />
        </details>
      </>}
    </>
  );
}
