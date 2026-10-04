import { useAmountPrivacy, DimensionChain } from '@budget/ui';
import { cents } from '@budget/domain';
import type { BankCostsReport, FundCostsReport } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { bpText, monthShort, ReportQuery, ScrollRegion } from './spending-shared';

const costsQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'bank-costs-report'],
  retry: false,
  queryFn: () => request<BankCostsReport>('GET', '/api/reports/spending/costs'),
});
const fundQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'bank-costs-fund'],
  retry: false,
  queryFn: () => request<FundCostsReport>('GET', '/api/reports/spending/costs/fund'),
});

const LEVER: Record<string, string> = {
  interest: 'Sondertilgung vor dem Investieren prüfen (R09)',
  account: 'Gratiskonto oder günstigeren Kontotarif prüfen',
  orders: 'Broker oder Sparplan ohne Gebühr prüfen',
  fx: 'Karte ohne Auslandsentgelt prüfen',
};
const TYPE_NAME: Record<string, string> = {
  loan: 'Kredit',
  credit_card: 'Kreditkarte',
  checking: 'Kontoüberziehung',
  cash: 'Bargeld',
  other_liability: 'Verbindlichkeit',
};

const pct2 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rateText = (bp: number | null) => (bp === null ? '–' : `${pct2.format(bp / 100)} %`);
const monthEnd = (month: string | undefined) => (month ? monthShort(month) : '');

/** 2.6 Bank- und Zinskosten: Was kostet uns das Geld selbst? */
export function BankCostsReportPage({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const query = useQuery(costsQuery);
  const data = query.data && !query.isFetching ? query.data : undefined;
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : data
            ? data.months.length
              ? `${monthShort(data.months[0] as string)} bis ${monthShort(data.months[data.months.length - 1] as string)}`
              : 'keine geschlossenen Monate'
            : 'wird geladen'
      }
      reportStand={{
        label: 'Stichtag',
        value: data?.to ? `${longDay(data.to)} · Monatsende` : 'Monatsende',
      }}
    >
      <div className="kview sr" data-testid="bank-costs-report">
        <ReportQuery query={query} what="Bank- und Zinskosten">
          {(result) => <Body data={result} />}
        </ReportQuery>
      </div>
    </PageFrame>
  );
}

function Body({ data }: { data: BankCostsReport }) {
  useAmountPrivacy();
  const fund = useQuery(fundQuery);
  if (data.months.length === 0)
    return (
      <section className="sr-card sr-wide" aria-labelledby="bc-empty">
        <div className="sr-head">
          <h2 id="bc-empty">Noch keine geschlossenen Monate</h2>
        </div>
        <p className="sr-empty" role="status">
          Sobald ein Budgetkonto einen vollen Monat Buchungen hat, erscheinen hier die Kosten des
          Geldes.
        </p>
      </section>
    );
  const maxYear = Math.max(1, ...data.years.map((y) => y.totalCents));
  const last = data.months[data.months.length - 1] as string;
  const first = data.months[0] as string;
  const netLabel = data.netCents >= 0 ? 'Netto-Ertrag' : 'Netto-Kosten';
  return (
    <>
      <section className="sr-card" aria-labelledby="bc-main">
        <div className="sr-head">
          <h2 id="bc-main">Kosten des Geldes, {data.months.length} Monate</h2>
          {data.changeCents !== null ? (
            <span className={`sr-state ${data.changeCents <= 0 ? 'is-good' : 'is-bad'}`}>
              {eur(data.changeCents, { cents: false, sign: true })} zum Vorjahr
            </span>
          ) : (
            <span className="sr-state">kein Vorjahresvergleich</span>
          )}
        </div>
        <p className="sr-range">
          {monthShort(first)} bis {monthShort(last)}
        </p>
        <div className="sr-fig">
          <span>Gebuchte Kosten</span>
          <strong data-testid="bc-total">{eur(data.totalCents)}</strong>
        </div>
        <DimensionChain
          label="Maßkette Bank- und Zinskosten"
          precision="cent"
          terms={[
            { label: 'Zinsen und Dividenden', value: cents(data.earningsCents) },
            { label: 'Kosten', op: '-', value: cents(data.totalCents) },
            { label: netLabel, op: '=', value: cents(data.netCents), result: true },
          ]}
        />
        <p className="sr-note">
          Zinsen und Dividenden sind kein Haushaltseinkommen; sie stehen hier als Erträge neben den
          Kosten.
        </p>
        <ul className="sr-years" aria-label="Kosten je Kalenderjahr">
          {data.years.map((y) => (
            <li key={y.year}>
              <span className="sr-year-label">
                {y.year}
                {y.partial ? (
                  <small>
                    {y.from.endsWith('-01') ? `bis ${monthEnd(y.to)}` : `ab ${monthEnd(y.from)}`}
                  </small>
                ) : null}
              </span>
              <span
                className="sr-stack"
                role="img"
                aria-label={`${y.year}: ${eur(y.totalCents, { cents: false })}, ${data.rows.map((r, i) => `${r.name} ${eur(y.partCents[i] ?? 0, { cents: false })}`).join(', ')}`}
              >
                {y.partCents.map((c, i) => (
                  <i
                    key={data.rows[i]?.key}
                    className={`kc-${i + 1}`}
                    style={{ width: `${(Math.max(0, c) / maxYear) * 100}%` }}
                  />
                ))}
              </span>
              <span className="sr-val">
                <strong>{eur(y.totalCents, { cents: false })}</strong>
                <small>Erträge {eur(y.earningsCents, { cents: false })}</small>
              </span>
            </li>
          ))}
        </ul>
        <ul className="sr-leg">
          {data.rows.map((r, i) => (
            <li key={r.key}>
              <i className={`sw kc-${i + 1}`} aria-hidden="true" />
              {r.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="sr-card" aria-labelledby="bc-loan">
        <div className="sr-head">
          <h2 id="bc-loan">
            {data.loan ? `Kredit ${pct2.format(data.loan.rateBp / 100)} %` : 'Kredit'}
          </h2>
        </div>
        {data.loan ? (
          data.loan.plan ? (
            <dl className="sr-facts">
              <div>
                <dt>Restschuld heute</dt>
                <dd>{eur(data.loan.balanceCents)}</dd>
              </div>
              <div>
                <dt>Nur Rate ({eur(data.loan.paymentCents, { cents: false })} im Monat)</dt>
                <dd>
                  {eur(data.loan.plan.base.totalInterestCents, { cents: false })} Zinsen
                  <small>schuldenfrei {monthShort(data.loan.plan.base.payoffMonth ?? '')}</small>
                </dd>
              </div>
              <div>
                <dt>
                  Mit Sondertilgung ({eur(data.loan.extraCents, { cents: false })} im Monat,
                  aktuell)
                </dt>
                <dd>
                  {eur(data.loan.plan.withExtra.totalInterestCents, { cents: false })} Zinsen
                  <small>
                    schuldenfrei {monthShort(data.loan.plan.withExtra.payoffMonth ?? '')}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Ersparnis</dt>
                <dd className="is-better">
                  {eur(data.loan.plan.interestSavedCents, { cents: false })}
                  <small>{data.loan.plan.monthsEarlier} Monate früher</small>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="sr-empty" role="status">
              Die monatliche Rate ({eur(data.loan.paymentCents)}) deckt die Zinsen nicht: ohne
              Mehrzahlung sinkt die Restschuld von {eur(data.loan.balanceCents, { cents: false })}{' '}
              nicht.
            </p>
          )
        ) : (
          <p className="sr-empty" role="status">
            {data.loanCount > 1
              ? 'Es gibt mehrere Kredite mit Zinssatz; die Rechnung je Kredit steht im Schuldenrechner unter Vermögen.'
              : 'Es gibt keinen offenen Kredit mit Zinssatz.'}
          </p>
        )}
        <p className="sr-note">
          {data.loan?.paymentSource === 'terms'
            ? 'Die Rate stammt aus den Konditionen des Kredits (Einstellungen › Konten), die Sondertilgung aus den wiederkehrenden Zahlungen der Kreditkategorien.'
            : 'Rate und Sondertilgung stammen aus den wiederkehrenden Zahlungen der Kreditkategorien; eine Monatsrate beim Kredit (Einstellungen › Konten) hat Vorrang.'}{' '}
          Ändern kannst du die Sondertilgung im{' '}
          <AppLink to="/vermoegen/schulden">Schuldenrechner</AppLink> unter Vermögen.
        </p>
      </section>

      <section className="sr-card sr-wide" aria-labelledby="bc-lines">
        <div className="sr-head">
          <h2 id="bc-lines">Kreditlinien</h2>
          <AppLink to="/einstellungen/konten" className="sr-state">
            In Einstellungen › Konten pflegen
          </AppLink>
        </div>
        {data.creditLines.length === 0 ? (
          <p className="sr-empty" role="status">
            Keine Konten mit Kreditrahmen, Überziehung oder Kreditkonditionen.
          </p>
        ) : (
          <ScrollRegion label="Kreditlinien, bei Bedarf horizontal verschiebbar">
            <table className="sr-table" data-testid="credit-lines">
              <caption className="sr-only">Rahmen, Nutzung, Zinssatz und Zinsen je Konto</caption>
              <thead>
                <tr>
                  <th scope="col">Konto</th>
                  <th scope="col">Art</th>
                  <th scope="col" className="n">
                    Rahmen
                  </th>
                  <th scope="col" className="n">
                    genutzt
                  </th>
                  <th scope="col">Auslastung</th>
                  <th scope="col" className="n">
                    Zinssatz
                  </th>
                  <th scope="col" className="n">
                    Rate
                  </th>
                  <th scope="col">Laufzeit</th>
                  <th scope="col" className="n">
                    Zinsen {data.months.length} M
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.creditLines.map((l) => {
                  const use = l.limitCents && l.limitCents > 0 ? l.usedCents / l.limitCents : null;
                  return (
                    <tr key={l.id}>
                      <th scope="row">{l.name}</th>
                      <td>{TYPE_NAME[l.type] ?? l.type}</td>
                      <td className="n">
                        {l.limitCents === null ? '–' : eur(l.limitCents, { cents: false })}
                      </td>
                      <td className="n">{eur(l.usedCents, { cents: false })}</td>
                      <td>
                        {use === null ? (
                          <span className="muted">–</span>
                        ) : (
                          <span className="sr-use">
                            <span className="sr-use-bar" aria-hidden="true">
                              <i style={{ width: `${Math.min(100, use * 100)}%` }} />
                            </span>
                            {Math.round(use * 100)} %
                          </span>
                        )}
                      </td>
                      <td className="n">
                        {rateText(l.rateBp)}
                        {l.rateBp !== null && l.interestKind
                          ? l.interestKind === 'fixed'
                            ? ' fix'
                            : ' variabel'
                          : ''}
                      </td>
                      <td className="n">
                        {l.installmentCents === null
                          ? '–'
                          : eur(l.installmentCents, { cents: false })}
                      </td>
                      <td>
                        {l.termEnd
                          ? `${l.termStart ? `${longDay(l.termStart)} ` : ''}bis ${longDay(l.termEnd)}`
                          : '–'}
                      </td>
                      <td className="n">
                        {l.interest12Cents === null
                          ? '–'
                          : eur(l.interest12Cents, { cents: false })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <p className="sr-note">
          Zinsen stehen dort, wo das Konto Zinsbuchungen hat; ohne Buchung zeigt die Zeile „–“.
          Kartenauslastung Ziel ≤ 30 %. Eine Überziehung ist nie Teil des Plans (R07), der Rahmen
          zählt nicht als Liquidität.
        </p>
      </section>

      <section className="sr-card sr-wide" aria-labelledby="bc-kinds">
        <div className="sr-head">
          <h2 id="bc-kinds">Nach Art: was es kostet und was es ändert</h2>
          {data.incomeShareBp !== null ? (
            <span className="sr-state">
              {pct2.format(data.incomeShareBp / 100)} % der Haushaltseinnahmen
            </span>
          ) : null}
        </div>
        <ScrollRegion label="Kosten nach Art, bei Bedarf horizontal verschiebbar">
          <table className="sr-table" data-testid="cost-kinds">
            <caption className="sr-only">
              Kosten der letzten {data.months.length} Monate nach Art, mit Vorperiode und Anteil
            </caption>
            <thead>
              <tr>
                <th scope="col">Posten</th>
                <th scope="col" className="n">
                  {data.months.length} Monate
                </th>
                <th scope="col" className="n">
                  {data.months.length} Monate davor
                </th>
                <th scope="col" className="n">
                  Veränderung
                </th>
                <th scope="col" className="n">
                  Anteil
                </th>
                <th scope="col">Stellschraube</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.key}>
                  <th scope="row">
                    <span className="sr-name">
                      <i className={`sw kc-${i + 1}`} aria-hidden="true" />
                      <span>{r.name}</span>
                    </span>
                  </th>
                  <td className="n">
                    <strong>{eur(r.cents)}</strong>
                  </td>
                  <td className="n">{r.previousCents === null ? '–' : eur(r.previousCents)}</td>
                  <td className="n">
                    {r.changeBp === null ? (
                      '–'
                    ) : (
                      <span className={r.changeBp <= 0 ? 'is-better' : 'is-worse'}>
                        {bpText(r.changeBp, { sign: true, digits: 0 })}
                      </span>
                    )}
                  </td>
                  <td className="n">{bpText(r.shareBp, { digits: 0 })}</td>
                  <td>
                    <small>{LEVER[r.key] ?? ''}</small>
                  </td>
                </tr>
              ))}
              <tr className="is-total">
                <th scope="row">Kosten</th>
                <td className="n">{eur(data.totalCents)}</td>
                <td className="n">
                  {data.previousTotalCents === null ? '–' : eur(data.previousTotalCents)}
                </td>
                <td className="n">
                  {data.previousTotalCents &&
                  data.previousTotalCents > 0 &&
                  data.changeCents !== null
                    ? bpText(Math.round((data.changeCents / data.previousTotalCents) * 10_000), {
                        sign: true,
                        digits: 0,
                      })
                    : '–'}
                </td>
                <td className="n">100 %</td>
                <td />
              </tr>
              <tr>
                <th scope="row">Zinsen und Dividenden</th>
                <td className="n">{eur(data.earningsCents)}</td>
                <td className="n">
                  {data.previousEarningsCents === null ? '–' : eur(data.previousEarningsCents)}
                </td>
                <td colSpan={2} />
                <td>
                  <small>Kapitalerträge der Budgetkonten, wie gebucht</small>
                </td>
              </tr>
              <tr className="is-total">
                <th scope="row">Erträge − Kosten</th>
                <td className="n">{eur(data.netCents, { sign: true })}</td>
                <td className="n">
                  {data.previousNetCents === null
                    ? '–'
                    : eur(data.previousNetCents, { sign: true })}
                </td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </ScrollRegion>
        <p className="sr-note">
          Kontoführung zählt die Kategoriegruppe „Bank und Gebühren“, Fremdwährung die gespeicherte
          Gebühr der Bank ({data.foreignFeeBookings} Buchungen in {data.months.length} Monaten).
          {data.skippedForeignTrades > 0
            ? ` ${data.skippedForeignTrades} Orders in Fremdwährung sind nicht eingerechnet.`
            : ''}
        </p>
        <h3>Fondskosten (Schätzung, nicht abgebucht)</h3>
        <div data-testid="fund-costs">
          {fund.isPending ? (
            <p className="sr-empty" role="status">
              Fondskosten werden berechnet …
            </p>
          ) : fund.isError ? (
            <p className="sr-empty" role="alert">
              Fondskosten konnten nicht geladen werden.
            </p>
          ) : fund.data.unavailable ? (
            <p className="sr-empty" role="status">
              Für die Bewertung fehlt ein Kurs oder Wechselkurs; die Fondskosten sind deshalb nicht
              berechenbar.
            </p>
          ) : fund.data.fundCosts ? (
            <p className="sr-note">
              <strong>{eur(fund.data.fundCosts.terCents)}</strong> TER auf Depotwerte von{' '}
              {eur(fund.data.fundCosts.valueCents, { cents: false })} in den letzten zwölf Monaten (
              {bpText(fund.data.fundCosts.costRateBp)} mit {eur(fund.data.fundCosts.feesCents)}{' '}
              Gebühren). Fondskosten werden nicht abgebucht, sie mindern den Kurs, und fehlen
              deshalb in den Summen oben.
            </p>
          ) : (
            <p className="sr-empty" role="status">
              Es gibt keine bewerteten Wertpapiere.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
