import { useAmountPrivacy, DetailPanel, Button } from '@budget/ui';
import { useState } from 'react';
import { addMonths, monthOf, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { eur, longDay, nativeCurrency } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import { incomeQuery, skipOccurrence, type MonthIncomeLine } from './api';
import { useBudgetWrite } from '../budget/use-category-writes';
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
    <DetailPanel
      open={open}
      onClose={onClose}
      title={`Einnahmen ${monthLabel(month)}`}
      focusableBody
    >
      {open && <IncomeBody month={month} bookedCents={bookedCents} />}
    </DetailPanel>
  );
}

export function IncomeBody({
  month,
  bookedCents,
}: {
  month: string;
  bookedCents?: number | undefined;
}) {
  const hidden = useAmountPrivacy();
  const income = useQuery(incomeQuery(month));
  if (income.isPending) return <LoadingNote what="Einnahmen" />;
  if (income.isError)
    return (
      <ErrorNote what="Einnahmen" error={income.error} onRetry={() => void income.refetch()} />
    );
  const data = income.data;
  const currentMonth = monthOf(todayInVienna());
  const canClose = month >= addMonths(currentMonth, -1) && month <= addMonths(currentMonth, 12);
  const empty = data.byPayment.length === 0;
  return (
    <div className="kform xp-panel">
      <div>
        <p className="panel-sub">Eingegangen</p>
        <div className="xp-big" data-testid="income-received">
          {eur(data.receivedCents)}
        </div>
        <p className="panel-sub">
          von erwartet {eur(data.expectedCents)} · {monthLabel(month)}
        </p>
        {!hidden && data.expectedCents > 0 && (
          <progress
            aria-label="Eingegangene erwartete Einnahmen"
            max={data.expectedCents}
            value={Math.max(0, Math.min(data.receivedCents, data.expectedCents))}
          />
        )}
      </div>
      {empty && !data.closedPayments?.length ? (
        <p className="rev-empty">Für diesen Monat sind keine Einnahmen erwartet.</p>
      ) : !empty ? (
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
                    {canClose && l.bookingId === null && l.status !== 'skipped' && (
                      <CloseIncome line={l} />
                    )}
                  </span>
                  <span className="xp-occ-amt">
                    {l.bookingId !== null && l.receivedCents === 0 ? (
                      // Linked, but the booking does not count in this month (other month, after
                      // today, capital or refund): do not read it as "nothing received".
                      <span className="xp-sub">
                        Gebucht, zählt nicht in diesem Monat · erwartet {eur(l.expectedCents)}
                      </span>
                    ) : (
                      <>
                        {eur(l.receivedCents)}{' '}
                        <span className="xp-sub">von {eur(l.expectedCents)}</span>
                      </>
                    )}
                  </span>
                  <StatusStamp status={l.status} alert={l.status === 'missed'} />
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
      {(data.closedPayments?.length ?? 0) > 0 && (
        <section aria-labelledby="xp-inc-closed">
          <h3 id="xp-inc-closed" className="panel-h">
            Kommt nicht mehr
          </h3>
          <ul className="xp-occ xp-inc" aria-label="Abgeschlossene Einnahmen des Monats">
            {data.closedPayments?.map((l) => (
              <li key={l.occurrenceId}>
                <span className="xp-occ-date">
                  <strong>{l.name}</strong>
                  <span className="xp-sub">{longDay(l.dueDate)}</span>
                </span>
                <span className="xp-occ-amt">
                  Fehlbetrag {nativeCurrency(l.expectedCents, l.currency)}
                </span>
                <span className="xp-status">Kommt nicht mehr</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="xp-note">
        {bookedCents !== undefined && (
          <>
            Zählt für Zu verteilen: {eur(bookedCents)} im Planmonat {monthLabel(month)}.{' '}
          </>
        )}
        Erwartete Zahlungen sind Planwerte. Zu verteilen zählt nur tatsächlich gebuchte Zuflüsse im
        zugeordneten Planmonat. Heute zählt Haushaltseinnahmen nach Buchungsdatum; „Für nächsten
        Monat“ zählt im Plan erst im Folgemonat.
      </p>
    </div>
  );
}

/** Reuse the audited single-occurrence cancellation; never edit the recurring rule or cash. */
function CloseIncome({ line }: { line: MonthIncomeLine }) {
  const write = useBudgetWrite();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await write(
            () => skipOccurrence(line.paymentId, line.dueDate),
            () => `${line.name}: Kommt nicht mehr.`,
          );
        } finally {
          setPending(false);
        }
      }}
    >
      Kommt nicht mehr
    </Button>
  );
}
