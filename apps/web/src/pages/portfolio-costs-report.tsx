import { useAmountPrivacy, DimensionChain } from '@budget/ui';
import { cents } from '@budget/domain';
import type { CostsTaxesReport } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { LoadingNote } from '../ledger/states';
import { type WithValuationNotes } from '../ledger/valuation-hint';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from './placeholder-page';
import {
  DecisionLink,
  ProductLink,
  ReportUnavailable,
  SignedMoney,
  bpText,
  percentText,
} from './portfolio-report-shared';
import './portfolio-costs-report.css';
import { BookRuleMetric } from '../rules/book-rule-metric';

interface CostsResponse extends WithValuationNotes {
  costs: CostsTaxesReport;
}

const costsQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'portfolio-costs-report'],
  retry: false,
  queryFn: () => request<CostsResponse>('GET', '/api/portfolio/costs-taxes'),
});

export function PortfolioCostsReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const query = useQuery(costsQuery);
  const data = query.data?.costs;
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : data
            ? `${longDay(data.from)} bis ${longDay(data.to)}`
            : 'wird geladen'
      }
    >
      <div className="prep portfolio-costs-report">
        <BookRuleMetric code="R22" />
        {query.isPending && <LoadingNote what="Kosten, Steuern und Erträge" />}
        {query.isError && (
          <ReportUnavailable
            what="Die Auswertung von Kosten, Steuern und Erträgen"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {data && !query.isError && <CostsBody data={data} />}
      </div>
    </PageFrame>
  );
}

/** One line of the parts list: position number, text, signed amount. */
function Row({
  pos,
  label,
  cents: value,
  note,
}: {
  pos: string;
  label: string;
  cents: number;
  note?: string;
}) {
  useAmountPrivacy();
  return (
    <tr>
      <td className="col-pos">{pos}</td>
      <td>
        {label}
        {note && <small>{note}</small>}
      </td>
      <td className="n">{eur(value)}</td>
    </tr>
  );
}

function CostsBody({ data }: { data: CostsTaxesReport }) {
  useAmountPrivacy();
  const { net, income, taxes, costs, latent } = data;
  const empty = data.products.length === 0 && net.grossCents === 0 && costs.totalCents === 0;
  if (empty)
    return (
      <p className="prep-empty" role="status">
        In den letzten 12 Monaten gibt es weder Erträge noch Kosten oder Steuern aus Wertpapieren.
      </p>
    );
  const otherTaxes = taxes.saleCents + taxes.purchaseCents + taxes.bookingCents;
  return (
    <>
      <div className="costs-main">
        <section className="prep-card" aria-labelledby="costs-title">
          <div className="tbd-head">
            <h2 id="costs-title">Erträge nach Kosten und Steuern, 12 Monate</h2>
            <DecisionLink />
          </div>
          <div className="prep-lead">
            <span className="tech">Netto nach Steuern und Kosten</span>
            <strong data-testid="costs-net">{eur(net.netCents)}</strong>
          </div>
          <DimensionChain
            precision="cent"
            label="Maßkette Kosten und Steuern"
            terms={[
              { label: 'Erträge brutto', value: cents(net.grossCents) },
              { label: 'Steuern auf Erträge', value: cents(net.taxOnIncomeCents), op: '-' },
              { label: 'Gebühren und TER', value: cents(net.costsCents), op: '-' },
              { label: 'Netto', value: cents(net.netCents), op: '=', result: true },
            ]}
          />
          <div className="prep-scroll">
            <table
              className="prep-table costs-parts"
              aria-label="Stückliste Erträge, Steuern und Kosten"
            >
              <tbody>
                <tr className="is-group">
                  <td colSpan={2}>Erträge brutto</td>
                  <td className="n">{eur(income.grossCents)}</td>
                </tr>
                <Row
                  pos="1.1"
                  label="Dividenden und Ausschüttungen"
                  cents={income.dividend.grossCents}
                />
                <Row pos="1.2" label="Zinsen" cents={income.interest.grossCents} />
                <tr className="is-group">
                  <td colSpan={2}>
                    Steuern auf Erträge
                    <small>Einbehalt laut Broker, wie gebucht</small>
                  </td>
                  <td className="n">{eur(-taxes.onIncomeCents)}</td>
                </tr>
                <Row pos="2.1" label="auf Dividenden" cents={-taxes.dividendCents} />
                <Row pos="2.2" label="auf Zinsen" cents={-taxes.interestCents} />
                <tr className="is-group">
                  <td colSpan={2}>Gebühren und TER</td>
                  <td className="n">{eur(-costs.totalCents)}</td>
                </tr>
                <Row
                  pos="3.1"
                  label="Orderentgelte (Käufe, Verkäufe)"
                  cents={-costs.fees.orderCents}
                />
                <Row pos="3.2" label="Gebühren auf Erträge" cents={-costs.fees.incomeCents} />
                <Row
                  pos="3.3"
                  label="Gebührenbuchungen (Konto, Depot)"
                  cents={-costs.fees.bookingCents}
                />
                {costs.fees.otherCents > 0 && (
                  <Row pos="3.4" label="Sonstige Gebühren" cents={-costs.fees.otherCents} />
                )}
                <Row
                  pos={costs.fees.otherCents > 0 ? '3.5' : '3.4'}
                  label="Fondskosten (TER)"
                  note="laufend im Kurs enthalten, hier als Kostenanteil gerechnet"
                  cents={-costs.terCents}
                />
                <tr className="is-total">
                  <td colSpan={2}>Netto</td>
                  <td className="n">{eur(net.netCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3 className="costs-sub">Weitere Steuern laut Broker</h3>
          <div className="prep-scroll">
            <table className="prep-table costs-other" aria-label="Weitere Steuern laut Broker">
              <tbody>
                <Row pos="4.1" label="auf Verkäufe (Kursgewinne)" cents={-taxes.saleCents} />
                <Row pos="4.2" label="auf Käufe" cents={-taxes.purchaseCents} />
                <Row
                  pos="4.3"
                  label="Steuerbuchungen (z. B. Vorabpauschale)"
                  cents={-taxes.bookingCents}
                />
                <tr className="is-total">
                  <td colSpan={2}>Summe, nicht in der Maßkette</td>
                  <td className="n" data-testid="costs-other-taxes">
                    {eur(-otherTaxes)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="vnote">
            Steuern sind ausschließlich die Beträge, die der Broker einbehalten und gebucht hat. Die
            App rechnet keine zweite Quellensteuer. Die Maßkette zählt die Steuern auf Erträge;
            Steuern auf Verkäufe sind kein Ertrag und stehen deshalb darunter. Nicht erfasste
            Aufschläge (etwa ein Spread beim Kryptokauf) fehlen in den Kosten.
          </p>
        </section>
        <section className="prep-card costs-latent" aria-labelledby="latent-title">
          <div className="tbd-head">
            <h2 id="latent-title">Bei Verkauf fällig</h2>
            <span className="tbd-state">Beispielrechnung</span>
          </div>
          <div className="prep-lead">
            <span className="tech">Latente KESt {bpText(latent.rateBp)}</span>
            <strong data-testid="latent-tax">{eur(latent.totalCents)}</strong>
          </div>
          <p className="vnote">
            Beispielrechnung, keine Steuerberatung: {bpText(latent.rateBp)} auf die Kursgewinne je
            Produkt, wenn heute alles verkauft würde. Verluste einzelner Produkte werden nicht
            gegengerechnet; die Summe ist daher eine Obergrenze. Sie ist kein gebuchter Wert.
          </p>
          {!latent.complete && (
            <p className="vnote" role="status">
              Für mindestens ein Produkt fehlt der dokumentierte Einstand; seine latente KESt ist in
              der Summe nicht enthalten.
            </p>
          )}
          <dl className="costs-facts">
            <div>
              <dt className="tech">Kostenquote</dt>
              <dd data-testid="cost-rate">
                {bpText(costs.costRateBp, { digits: 2 })}
                <small>
                  Ziel ≤ {bpText(costs.targetBp, { digits: 2 })} ·{' '}
                  {costs.costRateBp <= costs.targetBp ? 'eingehalten' : 'überschritten'}
                </small>
              </dd>
            </div>
            <div>
              <dt className="tech">Steuern in % der Erträge</dt>
              <dd>
                {net.grossCents > 0
                  ? percentText(net.taxOnIncomeCents / net.grossCents, { digits: 0 })
                  : '–'}
                <small>nur Steuern auf Erträge</small>
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="prep-card" aria-labelledby="costs-products-title">
        <div className="tbd-head">
          <h2 id="costs-products-title">Je Produkt</h2>
        </div>
        <div
          className="prep-scroll"
          role="region"
          aria-label="Produkte, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the wide table.
          tabIndex={0}
        >
          <table className="prep-table costs-products" data-testid="costs-products">
            <thead>
              <tr>
                <th className="tech">Produkt</th>
                <th className="tech n">Einstand</th>
                <th className="tech n">Wert</th>
                <th className="tech n">Kursgewinn</th>
                <th className="tech n">latente KESt</th>
                <th className="tech n">Fondskosten 12 M</th>
                <th className="tech n">Erträge 12 M</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.securityId}>
                  <td>
                    <ProductLink id={p.securityId}>{p.name}</ProductLink>
                  </td>
                  <td className="n">
                    {p.costBasisCents === null ? 'fehlt' : eur(p.costBasisCents)}
                  </td>
                  <td className="n">{eur(p.valueCents)}</td>
                  <td className="n">
                    {p.unrealizedGainCents === null ? (
                      '–'
                    ) : (
                      <SignedMoney cents={p.unrealizedGainCents} />
                    )}
                  </td>
                  <td className="n">{p.latentTaxCents === null ? '–' : eur(-p.latentTaxCents)}</td>
                  <td className="n">
                    {p.terBp > 0 || p.feesCents > 0 ? (
                      <>
                        {eur(p.terCents + p.feesCents)}
                        {p.terBp > 0 && <small>TER {bpText(p.terBp, { digits: 2 })}</small>}
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="n">
                    {p.incomeGrossCents > 0 ? (
                      <>
                        {eur(p.incomeGrossCents)}
                        <small>Steuer {eur(p.incomeTaxCents)}</small>
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                </tr>
              ))}
              <tr className="is-total">
                <td>Summe</td>
                <td className="n">
                  {data.products.some((p) => p.costBasisCents === null)
                    ? '–'
                    : eur(data.products.reduce((a, p) => a + (p.costBasisCents ?? 0), 0))}
                </td>
                <td className="n">{eur(data.valueCents)}</td>
                <td className="n">
                  {data.products.some((p) => p.unrealizedGainCents === null) ? (
                    '–'
                  ) : (
                    <SignedMoney
                      cents={data.products.reduce((a, p) => a + (p.unrealizedGainCents ?? 0), 0)}
                    />
                  )}
                </td>
                <td className="n">{eur(-latent.totalCents)}</td>
                <td className="n">
                  {eur(data.products.reduce((a, p) => a + p.terCents + p.feesCents, 0))}
                </td>
                <td className="n">{eur(income.grossCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="vnote">
          Fondskosten 12 M = TER auf die Monatsendwerte plus die Gebühren des Produkts. Erträge sind
          Dividenden und Zinsen vor Steuern; die Steuer ist der Einbehalt laut Broker.
        </p>
      </section>
    </>
  );
}
