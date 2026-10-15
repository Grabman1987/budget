import { ChartSvg, Line, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { assetsDebtsHistoryQuery } from '../reports/assets-debts-api';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { eur } from '../ledger/format';

/** Actual EUR debt values from the existing report, never a fabricated falling forecast. */
export function DebtHistory() {
  useAmountPrivacy();
  const query = useQuery(assetsDebtsHistoryQuery('1J'));
  const months = query.data?.months ?? [];
  const high = Math.max(1, ...months.map((m) => -m.debtsCents));
  const x = (i: number) => 16 + (i / Math.max(1, months.length - 1)) * 688;
  const y = (cents: number) => 150 - (cents / high) * 120;
  return (
    <section className="debt-history" aria-label="Schuldenverlauf">
      <h2>Verlauf · letzte 12 Monate</h2>
      {query.isPending && <LoadingNote what="Schuldenverlauf" />}
      {query.isError && (
        <ErrorNote
          what="Schuldenverlauf"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {months.length > 1 ? (
        <ChartSvg
          width={720}
          height={180}
          label="Schulden in Euro, tatsächliche Monatswerte"
          testId="debt-history-chart"
          points={months.map((m, i) => ({
            x: x(i),
            date: m.month,
            series: [{ name: 'Schulden', value: eur(-m.debtsCents), color: 'var(--line)' }],
          }))}
        >
          <Line kind="actual" points={months.map((m, i) => [x(i), y(-m.debtsCents)])} />
          <text x={16} y={174} className="svg-label">
            {months[0]?.month}
          </text>
          <text x={704} y={174} textAnchor="end" className="svg-label">
            {months.at(-1)?.month}
          </text>
        </ChartSvg>
      ) : (
        query.isSuccess && <p className="vnote">Noch keine Schuldenhistorie.</p>
      )}
    </section>
  );
}
