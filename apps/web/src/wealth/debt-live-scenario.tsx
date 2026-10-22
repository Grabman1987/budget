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
import { AppLink } from '../shell/app-link';
import { DebtChart } from './debts-chart';
import type { DebtAccount } from './debts-api';
import { DebtLiquidityCheck } from './debt-liquidity-check';
import { MoneyInput, ERROR_TEXT, rateText } from './loan-planning';
import { LOAN_LIVE_BASIS_KEY, type LoanPlanView } from './loan-planning-api';

type Basis = {
  plan: LoanPlanView;
  history: SeriesPoint[];
  missingHistory: boolean;
  expectedHistory: number;
};
const basisKey = (basis: Basis) => JSON.stringify({
  accountId: basis.plan.accountId,
  name: basis.plan.name,
  currency: basis.plan.currency,
  asOf: basis.plan.asOf,
  startMonth: basis.plan.startMonth,
  balanceCents: basis.plan.balanceCents,
  terms: basis.plan.terms,
  rateChanges: basis.plan.rateChanges,
  history: basis.history.map((point) => [point.date, point.balanceCents]),
  missingHistory: basis.missingHistory,
  expectedHistory: basis.expectedHistory,
});

/** Read and capture a loan basis. Refetches never replace a live draft without an explicit action. */
export function DebtLiveScenario({ loan, asOf, choice }: {
  loan: DebtAccount;
  asOf: string;
  choice: ReactNode;
}) {
  useAmountPrivacy();
  const monthEnds = Array.from({ length: 12 }, (_, i) =>
    lastDayOfMonth(addMonths(asOf.slice(0, 7), i - 12)),
  ).filter((date) => date >= loan.openingDate);
  const from = monthEnds[0] ?? loan.openingDate;
  // One query publishes only a completed read pair. The saved-plan editor's independent cache
  // cannot replace one side. The two existing GETs are not an atomic database snapshot.
  const pair = useQuery({
    queryKey: [...LOAN_LIVE_BASIS_KEY, loan.id, loan.openingDate, from, asOf],
    retry: false,
    queryFn: async () => {
      const [plan, series] = await Promise.allSettled([
        request<LoanPlanView>('GET', `/api/wealth/debts/${encodeURIComponent(loan.id)}/plan?asOf=${asOf}`),
        fetchSeries(loan.id, from, asOf),
      ]);
      if (plan.status === 'rejected') throw plan.reason;
      if (plan.value.accountId !== loan.id || plan.value.asOf !== asOf)
        throw new Error('The loan basis does not match the selected account and date.');
      const currentObservation = series.status === 'fulfilled'
        ? series.value.points.find((point) => point.date === asOf) : undefined;
      const usableSeries = series.status === 'fulfilled' && series.value.accountId === loan.id &&
        !series.value.unavailableCurrencies?.length && currentObservation !== undefined &&
        Math.max(0, -currentObservation.balanceCents) === plan.value.balanceCents;
      const basis: Basis = {
        plan: plan.value,
        history: usableSeries && series.status === 'fulfilled'
          ? series.value.points.filter((point) => monthEnds.includes(point.date)).sort((a, b) => a.date.localeCompare(b.date)) : [],
        missingHistory: !usableSeries,
        expectedHistory: monthEnds.length,
      };
      return {
        basis,
        historyError: series.status === 'rejected' ? series.reason as unknown : null,
        historyMismatch: series.status === 'fulfilled' && !usableSeries,
      };
    },
  });
  const readyPair = pair.isSuccess && !pair.isFetching ? pair.data : null;
  const incoming = readyPair?.basis ?? null;
  const [capture, setCapture] = useState<{ basis: Basis; version: number } | null>(null);
  if (!capture && incoming) setCapture({ basis: incoming, version: 0 });
  const changed = Boolean(capture && incoming && basisKey(capture.basis) !== basisKey(incoming));
  const reload = () => void pair.refetch();
  return (
    <section className="vcomp debt-full debt-live" aria-labelledby="debt-live-title">
      <div className="head">
        <h2 id="debt-live-title">Kredit und Sondertilgung</h2>
        <span className="aside">Ungespeicherte Rechnung · keine Zahlung</span>
      </div>
      {choice}
      <Button variant="ghost" disabled={pair.isFetching} onClick={reload}>
        Kreditbasis und Verlauf neu laden
      </Button>
      {pair.isFetching && <LoadingNote what="Kreditbasis und Monatsverlauf" />}
      {pair.isError && <ErrorNote what="Kreditbasis und Monatsverlauf" error={pair.error} onRetry={reload} />}
      {readyPair?.historyError != null && <ErrorNote what="Kreditverlauf" error={readyPair.historyError} onRetry={reload} />}
      {readyPair?.historyMismatch && <div role="alert">
        <p>Der Kontoverlauf ist unvollständig oder passt nicht zur geladenen Kreditbasis. Er wird nicht mit dem Modell verbunden.</p>
        <Button variant="ghost" onClick={reload}>Basis und Verlauf erneut laden</Button>
      </div>}
      {changed && capture && incoming && (
        <div className="debt-live-refresh" role="status">
          <p>Kontostand, Verlauf oder Konditionen haben sich geändert. Die Rechnung unten behält ihre geladene Basis und deine Eingaben.</p>
          <Button variant="ghost" onClick={() => setCapture({ basis: incoming, version: capture.version + 1 })}>
            Neue Basis übernehmen und Eingaben zurücksetzen
          </Button>
        </div>
      )}
      {capture && (pair.isError || pair.isFetching || readyPair?.historyError != null) && (
        <p className="vnote">Darunter steht die zuletzt geladene Modellbasis. Laufende Eingaben bleiben erhalten.</p>
      )}
      {capture && <LiveLoan key={capture.version} basis={capture.basis} />}
    </section>
  );
}

type Outcome = { schedule: LoanSchedule; error: null } | { schedule: null; error: string };
const attempt = (terms: LoanTermsInput, measures: readonly LoanMeasure[] = []): Outcome => {
  try {
    return { schedule: simulateLoan(terms, measures), error: null };
  } catch (error) {
    if (error instanceof PaymentBelowInterestError) return { schedule: null, error: ERROR_TEXT.payment_below_interest };
    if (error instanceof RangeError) return { schedule: null, error: /Not repaid/.test(error.message) ? ERROR_TEXT.horizon : ERROR_TEXT.limit };
    throw error;
  }
};
const termsOf = (plan: LoanPlanView): LoanTermsInput | null => {
  const { rateBp, installmentCents, monthlyFeeCents } = plan.terms;
  if (plan.missing.length || rateBp === null || installmentCents === null || monthlyFeeCents === null) return null;
  return {
    balanceCents: plan.balanceCents,
    startMonth: plan.startMonth,
    rateBp,
    installmentCents,
    monthlyFeeCents,
    rateChanges: plan.rateChanges.map((change) => ({ month: change.validFrom.slice(0, 7), rateBp: change.rateBp })),
  };
};

function LiveLoan({ basis }: { basis: Basis }) {
  useAmountPrivacy();
  const { plan } = basis;
  const [monthly, setMonthly] = useState('0');
  const [oneOff, setOneOff] = useState('0');
  const [oneOffMonth, setOneOffMonth] = useState('');
  const terms = useMemo(() => termsOf(plan), [plan]);
  const baseline = useMemo(() => terms ? attempt(terms) : null, [terms]);
  const draft = useMemo((): { measures: LoanMeasure[]; error: string | null } => {
    const recurring = parseAmount(monthly), once = parseAmount(oneOff);
    if (!recurring.ok || recurring.cents < 0 || !once.ok || once.cents < 0)
      return { measures: [], error: 'Bitte beide Sondertilgungen ausdrücklich als gültigen Betrag ab 0 eingeben.' };
    const raw: LoanMeasure[] = [];
    if (recurring.cents > 0) raw.push({ kind: 'recurring', fromMonth: plan.startMonth, toMonth: null, everyMonths: 1, amountCents: recurring.cents });
    if (once.cents > 0) {
      if (!loanMonthSchema.safeParse(oneOffMonth).success || oneOffMonth < plan.startMonth)
        return { measures: [], error: 'Für die Einmalzahlung bitte einen gültigen Monat ab Modellbeginn auswählen.' };
      raw.push({ kind: 'one_off', month: oneOffMonth, amountCents: once.cents });
    }
    const parsed = loanMeasureSchema.array().safeParse(raw);
    return parsed.success ? { measures: parsed.data, error: null }
      : { measures: [], error: 'Die Sondertilgung überschreitet den zulässigen Modellbetrag.' };
  }, [monthly, oneOff, oneOffMonth, plan.startMonth]);
  const scenario = useMemo(() => terms && !draft.error && draft.measures.length ? attempt(terms, draft.measures) : null, [terms, draft]);
  const base = baseline?.schedule ?? null;
  const extra = scenario?.schedule ?? null;
  const chosen = extra ?? base;
  const money = (value: number) => nativeCurrency(value, plan.currency);
  const payoff = (value: string | null) => value ? monthLabel(value) : 'bereits getilgt';
  const monthsEarlier = base && extra ? base.months - extra.months : null;
  const interestSaved = base && extra ? base.totalInterestCents - extra.totalInterestCents : null;
  const noEffect = extra && draft.measures.some((m) => m.kind === 'one_off' && extra.payoffMonth && m.month > extra.payoffMonth);
  return (
    <>
      <p className="vnote">{maskMoneyText(plan.name)} · {plan.currency} · erfasste Modellbasis {longDay(plan.asOf)}. Erste Modellzahlung: {monthLabel(plan.startMonth)}.</p>
      <fieldset className="debt-live-inputs" disabled={!terms || plan.balanceCents === 0}>
        <legend className="sr-only">Lokale Sondertilgung des ausgewählten Kredits</legend>
        <MoneyInput label="Sondertilgung / Monat" value={monthly} onChange={setMonthly} currency={plan.currency} hint="Ab Modellbeginn jeden Monat zusätzlich; 0 lässt die Monatsrate unverändert." />
        <MoneyInput label="Einmalige Sondertilgung" value={oneOff} onChange={setOneOff} currency={plan.currency} hint="0 bedeutet keine Einmalzahlung." />
        <Field label="Monat der Einmalzahlung" hint="Nur bei einem positiven Einmalbetrag; kein Monat wird angenommen.">
          {({ id, describedBy }) => <TextInput id={id} type="month" min={plan.startMonth} value={oneOffMonth} onChange={(event) => setOneOffMonth(event.target.value)} aria-describedby={describedBy} />}
        </Field>
      </fieldset>
      <p className="vnote">Die Felder ändern nur diese lokale Rechnung. Es wird nichts gespeichert, gebucht oder als Zahlung eingerichtet.</p>
      {plan.balanceCents === 0 && <p role="status">Dieser Kredit hat zum geladenen Stichtag keine offene Restschuld.</p>}
      {!terms && <p role="status">Konditionen fehlen: {plan.missing.map((key) => ({ rate: 'Jahreszins', installment: 'Monatsrate', fee: 'monatliche Gebühr' })[key]).join(', ')}. <AppLink to="/einstellungen/konten">Konditionen pflegen</AppLink></p>}
      {draft.error && <p role="alert" className="field-error">{draft.error} Die Basisrechnung bleibt davon getrennt.</p>}
      {baseline?.error && <p role="status">Basis ohne Sondertilgung: {baseline.error}</p>}
      {scenario?.error && <p role="alert">Szenario nicht berechenbar: {scenario.error}</p>}
      {monthsEarlier !== null && interestSaved !== null ? (
        <div className="debt-live-result" aria-live="polite">
          <h3>{monthsEarlier > 0 ? `${monthsEarlier} ${monthsEarlier === 1 ? 'Monat' : 'Monate'} früher schuldenfrei` : monthsEarlier < 0 ? `${-monthsEarlier} Monate später schuldenfrei` : 'Zum gleichen Zeitpunkt schuldenfrei'}</h3>
          <p><strong>{money(interestSaved)}</strong> Zinsen gespart gegenüber derselben Basis.</p>
        </div>
      ) : (
        <p className="vnote" aria-live="polite">{!terms ? 'Ohne vollständige Konditionen gibt es kein Tilgungsmodell.' : draft.error || scenario?.error ? 'Kein gültiger Szenariovergleich für die aktuellen Eingaben.' : extra ? 'Das Szenario ist berechenbar; ohne gültige Basis ist kein Zins- oder Laufzeitvergleich möglich.' : 'Ohne zusätzliche Sondertilgung zeigt die Rechnung die gespeicherte Basis.'}</p>
      )}
      {noEffect && <p className="vnote">Der gewählte Einmalmonat liegt nach der Modelltilgung. Diese Einmalzahlung wird im Modell nicht mehr ausgeführt.</p>}
      <DebtChart basis={plan} history={basis.history} baseline={base} scenario={extra} />
      {(basis.missingHistory || basis.history.length < basis.expectedHistory) && <p className="vnote">{basis.missingHistory ? 'Der erfasste Monatsverlauf fehlt in dieser Modellbasis.' : `Nur ${basis.history.length} von ${basis.expectedHistory} möglichen Monatsenden sind verfügbar.`} Fehlende Beobachtungen werden nicht ersetzt oder interpoliert.</p>}
      <p className="vnote">Durchgezogen: tatsächliche Monatsenden und separat der Kontostand zum Stichtag. Gestrichelt: Modellzahlungen zum Monatsende, in {plan.currency}; negative Ist-Restschuld bedeutet Guthaben.</p>
      {(base || extra) && (
        <ScrollRegion className="debt-live-scroll" label="Vergleich der Kreditmodelle">
        <table className="vtable debt-live-summary">
          <caption>Tilgungsplan für {maskMoneyText(plan.name)} · {plan.currency}</caption>
          <thead><tr><th scope="col">Modell</th><th scope="col">Schuldenfrei</th><th scope="col">Zinsen gesamt</th><th scope="col">Gebühren gesamt</th></tr></thead>
          <tbody>{([['Ohne Sondertilgung', base], ['Live-Szenario', extra]] as const).map(([label, schedule]) => {
            return schedule && <tr key={label}><th scope="row">{label}</th><td>{payoff(schedule.payoffMonth)}</td><td>{money(schedule.totalInterestCents)}</td><td>{money(schedule.totalFeeCents)}</td></tr>;
          })}</tbody>
        </table>
        </ScrollRegion>
      )}
      {chosen && <ScheduleTables schedule={chosen} currency={plan.currency} scenario={Boolean(extra)} />}
      <details className="debt-live-method">
        <summary>Modellbasis und Finanzierbarkeit</summary>
        <p className="vnote">Erfasste Restschuld {money(plan.balanceCents)}; Monatsrate {plan.terms.installmentCents === null ? 'unbekannt' : money(plan.terms.installmentCents)}; Jahreszins {plan.terms.rateBp === null ? 'unbekannt' : rateText(plan.terms.rateBp)}; Gebühr {plan.terms.monthlyFeeCents === null ? 'unbekannt' : money(plan.terms.monthlyFeeCents)}.</p>
        <p className="vnote">Gespeicherte Zinsänderungen gelten wie im bestehenden Tilgungsplan ab ihrem Monat. Monatszinsen werden dort auf Cent gerundet; die Schlusszahlung wird begrenzt. Keine taggenaue Verzinsung oder Vorfälligkeitskosten. Kein Modell ersetzt fehlende Konditionen durch 0.</p>
        {plan.rateChanges.length > 0 && <ul>{plan.rateChanges.map((change) => <li key={change.id}>{longDay(change.validFrom)}: {rateText(change.rateBp)}</li>)}</ul>}
        <DebtLiquidityCheck />
      </details>
    </>
  );
}

function ScheduleTables({ schedule, currency, scenario }: { schedule: LoanSchedule; currency: string; scenario: boolean }) {
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const money = (value: number) => nativeCurrency(value, currency);
  return (
    <>
      <h3>Zins und Tilgung je Jahr · {scenario ? 'Live-Szenario' : 'Basis'}</h3>
      <ScrollRegion className="debt-live-scroll" label="Zins und Tilgung je Jahr">
        <table className="vtable">
          <caption>Modellzahlungen in {currency}, keine eingerichteten Zahlungen</caption>
          <thead><tr>{['Jahr', 'Zinsen', 'Gebühren', 'Tilgung', 'Zahlungen'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{schedule.perYear.map((row) => <tr key={row.year}><th scope="row">{row.year}</th>{(['interestCents', 'feeCents', 'principalCents', 'paymentCents'] as const).map((key) => <td key={key}>{money(row[key])}</td>)}</tr>)}</tbody>
        </table>
      </ScrollRegion>
      <details className="debt-live-method" onToggle={(event) => setMonthlyOpen(event.currentTarget.open)}>
        <summary>Jede Modellzahlung monatlich ansehen</summary>
        {monthlyOpen && <ScrollRegion className="debt-live-scroll" label="Jede monatliche Modellzahlung"><table className="vtable">
          <caption>Monatliche Modellzahlungen · {scenario ? 'Live-Szenario' : 'Basis'} · {currency}</caption>
          <thead><tr>{['Monat', 'Zins', 'Gebühr', 'Regulär', 'Zusätzlich', 'Zahlung', 'Restschuld'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{schedule.rows.map((row) => <tr key={row.month}><th scope="row">{monthLabel(row.month)}</th>{(['interestCents', 'feeCents', 'regularCents', 'extraCents', 'paymentCents', 'closingCents'] as const).map((key) => <td key={key}>{money(row[key])}</td>)}</tr>)}</tbody>
        </table></ScrollRegion>}
      </details>
    </>
  );
}
