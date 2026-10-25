import { useQuery } from '@tanstack/react-query';
import { useAmountPrivacy } from '@budget/ui';
import type { SavingsPlanRecord } from './savings-api';
import { nextPlanExecution, planPurchases } from './savings-model';
import { tradesQuery } from './trade-api';
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
      {query.isSuccess && (
        <TradeHistory securityId={rows[0]!.securityId} trades={purchases.buys} disabled purchases />
      )}
    </>
  );
}
