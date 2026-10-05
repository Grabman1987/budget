import { useAmountPrivacy, DetailPanel } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import { incomeQuery } from './api';
import { StatusStamp } from './status-stamp';

/** The month's income as a button (title block value or chain term) that opens the panel. */
export function IncomeButton({ value, onOpen }: { value: string; onOpen: () => void }) {
  useAmountPrivacy();
  return (
    <button type="button" className="xp-income-btn" onClick={onOpen}>
      {value}
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">Einnahmen im Detail</span>
    </button>
  );
}

/**
 * Einnahmen of a month: received against expected, per income type and per expected payment
 * (`GET /api/expected/income`). Expected income is a promise, not money to distribute.
 */
export function IncomePanel({
  month,
  open,
  onClose,
  bookedCents,
}: {
  month: string;
  open: boolean;
  onClose: () => void;
  /** Everything booked as income in the month (Plan › Monat), expected or not. */
  bookedCents?: number | undefined;
}) {
  useAmountPrivacy();
  return (
    <DetailPanel open={open} onClose={onClose} title={`Einnahmen ${monthLabel(month)}`}>
      {open && <IncomeBody month={month} bookedCents={bookedCents} />}
    </DetailPanel>
  );
}

function IncomeBody({ month, bookedCents }: { month: string; bookedCents?: number | undefined }) {
  useAmountPrivacy();
  const income = useQuery(incomeQuery(month));
  if (income.isPending) return <LoadingNote what="Einnahmen" />;
  if (income.isError)
    return (
      <ErrorNote what="Einnahmen" error={income.error} onRetry={() => void income.refetch()} />
    );
  const data = income.data;
  const empty = data.byPayment.length === 0;
  return (
    <div className="kform xp-panel">
      <div>
        <div className="xp-big" data-testid="income-received">
          {eur(data.receivedCents)}
        </div>
        <p className="panel-sub">
          eingegangen im {monthLabel(month).split(' ')[0]} · erwartet {eur(data.expectedCents)}
          {bookedCents !== undefined && ` · als Einnahme gebucht ${eur(bookedCents)}`}
        </p>
      </div>
      {empty ? (
        <p className="rev-empty">Für diesen Monat sind keine Einnahmen erwartet.</p>
      ) : (
        <>
          <section aria-labelledby="xp-inc-type">
            <h3 id="xp-inc-type" className="panel-h">
              Nach Einkommensart
            </h3>
            <table className="xp-table">
              <caption className="sr-only">Einnahmen nach Art, eingegangen gegen erwartet</caption>
              <thead>
                <tr>
                  <th className="tech" scope="col">
                    Art
                  </th>
                  <th className="tech col-num" scope="col">
                    Eingegangen
                  </th>
                  <th className="tech col-num" scope="col">
                    Erwartet
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byIncomeType.map((t) => (
                  <tr key={t.incomeTypeId ?? 'none'}>
                    <td>{t.name ?? 'Ohne Einkommensart'}</td>
                    <td className="col-num">{eur(t.receivedCents)}</td>
                    <td className="col-num">{eur(t.expectedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section aria-labelledby="xp-inc-pay">
            <h3 id="xp-inc-pay" className="panel-h">
              Nach wiederkehrender Zahlung
            </h3>
            <ul className="xp-occ xp-inc" aria-label="Erwartete Einnahmen des Monats">
              {data.byPayment.map((l) => (
                <li key={l.occurrenceId}>
                  <span className="xp-occ-date">
                    <strong>{l.name}</strong>
                    <span className="xp-sub">{longDay(l.dueDate)}</span>
                  </span>
                  <span className="xp-occ-amt">
                    {eur(l.receivedCents)}{' '}
                    <span className="xp-sub">von {eur(l.expectedCents)}</span>
                  </span>
                  <StatusStamp status={l.status} alert={l.status === 'missed'} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <p className="xp-note">
        Erwartete Einnahmen sind kein Geld zum Verteilen. In Zu verteilen zählt nur, was als Buchung
        auf dem Konto angekommen ist.
      </p>
    </div>
  );
}
