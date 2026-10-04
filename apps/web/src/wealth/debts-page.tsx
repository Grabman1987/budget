import { useAmountPrivacy, Button, DimensionChain, maskMoneyText } from '@budget/ui';
import { addDays, cents, formatDecimal, parseAmount } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useId, useState, type ReactNode, type FormEvent } from 'react';
import { ApiError } from '../api/http';
import { fetchSeries } from '../ledger/api';
import { eur, eurParts, longDay, monthName, nativeCurrency } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { VERMOEGEN_SCHULDEN_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import {
  debtsQuery,
  projectDebt,
  type DebtAccount,
  type DebtProjection,
  type DebtsView,
} from './debts-api';
import { DebtChart } from './debts-chart';
import './debts.css';

const modelMonthText = (month: string | null) =>
  month ? `${monthName(month)} ${month.slice(0, 4)}` : 'bereits getilgt';
export function DebtsPage() {
  useAmountPrivacy();
  const query = useQuery(debtsQuery());
  const search = useSearch({ strict: false }) as { kredit?: string };
  const navigate = useNavigate();
  const view = query.data;
  const loans = view?.accounts.filter((a) => a.type === 'loan' && a.balanceCents < 0) ?? [];
  const loan = search.kredit ? loans.find((a) => a.id === search.kredit) : loans[0];
  const [busy, setBusy] = useState(false);
  const choice = (
    <label className="debt-choice">
      Kredit für das Modell
      <select
        disabled={busy}
        value={loan?.id ?? ''}
        onChange={(e) =>
          void navigate({
            to: '/vermoegen/schulden',
            search: ((prev: Record<string, unknown>) => ({
              ...prev,
              kredit: e.target.value,
            })) as never,
          })
        }
      >
        {!loan && <option value="">Kredit auswählen</option>}
        {loans.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <PageFrame meta={VERMOEGEN_SCHULDEN_META}>
      <div className="kview vview debts-view">
        {query.isPending && <LoadingNote what="Schulden" />}
        {query.isError && (
          <ErrorNote what="Schulden" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {view && (
          <>
            <DebtLead view={view} />
            {loan ? (
              <Scenario
                key={`${loan.id}:${loan.balanceCents}:${view.asOf}:${loan.interestRateBp}:${loan.monthlyFeeCents}:${loan.installmentCents}`}
                loan={loan}
                asOf={view.asOf}
                onBusy={setBusy}
                choice={choice}
              />
            ) : (
              <section className="vcomp" aria-labelledby="scenario-title">
                <div className="tbd-head">
                  <h2 id="scenario-title">Sondertilgung</h2>
                </div>
                {loans.length ? (
                  choice
                ) : (
                  <EmptyNote>
                    Kein Kredit mit offener Restschuld. Karten und andere Verbindlichkeiten stehen
                    in der Kontoliste.
                  </EmptyNote>
                )}
                {search.kredit && (
                  <p className="vnote">
                    Der ausgewählte Kredit hat keine offene Restschuld oder ist nicht verfügbar.
                  </p>
                )}
              </section>
            )}
            <section className="debt-accounts" aria-labelledby="debt-accounts-title">
              <div className="head">
                <h2 id="debt-accounts-title">Schulden nach Konto</h2>
                <span className="aside">Stichtag {longDay(view.asOf)}</span>
              </div>
              {view.accounts.length === 0 ? (
                <EmptyNote>Keine negativen Kontowerte zum Stichtag.</EmptyNote>
              ) : (
                <table className="ktable vtable debt-table">
                  <caption className="sr-only">
                    Negative Kontowerte mit tatsächlichem Kontosaldo
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="tech">
                        Konto
                      </th>
                      <th scope="col" className="tech num">
                        Kontosaldo
                      </th>
                      <th scope="col" className="tech num">
                        Restschuld EUR
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.accounts.map((a) => (
                      <tr key={a.id}>
                        <th scope="row">
                          <AppLink to={`/konten/${encodeURIComponent(a.id)}`}>{a.name}</AppLink>
                          <small>
                            {a.type === 'loan'
                              ? 'Kredit'
                              : a.type === 'credit_card'
                                ? 'Kreditkarte'
                                : 'Negativer Kontowert'}
                          </small>
                        </th>
                        <td className="num" data-label="Kontosaldo">
                          {nativeCurrency(a.balanceCents, a.currency)}
                        </td>
                        <td className="num" data-label="Restschuld EUR">
                          {a.owedEurCents === null ? '—' : eur(a.owedEurCents)}
                          {a.owedEurCents === null && <small>{unavailable(a)}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="vnote">
                Kontosalden enthalten erfasste Buchungen bis zum Stichtag. Eine vollständige
                monatliche Kartenrückzahlung wird nicht vorausgesetzt.
              </p>
            </section>
          </>
        )}
      </div>
    </PageFrame>
  );
}
const unavailable = (a: DebtAccount) =>
  a.unavailableReason === 'calculation_limit'
    ? 'Bewertung überschreitet die sichere Rechengrenze'
    : a.missingPriceSecurityIds.length
      ? 'Kurs für Kontowert fehlt'
      : `Wechselkurs fehlt: ${a.missingFxCurrencies.join(', ')}`;
function DebtLead({ view }: { view: DebtsView }) {
  useAmountPrivacy();
  const parts = view.totalEurCents === null ? null : eurParts(view.totalEurCents);
  return (
    <section className="vnw" aria-labelledby="debts-title">
      <div className="tbd-head">
        <h2 id="debts-title">Schulden</h2>
        <span className="tbd-state">{longDay(view.asOf)}</span>
      </div>
      <div className="tbd-fig" data-testid="debt-total">
        {parts ? (
          <>
            {parts.whole}
            <span className="cents">,{parts.fraction} €</span>
          </>
        ) : (
          '—'
        )}
      </div>
      {view.totalEurCents !== null ? (
        <DimensionChain
          label="Maßkette Restschuld"
          precision="cent"
          terms={[
            ...view.accounts.map((a, i) => ({
              label: a.name,
              value: cents(a.owedEurCents!),
              ...(i ? { op: '+' as const } : {}),
            })),
            {
              op: '=' as const,
              label: 'Restschuld',
              value: cents(view.totalEurCents),
              result: true,
            },
          ]}
        />
      ) : (
        <div className="chain-inline" role="group" aria-label="Maßkette Restschuld unbekannt">
          {view.accounts.map((a) => (
            <span className="chain-term" key={a.id}>
              <span className="ct-label tech">{a.name}</span>
              <span className="ct-val">
                {a.owedEurCents === null ? 'unbekannt' : eur(a.owedEurCents)}
              </span>
            </span>
          ))}
        </div>
      )}
      <p className="vnote">
        {view.totalEurCents === null
          ? `Gesamtschuld unbekannt. ${view.unavailableReason === 'calculation_limit' ? 'Sichere Rechengrenze überschritten. ' : ''}${view.accounts
              .filter((a) => a.owedEurCents === null)
              .map((a) => `${a.name}: ${unavailable(a)}`)
              .join(' · ')}`
          : 'Negative Kontowerte aus derselben aktuellen Bewertung wie in der Kontenübersicht.'}
      </p>
    </section>
  );
}

function Amount({
  label,
  currency,
  value,
  onChange,
}: {
  label: string;
  currency: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const hidden = useAmountPrivacy();
  const id = useId();
  return (
    <div className="field-row debt-amount">
      <label htmlFor={id}>
        {label} ({currency})
      </label>
      <input
        type={hidden ? 'password' : 'text'}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const parsed = parseAmount(value);
            if (parsed.ok) onChange(formatDecimal(parsed.cents));
          }
        }}
        aria-describedby={`${id}-hint`}
      />
      <span id={`${id}-hint`} className="amount-hint">
        Rechnen erlaubt, z. B. 300+50. Enter rechnet aus.
      </span>
    </div>
  );
}

function Scenario({
  loan,
  asOf,
  onBusy,
  choice,
}: {
  loan: DebtAccount;
  asOf: string;
  onBusy: (busy: boolean) => void;
  choice: ReactNode;
}) {
  useAmountPrivacy();
  const [payment, setPayment] = useState(
    loan.installmentCents === null ? '' : formatDecimal(cents(loan.installmentCents)),
  );
  const [extra, setExtra] = useState('0');
  const [rate, setRate] = useState(
    loan.interestRateBp === null ? '' : formatDecimal(cents(loan.interestRateBp)),
  );
  const [fee, setFee] = useState(
    loan.monthlyFeeCents === null ? '' : formatDecimal(cents(loan.monthlyFeeCents)),
  );
  const [start, setStart] = useState(asOf.slice(0, 7));
  const [result, setResult] = useState<DebtProjection | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const series = useQuery({
    queryKey: ['ledger', 'debt-series', loan.id, asOf],
    retry: false,
    queryFn: () =>
      fetchSeries(
        loan.id,
        loan.openingDate > addDays(asOf, -365) ? loan.openingDate : addDays(asOf, -365),
        asOf,
      ),
  });
  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setResult(null);
    setError('');
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amounts = [payment, extra, rate, fee].map(parseAmount);
    if (amounts.some((a) => !a.ok || a.cents < 0)) {
      setError('Bitte Rate, Sondertilgung, Zins und Gebühr ausdrücklich ab 0 eingeben.');
      return;
    }
    const [paymentCents, extraCents, rateBp, monthlyFeeCents] = amounts.map((a) =>
      a.ok ? a.cents : 0,
    );
    setPending(true);
    onBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await projectDebt(loan.id, {
          asOf,
          startMonth: start,
          paymentCents: paymentCents!,
          extraCents: extraCents!,
          rateBp: rateBp!,
          monthlyFeeCents: monthlyFeeCents!,
        }),
      );
    } catch (error) {
      setError(
        error instanceof ApiError && error.detail
          ? error.detail
          : 'Die Modellrechnung ist nicht verfügbar. Bitte erneut versuchen.',
      );
    } finally {
      setPending(false);
      onBusy(false);
    }
  };
  return (
    <>
      <section className="vcomp debt-assumptions" aria-labelledby="assumptions-title">
        <div className="head">
          <h2 id="assumptions-title">Sondertilgung</h2>
          <span className="aside">
            Restschuld {nativeCurrency(-loan.balanceCents, loan.currency)}
          </span>
        </div>
        {choice}
        <LoanTerms loan={loan} />
        <p className="vnote">
          Ungespeichertes Modell. Keine Vertragsänderung oder Zahlung; Annahmen werden beim Neuladen
          verworfen.
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={pending}>
            <legend className="sr-only">Ungespeicherte Modellannahmen</legend>
            <div className="debt-inputs">
              <Amount
                label="Monatsrate"
                currency={loan.currency}
                value={payment}
                onChange={change(setPayment)}
              />
              <Amount
                label="Sondertilgung pro Monat"
                currency={loan.currency}
                value={extra}
                onChange={change(setExtra)}
              />
              <Amount
                label="Monatliche Gebühr"
                currency={loan.currency}
                value={fee}
                onChange={change(setFee)}
              />
              <label className="field-row">
                Nominaler Jahreszins (%)
                <input
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => change(setRate)(e.target.value)}
                />
              </label>
              <label className="field-row">
                Erster Modellmonat
                <input
                  type="month"
                  min={asOf.slice(0, 7)}
                  max="9899-12"
                  required
                  value={start}
                  onChange={(e) => change(setStart)(e.target.value)}
                />
              </label>
            </div>
            <Button variant="primary" type="submit">
              {pending ? 'Wird berechnet …' : 'Modell berechnen'}
            </Button>
          </fieldset>
          {error && (
            <p role="alert" className="field-error">
              {maskMoneyText(error)}
            </p>
          )}
        </form>
        <p className="vnote">
          Konstante Monatsrate und Konditionen: Zinsen = Jahreszins ÷ 12, je Monat auf Cent
          gerundet; danach Gebühr und Tilgung. Keine taggenaue Verzinsung, Zinsänderung oder
          Vorfälligkeitskosten. Maximal 1.200 Monate.
        </p>
        <p className="vnote">
          Der erfasste Kontosaldo zum {longDay(asOf)} ist der Startwert; der gewählte Monat ist die
          erste Modellzahlung. Fehlende Konditionen bitte ausdrücklich eingeben, auch 0. Keine
          Buchung wird erzeugt.
        </p>
        {result && <Comparison result={result} />}
      </section>
      {series.isPending && (
        <div className="debt-full">
          <LoadingNote what="Kontoverlauf" />
        </div>
      )}
      {series.isError && (
        <div className="debt-full">
          <ErrorNote
            what="Kontoverlauf"
            error={series.error}
            onRetry={() => void series.refetch()}
          />
        </div>
      )}
      <section className="debt-full" aria-labelledby="debt-course-title">
        <div className="head">
          <h2 id="debt-course-title">Restschuld</h2>
          <span className="aside">
            {loan.name} · {loan.currency}
          </span>
        </div>
        <DebtChart loan={loan} asOf={asOf} history={series.data?.points ?? []} result={result} />
        <div className="legend">
          <span>
            <svg viewBox="0 0 26 8">
              <path className="l-actual" d="M0 4h26" />
            </svg>
            erfasster Kontosaldo
          </span>
          <span>
            <svg viewBox="0 0 26 8">
              <path className="l-plan" d="M0 4h26" />
            </svg>
            Modell ohne Sondertilgung
          </span>
          <span>
            <svg viewBox="0 0 26 8">
              <path className="l-forecast" d="M0 4h26" />
            </svg>
            Modell mit Sondertilgung
          </span>
        </div>
        {!result && (
          <p className="vnote">
            Modellpfade erscheinen nach der Berechnung. Vergangenheit stammt ausschließlich aus dem
            Konto.
          </p>
        )}
      </section>
      {result && <Results result={result} />}
    </>
  );
}
/** The loan terms stored in Einstellungen › Konten; they pre-fill the model below. */
function LoanTerms({ loan }: { loan: DebtAccount }) {
  useAmountPrivacy();
  const parts = [
    loan.interestRateBp !== null
      ? `Zins ${formatDecimal(cents(loan.interestRateBp))} %${
          loan.interestKind ? (loan.interestKind === 'fixed' ? ' fix' : ' variabel') : ''
        }`
      : loan.interestKind
        ? loan.interestKind === 'fixed'
          ? 'Zins fix'
          : 'Zins variabel'
        : null,
    loan.installmentCents !== null
      ? `Monatsrate ${nativeCurrency(loan.installmentCents, loan.currency)}`
      : null,
    loan.monthlyFeeCents !== null
      ? `Gebühr ${nativeCurrency(loan.monthlyFeeCents, loan.currency)} im Monat`
      : null,
    loan.termStart || loan.termEnd
      ? `Laufzeit ${loan.termStart ? `ab ${longDay(loan.termStart)}` : ''}${
          loan.termStart && loan.termEnd ? ' ' : ''
        }${loan.termEnd ? `bis ${longDay(loan.termEnd)}` : ''}`
      : null,
    loan.originalAmountCents !== null
      ? `ursprünglich ${nativeCurrency(loan.originalAmountCents, loan.currency)}`
      : null,
  ].filter((part): part is string => part !== null);
  return (
    <p className="vnote" data-testid="loan-terms">
      {parts.length > 0 ? (
        <>Konditionen aus Einstellungen › Konten: {parts.join(' · ')}. </>
      ) : (
        <>Für diesen Kredit sind keine Konditionen hinterlegt. </>
      )}
      <AppLink to="/einstellungen/konten">Konditionen pflegen</AppLink>
    </p>
  );
}

function Results({ result }: { result: DebtProjection }) {
  useAmountPrivacy();
  const { withExtra } = result.plan;
  const money = (v: number) => nativeCurrency(v, result.currency);
  return (
    <>
      <section className="debt-full" aria-labelledby="debt-years-title">
        <div className="head">
          <h2 id="debt-years-title">Zins und Tilgung je Jahr</h2>
          <span className="aside">Modell mit Sondertilgung</span>
        </div>
        <table className="ktable vtable debt-years">
          <caption className="sr-only">
            Modellzahlungen je Kalenderjahr in {result.currency}
          </caption>
          <thead>
            <tr>
              {['Jahr', 'Zinsen', 'Gebühren', 'Tilgung', 'Zahlungen'].map((s) => (
                <th scope="col" className="tech" key={s}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withExtra.perYear.map((y) => (
              <tr key={y.year}>
                <th scope="row">{y.year}</th>
                {(['interestCents', 'feeCents', 'principalCents', 'paymentCents'] as const).map(
                  (k, i) => (
                    <td
                      className="num"
                      data-label={['Zinsen', 'Gebühren', 'Tilgung', 'Zahlungen'][i]}
                      key={k}
                    >
                      {money(y[k])}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Comparison({ result }: { result: DebtProjection }) {
  useAmountPrivacy();
  const { base, withExtra } = result.plan;
  const money = (v: number) => nativeCurrency(v, result.currency);
  return (
    <section className="debt-comparison" aria-labelledby="comparison-title" aria-live="polite">
      <div className="head">
        <h2 id="comparison-title">Modellvergleich</h2>
        <span className="aside">Ungespeichert · {result.currency}</span>
      </div>
      <table className="ktable vtable">
        <caption className="sr-only">Ohne und mit monatlicher Sondertilgung</caption>
        <thead>
          <tr>
            <th scope="col">Modell</th>
            <th scope="col">Ohne Sondertilgung</th>
            <th scope="col">Mit {money(result.extraCents)} / Monat</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Schuldenfrei</th>
            <td>{modelMonthText(base.payoffMonth)}</td>
            <td>{modelMonthText(withExtra.payoffMonth)}</td>
          </tr>
          <tr>
            <th scope="row">Zinsen gesamt</th>
            <td>{money(base.totalInterestCents)}</td>
            <td>{money(withExtra.totalInterestCents)}</td>
          </tr>
          <tr>
            <th scope="row">Gebühren gesamt</th>
            <td>{money(base.totalFeeCents)}</td>
            <td>{money(withExtra.totalFeeCents)}</td>
          </tr>
        </tbody>
      </table>
      <div className="kv vsave">
        <span>{result.plan.monthsEarlier} Monate früher frei</span>
        <strong>{money(result.plan.interestSavedCents)} Zinsen gespart</strong>
      </div>
    </section>
  );
}
