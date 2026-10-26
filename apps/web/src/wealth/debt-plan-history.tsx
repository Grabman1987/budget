import {
  addMonths,
  lastDayOfMonth,
  PaymentBelowInterestError,
  simulateLoan,
  type LoanSchedule,
} from '@budget/domain';
import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { request } from '../api/http';
import { fetchSeries } from '../ledger/api';
import { longDay, nativeCurrency } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { SeriesPoint } from '../ledger/types';
import { monthLabel } from '../nav/month';
import { DebtPlanChart } from './debt-plan-chart';
import type { DebtAccount } from './debts-api';
import { LOAN_HISTORY_KEY, type LoanPlanView } from './loan-planning-api';

type Basis = {
  plan: LoanPlanView;
  history: SeriesPoint[];
  expected: number;
  historyAvailable: boolean;
};

export const completedDebtMonthEnds = (asOf: string, openingDate: string) =>
  Array.from({ length: 12 }, (_, index) =>
    lastDayOfMonth(addMonths(asOf.slice(0, 7), index - 12)),
  ).filter((date) => date >= openingDate);

export function matchingDebtHistory(
  loan: Pick<DebtAccount, 'id' | 'currency' | 'balanceCents'>,
  plan: LoanPlanView,
  series: Awaited<ReturnType<typeof fetchSeries>>,
  asOf: string,
  monthEnds: readonly string[],
): SeriesPoint[] | null {
  if (
    plan.accountId !== loan.id ||
    plan.asOf !== asOf ||
    plan.currency !== loan.currency ||
    plan.balanceCents !== -loan.balanceCents ||
    series.accountId !== loan.id ||
    series.currency !== plan.currency ||
    series.unavailableCurrencies?.length
  )
    return null;
  const current = series.points.find((point) => point.date === asOf);
  if (!current || Math.max(0, -current.balanceCents) !== plan.balanceCents) return null;
  return series.points
    .filter((point) => monthEnds.includes(point.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The selected loan's stored month ends and saved canonical plan share one read generation. */
export function DebtPlanHistory({
  loan,
  asOf,
  choice,
}: {
  loan: DebtAccount;
  asOf: string;
  choice: ReactNode;
}) {
  useAmountPrivacy();
  const months = useMemo(
    () => completedDebtMonthEnds(asOf, loan.openingDate),
    [asOf, loan.openingDate],
  );
  const from = months[0] ?? loan.openingDate;
  const query = useQuery({
    queryKey: [
      ...LOAN_HISTORY_KEY,
      loan.id,
      loan.name,
      loan.openingDate,
      loan.currency,
      loan.balanceCents,
      from,
      asOf,
    ],
    retry: false,
    queryFn: async (): Promise<Basis> => {
      const [plan, series] = await Promise.allSettled([
        request<LoanPlanView>(
          'GET',
          `/api/wealth/debts/${encodeURIComponent(loan.id)}/plan?asOf=${asOf}`,
        ),
        fetchSeries(loan.id, from, asOf),
      ]);
      if (plan.status === 'rejected') throw plan.reason;
      if (
        plan.value.accountId !== loan.id ||
        plan.value.asOf !== asOf ||
        plan.value.currency !== loan.currency ||
        plan.value.balanceCents !== -loan.balanceCents
      )
        throw new Error('The loan basis does not match the selected account and date.');
      const history =
        series.status === 'fulfilled'
          ? matchingDebtHistory(loan, plan.value, series.value, asOf, months)
          : null;
      return {
        plan: plan.value,
        history: history ?? [],
        expected: months.length,
        historyAvailable: history !== null,
      };
    },
  });
  const basis = query.data;
  return (
    <section
      className="vcomp debt-full debt-plan-history"
      aria-labelledby="debt-plan-history-title"
    >
      <div className="head">
        <h2 id="debt-plan-history-title">Restschuld und Tilgungsplan</h2>
        <span className="aside">Ist und Modell getrennt</span>
      </div>
      {choice}
      {query.isPending && <LoadingNote what="Kreditbasis und Monatsverlauf" />}
      {query.isError && (
        <ErrorNote
          what="Kreditbasis und Monatsverlauf"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {basis && <PlanResult basis={basis} />}
      {basis && !basis.historyAvailable && (
        <p role="status">
          Der Kontoverlauf fehlt oder passt nicht zur Kreditbasis. Ist-Monatswerte werden nicht
          angezeigt.{' '}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Erneut laden
          </Button>
        </p>
      )}
    </section>
  );
}

function PlanResult({ basis }: { basis: Basis }) {
  const { plan } = basis;
  const model = useMemo((): { schedule: LoanSchedule | null; error: string | null } => {
    const { rateBp, installmentCents, monthlyFeeCents } = plan.terms;
    if (
      plan.missing.length ||
      rateBp === null ||
      installmentCents === null ||
      monthlyFeeCents === null ||
      plan.balanceCents === 0
    )
      return { schedule: null, error: null };
    try {
      const schedule = simulateLoan({
        balanceCents: plan.balanceCents,
        startMonth: plan.startMonth,
        rateBp,
        installmentCents,
        monthlyFeeCents,
        rateChanges: plan.rateChanges.map((change) => ({
          month: change.validFrom.slice(0, 7),
          rateBp: change.rateBp,
        })),
      });
      if (
        plan.baseline?.status !== 'ok' ||
        schedule.payoffMonth !== plan.baseline.summary.payoffMonth ||
        schedule.totalInterestCents !== plan.baseline.summary.totalInterestCents ||
        schedule.months !== plan.baseline.summary.months
      )
        return {
          schedule: null,
          error: 'Die Kreditbasis und der gespeicherte Tilgungsplan stimmen nicht überein.',
        };
      return { schedule, error: null };
    } catch (error) {
      return {
        schedule: null,
        error:
          error instanceof PaymentBelowInterestError
            ? 'Die Monatsrate deckt Zinsen und Gebühren nicht.'
            : 'Kein sicherer Tilgungsplan innerhalb von 1.200 Monaten möglich.',
      };
    }
  }, [plan]);
  const schedule = model.schedule;
  const money = (cents: number) => nativeCurrency(cents, plan.currency);
  return (
    <>
      <p className="vnote">
        {maskMoneyText(plan.name)} · {plan.currency} · Kontostand {longDay(plan.asOf)}. Erste
        Modellzahlung: {monthLabel(plan.startMonth)}.
      </p>
      <DebtPlanChart basis={plan} history={basis.history} baseline={schedule} />
      {basis.historyAvailable && basis.history.length < basis.expected && (
        <p className="vnote">
          Nur {basis.history.length} von {basis.expected} möglichen Monatsenden sind erfasst.
          Fehlende Werte bleiben Lücken.
        </p>
      )}
      <p className="vnote">
        Durchgezogen: erfasste Monatsendstände und gesonderter aktueller Kontostand. Gestrichelt:
        Zahlungen des gespeicherten Tilgungsplans zum Monatsende. Die Modellwerte sind keine
        Buchungen.
      </p>
      {plan.missing.length > 0 && (
        <p role="status">
          Für den Tilgungsplan fehlen Kreditkonditionen:{' '}
          {plan.missing
            .map(
              (key) =>
                ({ rate: 'Jahreszins', installment: 'Monatsrate', fee: 'monatliche Gebühr' })[key],
            )
            .join(', ')}
          .
        </p>
      )}
      {model.error && <p role="status">{model.error}</p>}
      {schedule && (
        <p className="vnote">
          Schuldenfrei:{' '}
          {schedule.payoffMonth ? monthLabel(schedule.payoffMonth) : 'bereits getilgt'} · Zinsen
          gesamt: {money(schedule.totalInterestCents)}. Diese Werte stammen aus derselben Rechnung
          wie die gestrichelte Linie.
        </p>
      )}
    </>
  );
}
