import { useAmountPrivacy, DimensionChain, maskMoneyText } from '@budget/ui';
import { cents } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { eur, eurParts, longDay, nativeCurrency } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { VERMOEGEN_SCHULDEN_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import {
  debtsQuery,
  type DebtAccount,
  type DebtsView,
} from './debts-api';
import { DebtLiveScenario } from './debt-live-scenario';
import { DebtOverview } from './debt-overview';
import { DebtStrategies } from './debt-strategies';
import { LoanPlanning } from './loan-planning';
import { DebtHistory } from './debt-history';
import './debts.css';

export function DebtsPage() {
  useAmountPrivacy();
  const query = useQuery(debtsQuery());
  const search = useSearch({ strict: false }) as { kredit?: string };
  const navigate = useNavigate();
  const view = query.data;
  const loans = view?.accounts.filter((a) => a.type === 'loan' && a.balanceCents < 0) ?? [];
  const loan = search.kredit ? loans.find((a) => a.id === search.kredit) : loans[0];
  const choice = (
    <label className="debt-choice">
      Kredit für das Modell
      <select
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
            {maskMoneyText(a.name)}
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
              <DebtLiveScenario key={`${loan.id}:${view.asOf}`} loan={loan} asOf={view.asOf} choice={choice} />
            ) : (
              <section className="vcomp debt-full" aria-labelledby="scenario-title">
                <h2 id="scenario-title">Kreditmodell</h2>
                {loans.length ? choice : <EmptyNote>Kein Kredit mit offener Restschuld. Karten und andere Verbindlichkeiten stehen in der Kontoliste.</EmptyNote>}
                {search.kredit && <p className="vnote">Der ausgewählte Kredit hat keine offene Restschuld oder ist nicht verfügbar.</p>}
              </section>
            )}
            {!loan && <DebtHistory />}
            <DebtOverview view={view} />
            <details className="debt-rechenweg debt-full">
              <summary>Rechenweg</summary>
              <p className="vnote">
                Die ausgewählte Kreditrechnung verwendet gespeicherte Konditionen und datierte
                Zinsänderungen, Monatszins und Cent-Rundung des bestehenden Tilgungsplans. Keine
                taggenaue Verzinsung oder Vorfälligkeitskosten. Die Vorschau erzeugt keine Zahlung.
                Gespeicherte Szenarien und Konditionen bleiben hier verfügbar.
              </p>
              <div className="kview vview">
                {loan && (
                  <>
                    <p className="vnote">Gesamter tatsächlicher Schuldenverlauf in EUR, getrennt vom ausgewählten Kreditmodell:</p>
                    <DebtHistory />
                    <LoanPlanning loanId={loan.id} asOf={view.asOf} />
                  </>
                )}
                <DebtStrategies asOf={view.asOf} />
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
              </div>
            </details>
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
