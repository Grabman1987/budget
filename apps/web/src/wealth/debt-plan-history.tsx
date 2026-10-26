import {
  addMonths,
  lastDayOfMonth,
  loanMeasureSchema,
  loanMonthSchema,
  parseAmount,
  PaymentBelowInterestError,
  simulateLoan,
  type LoanMeasure,
  type LoanSchedule,
  type LoanTermsInput,
} from '@budget/domain';
import { Button, Field, TextInput, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { request } from '../api/http';
import { fetchSeries } from '../ledger/api';
import { longDay, nativeCurrency } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { SeriesPoint } from '../ledger/types';
import { monthLabel } from '../nav/month';
import { ScrollRegion } from '../reports/spending-shared';
import { DebtPlanChart } from './debt-plan-chart';
import type { DebtAccount } from './debts-api';
import { MoneyInput } from './loan-planning';
import { LOAN_HISTORY_KEY, type LoanPlanView } from './loan-planning-api';

type Basis = {
  plan: LoanPlanView;
  history: SeriesPoint[];
  expected: number;
  historyAvailable: boolean;
};
type LiveDraft = { monthly: string; oneOff: string; oneOffMonth: string };
const emptyDraft = (): LiveDraft => ({ monthly: '0', oneOff: '0', oneOffMonth: '' });

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
  const [draft, setDraft] = useState<LiveDraft>(emptyDraft);
  const [acceptedBasis, setAcceptedBasis] = useState<string | null>(null);
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
  // React Query keeps old data during invalidation and after a failed refetch. Never present it
  // as the current financial basis while a replacement read is pending or has failed.
  const basis = query.isSuccess && !query.isFetching ? query.data : null;
  const currentBasis = basis ? JSON.stringify(basis) : null;
  if (currentBasis && acceptedBasis === null) setAcceptedBasis(currentBasis);
  const needsAdoption =
    currentBasis !== null && acceptedBasis !== null && currentBasis !== acceptedBasis;
  return (
    <section
      className="vcomp debt-full debt-plan-history"
      aria-labelledby="debt-plan-history-title"
    >
      <div className="head">
        <h2 id="debt-plan-history-title">
          Kreditverlauf und Tilgungsplan: {maskMoneyText(loan.name)}
        </h2>
        <span className="aside">Ist und Modell getrennt</span>
      </div>
      {choice}
      {(query.isPending || query.isFetching) && (
        <LoadingNote what="Kreditbasis und Monatsverlauf" />
      )}
      {query.isError && !query.isFetching && (
        <ErrorNote
          what="Kreditbasis und Monatsverlauf"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {needsAdoption && (
        <div role="status" className="debt-live-refresh">
          <p>
            Kontostand, Verlauf oder Konditionen haben sich geändert. Deine Eingaben bleiben bis zur
            Übernahme erhalten.
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(emptyDraft());
              setAcceptedBasis(currentBasis);
            }}
          >
            Neue Basis übernehmen und Eingaben zurücksetzen
          </Button>
        </div>
      )}
      {basis && !needsAdoption && <PlanResult basis={basis} draft={draft} onDraft={setDraft} />}
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

export function parseLiveMeasures(
  monthly: string,
  oneOff: string,
  oneOffMonth: string,
  startMonth: string,
): { measures: LoanMeasure[]; error: string | null } {
  const recurring = parseAmount(monthly);
  const once = parseAmount(oneOff);
  if (!recurring.ok || !once.ok || recurring.cents < 0 || once.cents < 0)
    return { measures: [], error: 'Bitte gültige Sondertilgungen ab 0 eingeben.' };
  const measures: LoanMeasure[] = [];
  if (recurring.cents > 0)
    measures.push({
      kind: 'recurring',
      fromMonth: startMonth,
      toMonth: null,
      everyMonths: 1,
      amountCents: recurring.cents,
    });
  if (once.cents > 0) {
    if (!loanMonthSchema.safeParse(oneOffMonth).success || oneOffMonth < startMonth)
      return {
        measures: [],
        error: 'Für die einmalige Sondertilgung einen Monat ab Modellbeginn auswählen.',
      };
    measures.push({ kind: 'one_off', month: oneOffMonth, amountCents: once.cents });
  }
  if (!loanMeasureSchema.array().safeParse(measures).success)
    return { measures: [], error: 'Die Sondertilgung überschreitet den zulässigen Modellbetrag.' };
  return { measures, error: null };
}

function PlanResult({
  basis,
  draft: values,
  onDraft,
}: {
  basis: Basis;
  draft: LiveDraft;
  onDraft: (draft: LiveDraft) => void;
}) {
  const { plan } = basis;
  const { monthly, oneOff, oneOffMonth } = values;
  const terms = useMemo((): LoanTermsInput | null => {
    const { rateBp, installmentCents, monthlyFeeCents } = plan.terms;
    if (
      plan.missing.length ||
      rateBp === null ||
      installmentCents === null ||
      monthlyFeeCents === null ||
      plan.balanceCents === 0
    )
      return null;
    return {
      balanceCents: plan.balanceCents,
      startMonth: plan.startMonth,
      rateBp,
      installmentCents,
      monthlyFeeCents,
      rateChanges: plan.rateChanges.map((change) => ({
        month: change.validFrom.slice(0, 7),
        rateBp: change.rateBp,
      })),
    };
  }, [plan]);
  const model = useMemo((): { schedule: LoanSchedule | null; error: string | null } => {
    if (!terms) return { schedule: null, error: null };
    try {
      const schedule = simulateLoan(terms);
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
  }, [plan.baseline, terms]);
  const schedule = model.schedule;
  const draft = useMemo(
    () => parseLiveMeasures(monthly, oneOff, oneOffMonth, plan.startMonth),
    [monthly, oneOff, oneOffMonth, plan.startMonth],
  );
  const scenario = useMemo((): { schedule: LoanSchedule | null; error: string | null } => {
    if (!schedule || !terms || draft.error || draft.measures.length === 0)
      return { schedule: null, error: null };
    try {
      return { schedule: simulateLoan(terms, draft.measures), error: null };
    } catch (error) {
      return {
        schedule: null,
        error:
          error instanceof PaymentBelowInterestError
            ? 'Die Monatsrate deckt Zinsen und Gebühren nicht.'
            : 'Kein sicherer Tilgungsplan für dieses Szenario möglich.',
      };
    }
  }, [schedule, terms, draft]);
  const comparison = scenario.schedule;
  const money = (cents: number) => nativeCurrency(cents, plan.currency);
  const active = comparison ?? schedule;
  const lateOneOff =
    comparison?.payoffMonth &&
    draft.measures.some(
      (measure) => measure.kind === 'one_off' && measure.month > comparison.payoffMonth!,
    );
  return (
    <>
      <p className="vnote">
        {maskMoneyText(plan.name)} · {plan.currency} · Kontostand {longDay(plan.asOf)}. Erste
        Modellzahlung: {monthLabel(plan.startMonth)}.
      </p>
      <fieldset className="debt-live-inputs" disabled={!schedule}>
        <legend className="sr-only">Lokale Sondertilgung für diesen Kredit</legend>
        <MoneyInput
          label="Sondertilgung / Monat"
          value={monthly}
          onChange={(value) => onDraft({ ...values, monthly: value })}
          currency={plan.currency}
          hint="Ab der ersten Modellzahlung jeden Monat zusätzlich."
        />
        <MoneyInput
          label="Einmalige Sondertilgung"
          value={oneOff}
          onChange={(value) => onDraft({ ...values, oneOff: value })}
          currency={plan.currency}
          hint="0 bedeutet keine Einmalzahlung."
        />
        <Field label="Monat der Einmalzahlung" hint="Nur bei einer einmaligen Sondertilgung nötig.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              type="month"
              min={plan.startMonth}
              value={oneOffMonth}
              onChange={(event) => onDraft({ ...values, oneOffMonth: event.target.value })}
              aria-describedby={describedBy}
            />
          )}
        </Field>
      </fieldset>
      <p className="vnote">Diese Rechnung wird weder gespeichert noch als Zahlung gebucht.</p>
      {draft.error && (
        <p className="field-error" role="alert">
          {draft.error}
        </p>
      )}
      {scenario.error && (
        <p className="field-error" role="alert">
          {scenario.error}
        </p>
      )}
      {comparison && schedule && (
        <div className="debt-live-result" aria-live="polite">
          <h3>
            {schedule.months - comparison.months > 0
              ? `${schedule.months - comparison.months} ${schedule.months - comparison.months === 1 ? 'Monat' : 'Monate'} früher schuldenfrei`
              : 'Zum gleichen Zeitpunkt schuldenfrei'}
          </h3>
          <p>
            <strong>{money(schedule.totalInterestCents - comparison.totalInterestCents)}</strong>{' '}
            Zinsen gespart
          </p>
          <p>
            {monthLabel(comparison.payoffMonth!)} statt {monthLabel(schedule.payoffMonth!)} · Zinsen
            gesamt: {money(comparison.totalInterestCents)}
          </p>
        </div>
      )}
      {lateOneOff && (
        <p className="vnote">
          Der Einmalmonat liegt nach der Tilgung. Diese Zahlung wirkt im Modell nicht.
        </p>
      )}
      <DebtPlanChart
        basis={plan}
        history={basis.history}
        baseline={schedule}
        scenario={comparison}
      />
      {basis.historyAvailable && basis.history.length < basis.expected && (
        <p className="vnote">
          Nur {basis.history.length} von {basis.expected} möglichen Monatsenden sind erfasst.
          Fehlende Werte bleiben Lücken.
        </p>
      )}
      <p className="vnote">
        Durchgezogen: erfasste Monatsendstände des ausgewählten Kredits und gesonderter aktueller
        Kontostand. Gestrichelt: Basis und, wenn aktiv, lokale Sondertilgung zum Monatsende. Die
        Modellwerte sind keine Buchungen.
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
      {active && (
        <div className="debt-live-years">
          <h3>Zins und Tilgung je Jahr · {comparison ? 'Live-Szenario' : 'Basis'}</h3>
          <ScrollRegion
            label="Zins und Tilgung je Jahr, bei Bedarf horizontal verschiebbar"
            className="debt-live-scroll"
          >
            <p className="table-scroll-hint">Seitlich wischen für weitere Spalten</p>
            <table className="vtable">
              <caption>
                {comparison ? 'Live-Szenario' : 'Basis'}: schuldenfrei{' '}
                {monthLabel(active.payoffMonth!)} · Modellzahlungen in {plan.currency}; keine
                eingerichteten Zahlungen
              </caption>
              <thead>
                <tr>
                  <th scope="col">Jahr</th>
                  <th scope="col">Zinsen</th>
                  <th scope="col">Gebühren</th>
                  <th scope="col">Tilgung</th>
                  <th scope="col">Zahlungen</th>
                </tr>
              </thead>
              <tbody>
                {active.perYear.map((row) => (
                  <tr key={row.year}>
                    <th scope="row">{row.year}</th>
                    <td>{money(row.interestCents)}</td>
                    <td>{money(row.feeCents)}</td>
                    <td>{money(row.principalCents)}</td>
                    <td>{money(row.paymentCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Gesamt</th>
                  <td>{money(active.totalInterestCents)}</td>
                  <td>{money(active.totalFeeCents)}</td>
                  <td>{money(plan.balanceCents)}</td>
                  <td>{money(active.totalPaidCents)}</td>
                </tr>
              </tfoot>
            </table>
          </ScrollRegion>
        </div>
      )}
    </>
  );
}
