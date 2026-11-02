import { todayInVienna } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { eur, longDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { paymentDetailQuery, type ExpectedPayment, type PaymentDetailRow } from './api';
import { money } from './expected-model';

/** Read-only arrangement of the same stored history and future terms as the full detail. */
export function PaymentHistoryPreview({ payment }: { payment: ExpectedPayment }) {
  useAmountPrivacy();
  const [today] = useState(todayInVienna);
  const query = useQuery(paymentDetailQuery(payment.id, today));
  const data = query.data;
  return (
    <div className="payment-history-preview">
      <h3>Soll und Ist · letzte 12 Fälligkeiten</h3>
      {query.isPending && <LoadingNote what="Fälligkeiten" />}
      {query.isError && (
        <ErrorNote what="Fälligkeiten" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {data && (
        <>
          {data.history.length ? (
            <table aria-label={`Soll und Ist von ${payment.name}`}>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Soll</th>
                  <th scope="col">Ist</th>
                  <th scope="col">Abweichung</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((row) => (
                  <tr key={row.occurrenceId ?? row.dueDate}>
                    <td>
                      <time dateTime={row.dueDate}>{longDay(row.dueDate)}</time>
                    </td>
                    <td>{detailMoney(row.expectedAmountCents, row.currency)}</td>
                    <td>
                      <strong>{detailMoney(row.actualComparableCents, row.currency)}</strong>
                    </td>
                    <td
                      className={row.deviationCents ? 'has-deviation' : undefined}
                      title={
                        row.unavailableReason
                          ? 'Soll und Ist sind nicht vergleichbar. Details unter Zahlung verwalten.'
                          : undefined
                      }
                    >
                      {row.deviationCents === 0 ? (
                        <>
                          <Check size={14} aria-hidden="true" />
                          <span className="sr-only">Keine Abweichung</span>
                        </>
                      ) : (
                        detailMoney(row.deviationCents, row.currency)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyNote>Keine vergangenen Fälligkeiten gespeichert.</EmptyNote>
          )}
          {data.sparseHistory && (
            <p className="payment-history-source">
              {data.history.length} vergangene Fälligkeiten gespeichert. Ältere Termine werden nicht
              nachgebildet.
            </p>
          )}
          <h3>Nächste erwartet</h3>
          {data.future.length ? (
            <table aria-label={`Nächste erwartete Termine von ${payment.name}`}>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Soll</th>
                </tr>
              </thead>
              <tbody>
                {data.future.slice(0, 3).map((row) => (
                  <tr key={row.occurrenceId ?? row.dueDate}>
                    <td>
                      <time dateTime={row.dueDate}>{longDay(row.dueDate)}</time>
                    </td>
                    <td>
                      <strong>{detailMoney(row.expectedAmountCents, row.currency)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyNote>Keine weiteren Termine nach aktueller Regel.</EmptyNote>
          )}
          <p className="payment-history-source">
            Stand {longDay(data.asOf)} · Vorschau aus aktueller Regel, nicht gespeichert.
          </p>
        </>
      )}
    </div>
  );
}
function detailMoney(value: number | null, currency: PaymentDetailRow['currency']) {
  if (value === null) return '–';
  if (currency !== null) return money(value, currency, true);
  const amount = eur(value, { sign: true }).replace(/ €$/, '');
  return (
    <span title="Währung nicht dokumentiert" aria-label={amount + ' · Währung nicht dokumentiert'}>
      {amount}
      <sup aria-hidden="true">?</sup>
    </span>
  );
}
