import { cents, debtOverview, formatDecimal, lastDayOfMonth, parseAmount } from '@budget/domain';
import { TextInput, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { longDay, nativeCurrency } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import type { DebtAccount, DebtsView } from './debts-api';
import { strategyCandidatesQuery } from './loan-planning-api';

const text = (v: number | null) => (v === null ? '' : formatDecimal(cents(v)));
const amount = (v: string) => {
  const parsed = parseAmount(v);
  return parsed.ok && parsed.cents >= 0 ? parsed.cents : null;
};

export function DebtOverview({ view }: { view: DebtsView }) {
  const query = useQuery(strategyCandidatesQuery(view.asOf));
  if (query.isPending) return <LoadingNote what="Tilgungsübersicht" />;
  if (query.isError)
    return (
      <ErrorNote
        what="Tilgungsübersicht"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const accounts = view.accounts.map((a) => ({
    ...a,
    interestRateBp: query.data.debts.find((d) => d.accountId === a.id)?.rateBp ?? a.interestRateBp,
  }));
  return <Overview key={JSON.stringify(accounts)} accounts={accounts} asOf={view.asOf} />;
}

function Overview({ accounts, asOf }: { accounts: DebtAccount[]; asOf: string }) {
  useAmountPrivacy();
  const [terms, setTerms] = useState(() =>
    accounts.map((a) => ({
      rate: text(a.interestRateBp),
      payment: text(a.installmentCents),
      fee: text(a.monthlyFeeCents),
    })),
  );
  const [selected, setSelected] = useState(
    accounts.find((a) => a.type === 'loan')?.id ?? accounts[0]?.id ?? '',
  );
  const [extra, setExtra] = useState('0');
  const extraCents = amount(extra);
  const overview = debtOverview(
    accounts.map((a, i) => ({
      ...a,
      interestRateBp: amount(terms[i]!.rate),
      installmentCents: amount(terms[i]!.payment),
      monthlyFeeCents: amount(terms[i]!.fee),
    })),
    asOf.slice(0, 7),
    selected,
    extraCents ?? 0,
  );
  const money = (v: number | null) =>
    v === null || overview.currency === null ? '—' : nativeCurrency(v, overview.currency);
  const valid = extraCents !== null;
  const selectedAccount = accounts.find((a) => a.id === selected);
  const selectedPlan = overview.rows.find((r) => r.id === selected)?.plan;
  const adjust = (i: number, key: keyof (typeof terms)[number], value: string) =>
    setTerms((old) => old.map((t, index) => (index === i ? { ...t, [key]: value } : t)));
  return (
    <section className="debt-overview debt-full" aria-labelledby="payoff-title">
      <div className="debt-result" aria-live="polite">
        <h2 id="payoff-title">
          {accounts.length === 0
            ? 'Schuldenfrei'
            : overview.payoffDate && valid
              ? `Schuldenfrei am ${longDay(overview.payoffDate)}`
              : 'Schuldenfrei am …'}
        </h2>
        <p className="debt-result-interest">
          Noch zu zahlende Zinsen <strong>{valid ? money(overview.interestCents) : '—'}</strong>
        </p>
        {accounts.length > 0 && !overview.payoffDate && (
          <p className="vnote">
            Datum noch offen. Bitte fehlende oder ungültige Konditionen unten anpassen.
          </p>
        )}
        {overview.currency === null && accounts.length > 0 && (
          <p className="vnote">
            Zinsen und Fortschritt werden nicht über verschiedene Währungen summiert.
          </p>
        )}
        {overview.progress ? (
          <div className="debt-progress">
            <progress
              aria-label="Tilgungsfortschritt"
              max={overview.progress.originalCents}
              value={overview.progress.paidCents}
            />
            <div>
              <span>Getilgt {money(overview.progress.paidCents)}</span>
              <span>Restschuld {money(overview.progress.remainingCents)}</span>
            </div>
          </div>
        ) : (
          accounts.length > 0 && (
            <p className="vnote">
              Fortschritt unbekannt: ursprüngliche Kreditbeträge fehlen oder passen nicht zur
              Restschuld. <AppLink to="/einstellungen/konten">Konditionen pflegen</AppLink>
            </p>
          )
        )}
        <p className="vnote">
          Modell ab {longDay(asOf)} · Datum = Monatsende der letzten Modellzahlung.
        </p>
      </div>
      {accounts.length > 0 && (
        <>
          <div className="debt-quick-scenario">
            <label>
              Zusätzliche Tilgung für
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              + Sondertilgung/Monat ({accounts.find((a) => a.id === selected)?.currency})
              <TextInput
                money
                inputMode="decimal"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </label>
            <p aria-live="polite">
              {valid ? (
                <strong>
                  {selectedPlan && selectedAccount
                    ? nativeCurrency(selectedPlan.interestSavedCents, selectedAccount.currency)
                    : '—'}{' '}
                  Zinsen gespart
                </strong>
              ) : (
                <span role="alert" className="field-error">
                  Bitte einen Betrag ab 0 eingeben.
                </span>
              )}
            </p>
          </div>
          <table className="ktable vtable debt-table">
            <caption className="sr-only">Tilgung je Kredit und Kreditkarte</caption>
            <thead>
              <tr>
                {[
                  'Konto',
                  'Restschuld',
                  'Monatsrate',
                  'Zins',
                  'Schuldenfrei am',
                  'Noch Zinsen',
                ].map((s) => (
                  <th scope="col" className="tech" key={s}>
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a, i) => {
                const row = overview.rows[i]!;
                const plan = valid ? row.plan?.withExtra : null;
                return (
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
                    <td data-label="Restschuld">{nativeCurrency(-a.balanceCents, a.currency)}</td>
                    <td data-label="Monatsrate">
                      {amount(terms[i]!.payment) === null
                        ? '—'
                        : nativeCurrency(amount(terms[i]!.payment)!, a.currency)}
                    </td>
                    <td data-label="Zins">
                      {amount(terms[i]!.rate) === null ? '—' : `${text(amount(terms[i]!.rate))} %`}
                    </td>
                    <td data-label="Schuldenfrei am">
                      {plan?.payoffMonth ? longDay(lastDayOfMonth(plan.payoffMonth)) : '—'}
                      {!row.plan && (
                        <small>
                          {row.status === 'missing_terms'
                            ? 'Konditionen fehlen'
                            : 'Rate muss Zinsen und Gebühren decken; Rechengrenzen prüfen'}
                        </small>
                      )}
                    </td>
                    <td data-label="Noch Zinsen">
                      {plan ? nativeCurrency(plan.totalInterestCents, a.currency) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <details className="debt-adjustments">
            <summary>Konditionen anpassen</summary>
            <p className="vnote">
              Aus den Konten vorausgefüllt. Änderungen gelten nur für diese Vorschau; fehlende
              Gebühren bitte ausdrücklich eingeben, auch 0.
            </p>
            {accounts.map((a, i) => (
              <fieldset key={a.id}>
                <legend>{a.name}</legend>
                <div className="debt-inputs">
                  {(
                    [
                      ['payment', `Monatsrate (${a.currency})`],
                      ['rate', 'Nominaler Jahreszins (%)'],
                      ['fee', `Monatliche Gebühr (${a.currency})`],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <TextInput
                        money={key !== 'rate'}
                        aria-label={`${label} – ${a.name}`}
                        inputMode="decimal"
                        value={terms[i]![key]}
                        onChange={(e) => adjust(i, key, e.target.value)}
                        aria-invalid={amount(terms[i]![key]) === null}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
