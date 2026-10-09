import { cents, formatDecimal } from '@budget/domain';
import { Button, maskMoneyText, TextInput, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { errorText } from '../ledger/labels';
import { nativeCurrency } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import {
  compareStrategies,
  strategyCandidatesQuery,
  type DebtCandidate,
  type StrategyView,
} from './loan-planning-api';
import { ERROR_TEXT, MoneyInput, monthText, parseMoney } from './loan-planning';
import './loan-planning.css';

type Outcome = StrategyView['avalanche'];
const TYPE_LABEL: Record<string, string> = {
  loan: 'Kredit',
  credit_card: 'Kreditkarte',
  other_liability: 'Sonstige Verbindlichkeit',
};

/** Avalanche against snowball for the open debts; shown from two debts of one currency on. */
export function DebtStrategies({ asOf }: { asOf: string }) {
  useAmountPrivacy();
  const query = useQuery(strategyCandidatesQuery(asOf));
  if (query.isPending) return <LoadingNote what="Tilgungsstrategien" />;
  if (query.isError)
    return (
      <ErrorNote
        what="Tilgungsstrategien"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const groups = new Map<string, DebtCandidate[]>();
  for (const d of query.data.debts) groups.set(d.currency, [...(groups.get(d.currency) ?? []), d]);
  const usable = [...groups].filter(([, debts]) => debts.length >= 2);
  if (usable.length === 0) return null;
  return (
    <>
      {usable.map(([currency, debts]) => (
        <StrategyGroup
          key={`${currency}:${debts.map((d) => `${d.accountId}/${d.balanceCents}/${d.rateBp}/${d.minimumCents}/${d.monthlyFeeCents}`).join(',')}`}
          currency={currency}
          debts={debts}
          asOf={asOf}
          startMonth={query.data.startMonth}
          multiple={usable.length > 1}
        />
      ))}
    </>
  );
}

function CellInput({
  label,
  value,
  onChange,
  money = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  money?: boolean;
}) {
  return (
    <TextInput
      aria-label={label}
      money={money}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const text = (v: number | null) => (v === null ? '' : formatDecimal(cents(v)));

function StrategyGroup({
  currency,
  debts,
  asOf,
  startMonth,
  multiple,
}: {
  currency: string;
  debts: DebtCandidate[];
  asOf: string;
  startMonth: string;
  multiple: boolean;
}) {
  useAmountPrivacy();
  const [terms, setTerms] = useState(() =>
    Object.fromEntries(
      debts.map((d) => [
        d.accountId,
        { rate: text(d.rateBp), minimum: text(d.minimumCents), fee: text(d.monthlyFeeCents) },
      ]),
    ),
  );
  const [extra, setExtra] = useState('0');
  const [result, setResult] = useState<StrategyView | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const setTerm = (id: string, key: 'rate' | 'minimum' | 'fee', value: string) => {
    setTerms((all) => ({ ...all, [id]: { ...all[id]!, [key]: value } }));
    setResult(null);
    setError('');
  };
  const submit = async () => {
    const extraCents = parseMoney(extra, true);
    const rows = debts.map((d) => {
      const t = terms[d.accountId]!;
      return {
        accountId: d.accountId,
        rateBp: parseMoney(t.rate, true),
        minimumCents: parseMoney(t.minimum, true),
        monthlyFeeCents: parseMoney(t.fee, true),
      };
    });
    if (
      extraCents === null ||
      rows.some((r) => r.rateBp === null || r.minimumCents === null || r.monthlyFeeCents === null)
    ) {
      setError('Bitte Zins, Mindestrate, Gebühr und Zusatzbetrag ausdrücklich ab 0 eingeben.');
      return;
    }
    setPending(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await compareStrategies({
          asOf,
          startMonth,
          extraCents,
          debts: rows.map((r) => ({
            accountId: r.accountId,
            rateBp: r.rateBp!,
            minimumCents: r.minimumCents!,
            monthlyFeeCents: r.monthlyFeeCents!,
          })),
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  };
  const money = (v: number) => nativeCurrency(v, currency);
  const titleId = `strategy-title-${currency}`;
  return (
    <section className="debt-full debt-strategies" aria-labelledby={titleId}>
      <div className="head">
        <h2 id={titleId}>Tilgungsstrategie{multiple ? ` ${currency}` : ''}</h2>
        <span className="aside">{debts.length} Schulden · Entscheidungshilfe</span>
      </div>
      <p className="vnote">
        Kandidaten sind Konten mit negativer Kassa, auch Depots mit positivem Nettowert. Saldo und
        Startschuld beziehen sich auf die Kassa in {currency}; die Schuldensumme oben folgt
        negativen Netto-Kontowerten in EUR. Der Vergleich umfasst mindestens zwei Kandidaten
        derselben Währung.
      </p>
      <p className="vnote">
        Welche Schuld bekommt den Zusatzbetrag zuerst: die mit dem höchsten Zins (Avalanche) oder
        die mit dem kleinsten Saldo (Schneeball)? Monatsbudget = alle Mindestraten plus
        Zusatzbetrag; Mindestraten getilgter Schulden bleiben im Budget. Keine Zahlung, keine
        Zuweisung, keine Empfehlung.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={pending} className="strategy-fields">
          <legend className="sr-only">Annahmen je Schuld</legend>
          <table className="vtable loan-table strategy-input-table">
            <caption className="sr-only">Schulden mit Zins, Mindestrate und Gebühr</caption>
            <thead>
              <tr>
                {[
                  'Schuld',
                  'Saldo',
                  'Zins p. a. (%)',
                  `Mindestrate (${currency})`,
                  `Gebühr/Monat (${currency})`,
                ].map((h, i) => (
                  <th scope="col" className={i === 1 ? 'tech num' : 'tech'} key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debts.map((d) => {
                const t = terms[d.accountId]!;
                return (
                  <tr key={d.accountId}>
                    <th scope="row">
                      {d.name}
                      <small>{TYPE_LABEL[d.type] ?? 'Verbindlichkeit'}</small>
                    </th>
                    <td className="num" data-label="Saldo">
                      {money(d.balanceCents)}
                    </td>
                    <td data-label="Zins p. a. (%)">
                      <CellInput
                        label={`Zins von ${d.name} (%)`}
                        value={t.rate}
                        onChange={(v) => setTerm(d.accountId, 'rate', v)}
                      />
                    </td>
                    <td data-label={`Mindestrate (${currency})`}>
                      <CellInput
                        money
                        label={`Mindestrate von ${d.name} (${currency})`}
                        value={t.minimum}
                        onChange={(v) => setTerm(d.accountId, 'minimum', v)}
                      />
                    </td>
                    <td data-label={`Gebühr/Monat (${currency})`}>
                      <CellInput
                        money
                        label={`Gebühr von ${d.name} je Monat (${currency})`}
                        value={t.fee}
                        onChange={(v) => setTerm(d.accountId, 'fee', v)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="strategy-extra">
            <MoneyInput
              label="Zusatzbetrag pro Monat"
              currency={currency}
              value={extra}
              onChange={(v) => {
                setExtra(v);
                setResult(null);
                setError('');
              }}
              hint="Zusätzlich zu allen Mindestraten, ab dem ersten Modellmonat."
            />
          </div>
          <Button type="submit">{pending ? 'Wird berechnet …' : 'Strategien vergleichen'}</Button>
        </fieldset>
        {error && (
          <p role="alert" className="field-error">
            {maskMoneyText(error)}
          </p>
        )}
      </form>
      <p className="vnote">
        Fehlende Zinsen und Mindestraten bitte ausdrücklich eingeben, auch 0. Karten ohne Zins
        zahlen 0 % ein. Modell: Zins je Monat auf Cent gerundet, konstanter Zins aus den Konditionen
        (bei Krediten inklusive gespeicherter Zinsänderungen zum Modellstart), erste Zahlung im{' '}
        {monthText(startMonth)}.
      </p>
      {result && <StrategyResultTable result={result} money={money} />}
    </section>
  );
}

function outcomeText(o: Outcome): string {
  return o.status === 'error'
    ? `${ERROR_TEXT[o.code]}${o.names.length > 0 ? ` (${o.names.join(', ')})` : ''}`
    : '';
}

function StrategyResultTable({
  result,
  money,
}: {
  result: StrategyView;
  money: (v: number) => string;
}) {
  useAmountPrivacy();
  const minimum = result.minimumOnly.status === 'ok' ? result.minimumOnly : null;
  const rows: Array<{ key: string; label: string; note: string; o: Outcome }> = [
    {
      key: 'avalanche',
      label: 'Avalanche',
      note: 'höchster Zins zuerst',
      o: result.avalanche,
    },
    {
      key: 'snowball',
      label: 'Schneeball',
      note: 'kleinster Saldo zuerst',
      o: result.snowball,
    },
    { key: 'minimum', label: 'Nur Mindestraten', note: 'ohne Zusatzbetrag', o: result.minimumOnly },
  ];
  return (
    <div className="strategy-result" aria-live="polite">
      <table className="vtable loan-table strategy-table" data-testid="strategy-result">
        <caption className="sr-only">Tilgungsstrategien im Vergleich</caption>
        <thead>
          <tr>
            {[
              'Strategie',
              'Schuldenfrei',
              'Laufzeit',
              'Zinsen gesamt',
              'Zinsersparnis',
              'Reihenfolge',
            ].map((h, i) => (
              <th scope="col" className={i > 1 && i < 5 ? 'tech num' : 'tech'} key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, note, o }) => (
            <tr key={key} data-testid={`strategy-${key}`}>
              <th scope="row">
                {label}
                <small>{note}</small>
              </th>
              {o.status === 'error' ? (
                <td colSpan={5} className="loan-error">
                  {outcomeText(o)}
                </td>
              ) : (
                <>
                  <td data-label="Schuldenfrei">{monthText(o.endMonth)}</td>
                  <td className="num" data-label="Laufzeit">
                    {o.months} Monate
                  </td>
                  <td className="num" data-label="Zinsen gesamt">
                    {money(o.interestCents)}
                  </td>
                  <td className="num" data-label="Zinsersparnis">
                    {key === 'minimum' || !minimum
                      ? '—'
                      : money(minimum.interestCents - o.interestCents)}
                  </td>
                  <td data-label="Reihenfolge">
                    {[...o.loans]
                      .sort(
                        (a, b) =>
                          (a.paidOffMonth ?? '9').localeCompare(b.paidOffMonth ?? '9') ||
                          a.name.localeCompare(b.name),
                      )
                      .map((l) => l.name)
                      .join(' → ')}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="kv vsave">
        <span>
          Monatsbudget {money(result.monthlyBudgetCents)} · Startschuld{' '}
          {money(result.startingDebtCents)}
        </span>
        <strong>
          {result.interestAdvantageCents === null
            ? 'Vergleich nicht berechenbar'
            : result.interestAdvantageCents === 0
              ? 'Beide Strategien kosten gleich viel Zinsen'
              : result.interestAdvantageCents > 0
                ? `Avalanche spart ${money(result.interestAdvantageCents)} Zinsen gegenüber Schneeball`
                : `Schneeball spart ${money(-result.interestAdvantageCents)} Zinsen gegenüber Avalanche`}
        </strong>
      </div>
    </div>
  );
}
