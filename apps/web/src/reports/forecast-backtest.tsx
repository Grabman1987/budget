import type { ForecastBacktest } from '@budget/db';
import { useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { eur, monthName, shortDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { forecastBacktestQuery } from './liquidity-api';
import { ReportTable } from './report-table';

type Miss = ForecastBacktest['largestMisses'][number];
const CAUSE: Record<NonNullable<Miss['cause']>, string> = {
  unplanned_expense: 'Ungeplante Ausgabe',
  late_income: 'Verspätete Einnahme',
  missing_schedule: 'Fehlender Zahlungstermin',
  unclassified: 'Ursache nicht eindeutig',
};

export function ForecastBacktestSection() {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="card rf-backtest rf-wide"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>Prognose im Rückblick</span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </summary>
      {open && <BacktestResults />}
    </details>
  );
}

function BacktestResults() {
  useAmountPrivacy();
  const query = useQuery(forecastBacktestQuery());
  if (query.isPending) return <LoadingNote what="Prognoserückblick" />;
  if (query.isError)
    return (
      <ErrorNote
        what="Prognoserückblick"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const { rows, meanEndErrorCents, meanLowErrorCents, largestMisses, incompleteAccounts } =
    query.data;
  return (
    <div className="rf-backtest-content">
      <p>
        Letzte sechs abgeschlossene Monate. Je Budget-Konto vergleichen wir die rekonstruierte
        Prognose vom ersten Monatstag mit den gebuchten Tagesständen.
      </p>
      {incompleteAccounts > 0 && (
        <p>Ausgelassene Kontomonate mit fehlenden Daten: {incompleteAccounts}</p>
      )}
      {meanEndErrorCents === null || meanLowErrorCents === null ? (
        <EmptyNote>Für diesen Zeitraum gibt es keine vergleichbaren Kontostände.</EmptyNote>
      ) : (
        <>
          <p>
            Mittlere absolute Abweichung bei {rows.length}{' '}
            {rows.length === 1 ? 'Kontomonat' : 'Kontomonaten'} · Monatsende{' '}
            <strong>{eur(meanEndErrorCents)}</strong> · Tiefpunkt{' '}
            <strong>{eur(meanLowErrorCents)}</strong>
          </p>
          {largestMisses.length === 0 ? (
            <p>Die verglichenen Kontostände stimmen mit der Prognose überein.</p>
          ) : (
            <ReportTable
              caption="Größte Prognoseabweichungen"
              regionLabel="Größte Prognoseabweichungen"
            >
              <thead>
                <tr>
                  <th scope="col">Konto und Monat</th>
                  <th scope="col" className="n">
                    Prognose
                  </th>
                  <th scope="col" className="n">
                    Ist
                  </th>
                  <th scope="col" className="n">
                    Abweichung
                  </th>
                  <th scope="col">Mögliche Ursache</th>
                </tr>
              </thead>
              <tbody>
                {largestMisses.map((miss) => (
                  <tr key={`${miss.month}/${miss.accountId}/${miss.metric}`}>
                    <th scope="row">
                      {miss.name} · {monthName(`${miss.month}-01`)} {miss.month.slice(0, 4)}
                      <br />
                      {miss.metric === 'end' ? 'Monatsende' : 'Tiefpunkt'}
                    </th>
                    <td className="n">
                      {eur(miss.predictedCents)} · {shortDay(miss.predictedDay)}
                    </td>
                    <td className="n">
                      {eur(miss.actualCents)} · {shortDay(miss.actualDay)}
                    </td>
                    <td className="n">{eur(miss.errorCents, { sign: true })}</td>
                    <td>{CAUSE[miss.cause ?? 'unclassified']}</td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          )}
        </>
      )}
    </div>
  );
}
