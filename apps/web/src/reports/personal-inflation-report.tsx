import { AppLink } from '../shell/app-link';
import { Fragment, useId, useState } from 'react';
import { chartPoints, chartPercent } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
  AxisLine,
  ChartSvg,
  ClassSwatch,
  Graticule,
  Line,
  LineLegend,
  XTicks,
  Segmented,
} from '@budget/ui';
import type { InflationReport } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { eur, longDay, MINUS } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { bpText, monthShort, ReportQuery, ScrollRegion } from './spending-shared';
import { InflationExplorer } from './inflation-explorer';

const inflationQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'personal-inflation'],
  retry: false,
  queryFn: () => request<InflationReport>('GET', '/api/reports/spending/inflation'),
});

const num1 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const index1 = (value: number) => num1.format(value);
/** Percentage points from hundredths of a point (`81` = +0,81 Pp). */
const pp = (bp: number) => `${bp < 0 ? MINUS : '+'}${num2.format(Math.abs(bp) / 100)}`;
const yearPercent = (bp: number | null) =>
  bp === null ? '–' : `${bp < 0 ? MINUS : bp > 0 ? '+' : ''}${num2.format(Math.abs(bp) / 100)} %`;

/** 2.4 Persönliche Inflation: Wie stark steigen unsere Preise? */
export function PersonalInflationReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const query = useQuery(inflationQuery);
  const data = query.data && !query.isFetching ? query.data : undefined;
  return (
    <PageFrame
      verdict={
        data && !query.isError
          ? {
              reportId: report.id,
              period: data.toMonth ?? '',
              metric: {
                label: 'Eigene Preisänderung',
                value: data.latestComparison?.ownBp ?? null,
                unit: 'percent',
              },
            }
          : undefined
      }
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : data
            ? data.points.length
              ? `${monthShort(data.baseMonth as string)} bis ${monthShort(data.toMonth as string)}`
              : data.insufficientReason === 'months'
                ? 'weniger als 13 Monate'
                : 'Warenkorb nicht berechenbar'
            : 'wird geladen'
      }
      reportStand={{ label: 'Stichtag', value: 'Monatsende' }}
    >
      <p>
        <AppLink to="/einstellungen/warenkorb">Warenkorb bearbeiten</AppLink>
      </p>
      <div className="kview sr" data-testid="personal-inflation">
        <ReportQuery query={query} what="Persönliche Inflation">
          {(result) => <Body data={result} />}
        </ReportQuery>
      </div>
    </PageFrame>
  );
}

function Body({ data }: { data: InflationReport }) {
  const [view, setView] = useState<'basket' | 'explorer'>('basket');
  return (
    <>
      <div className="sr-wide">
        <Segmented
          label="Inflationsansicht"
          options={[
            { value: 'basket', label: 'Warenkorb vs. VPI' },
            { value: 'explorer', label: 'Kategorie-Explorer' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'explorer' ? (
        <InflationExplorer categories={data.basketSettings} rows={data.explorer} />
      ) : (
        <BasketBody data={data} />
      )}
    </>
  );
}

function BasketBody({ data }: { data: InflationReport }) {
  useAmountPrivacy();
  const [basketView, setBasketView] = useState<'base' | 'year'>('base');
  if (data.status !== 'ok')
    return (
      <section className="sr-card sr-wide" aria-labelledby="pi-empty">
        <div className="sr-head">
          <h2 id="pi-empty">Noch kein Preisindex</h2>
        </div>
        <p className="sr-empty" role="status" data-testid="pi-empty-reason">
          {data.insufficientReason === 'cpi'
            ? 'Für eine gewählte VPI-Teilindex-Kategorie fehlen mindestens 13 zusammenhängende Monate mit veröffentlichten Preiswerten. Die Kategorie wird nicht still aus dem Warenkorb entfernt.'
            : data.insufficientReason === 'months'
              ? 'Für eine Teuerung über zwölf Monate braucht der Report mindestens 13 geschlossene Monate.'
              : 'Für den eigenen Warenkorb braucht der Report Fixkosten mit Preis und Ausgaben im ersten Jahr der Aufzeichnung: gespeicherte Preisversionen oder regelmäßige Buchungen, auch Quartals-, Halbjahres- und Jahreszahlungen.'}
        </p>
        {data.referenceLatest ? (
          <p className="sr-note" data-testid="pi-empty-reference">
            Zum Vergleich: Der Verbraucherpreisindex (Statistik Austria) ändert sich im{' '}
            {monthShort(data.referenceLatest.month)} um{' '}
            {bpText(data.referenceLatest.changeBp, { sign: true })} gegenüber dem Vorjahresmonat.
          </p>
        ) : null}
      </section>
    );
  const maxPp = Math.max(1, ...data.contributions.map((c) => Math.abs(c.contributionBp)));
  return (
    <>
      <section className="sr-card" aria-labelledby="pi-main">
        <div className="sr-head">
          <h2 id="pi-main">Eigene Teuerung, 12 Monate</h2>
          <span className="sr-state" data-testid="pi-reference-state">
            {data.latestComparison ? (
              <>
                <Term term="VPI" /> {bpText(data.latestComparison.referenceBp, { sign: true })} ·
                Differenz {num1.format(data.latestComparison.differenceBp / 100)} <Term term="Pp" />{' '}
                ({monthShort(data.latestComparison.month)})
              </>
            ) : data.referenceAvailable ? (
              <>
                <Term term="VPI" />
                -Reihe ohne Überschneidung
              </>
            ) : (
              'kein Verbraucherpreisindex gespeichert'
            )}
          </span>
        </div>
        <div className="sr-fig">
          <span>Preisänderung des eigenen Warenkorbs</span>
          <strong data-testid="pi-rate">{bpText(data.inflationBp, { sign: true })}</strong>
        </div>
        <div className="chain-inline" role="group" aria-label="Maßkette persönliche Inflation">
          <span className="ct-pair">
            <span className="ct-term">
              <span className="ct-label tech">
                Warenkorb {monthShort(data.fromMonth as string)}
              </span>
              <span className="ct-val">{index1(data.indexFrom as number)}</span>
            </span>
          </span>
          <span className="ct-pair">
            <span className="ct-op" aria-hidden="true">
              →
            </span>
            <span className="ct-term">
              <span className="ct-label tech">{monthShort(data.toMonth as string)}</span>
              <span className="ct-val">{index1(data.indexTo as number)}</span>
            </span>
          </span>
          <span className="ct-pair">
            <span className="ct-op" aria-hidden="true">
              =
            </span>
            <span className="ct-term is-result">
              <span className="ct-label tech">Teuerung</span>
              <span className="ct-val">{bpText(data.inflationBp, { sign: true })}</span>
            </span>
          </span>
        </div>
        <IndexChart data={data} />
        <p className="sr-note">
          Eigener Warenkorb · <Term term="Index" /> · Start = 100; <Term term="VPI" /> als
          Vergleich. VPI-Teilindizes begrenzen den Warenkorb auf den letzten gemeinsam
          veröffentlichten Monat.
        </p>
        {data.reference ? (
          <p className="sr-note">
            {data.reference.source === 'fixture' ? (
              <>
                Synthetische Beispielreihe statt <Term term="VPI" /> (Entwicklungsdaten).
              </>
            ) : data.reference.lastMonth >= '2026-01' ? (
              'Verbraucherpreisindex: Statistik Austria, Basis 2020 (bis Dez 2025) und Basis 2025 (ab Jän 2026), beide Open Data, CC BY 4.0. Die Basis 2025 ist über den Jahresdurchschnitt 2025 auf die Basis 2020 verkettet.'
            ) : (
              'Verbraucherpreisindex: Statistik Austria, Basis 2020 (Open Data, CC BY 4.0).'
            )}{' '}
            Die Reihe reicht bis {monthShort(data.reference.lastMonth)}
            {data.reference.fetchedAt
              ? ` und wurde am ${longDay(data.reference.fetchedAt.slice(0, 10))} gelesen`
              : ''}
            ; die nächtliche Marktabfrage liest sie höchstens einmal im Monat neu. Der Vergleich
            gilt, soweit beide Reihen reichen.
          </p>
        ) : (
          <p className="sr-note" role="status">
            Ein Verbraucherpreisindex ist noch nicht gespeichert; die nächtliche Marktabfrage holt
            ihn von Statistik Austria, sobald sie läuft.
          </p>
        )}
      </section>

      <section className="sr-card" aria-labelledby="pi-how">
        <div className="sr-head">
          <h2 id="pi-how">So wird gerechnet</h2>
        </div>
        <p className="sr-note">
          Vertragspreise werden mit ihrem eigenen ersten Preis und den Ausgabenanteilen gewichtet;
          jährliche Neugewichtung am Dezember-Link. Neue Positionen starten ohne Sprung, zeitnahe
          Nachfolger derselben Kategorie und Zahlungsfrequenz übernehmen den alten Preisvergleich.
          Regelmäßige Reihen ohne gespeicherten Verlauf werden aus Buchungen abgeleitet. Der
          Warenkorb deckt {bpText(data.coverageBp)} des Konsums im Basisjahr.
        </p>
        {data.derivedContracts.length > 0 && (
          <p className="sr-note" data-testid="pi-derived">
            Aus Buchungen abgeleitet: {data.derivedContracts.map((c) => c.name).join(', ')}.
          </p>
        )}
        <p className="sr-note">
          Das 12-Monats-Mittel enthält Verbrauch, Nachzahlungen und Gutschriften; es misst damit
          Preis und Verbrauch gemeinsam.
        </p>
      </section>

      {
        <>
          <section className="sr-card sr-wide" aria-labelledby="pi-monthly">
            <div className="sr-head">
              <h2 id="pi-monthly">
                Teuerung je Monat gegen den <Term term="VPI" />
              </h2>
              <span className="sr-state">Veränderung zum Vorjahresmonat</span>
            </div>
            <MonthlyChart data={data} />
            <LineLegend
              items={[
                { kind: 'actual', label: 'Eigener Warenkorb' },
                { kind: 'previous', label: 'Verbraucherpreisindex' },
              ]}
            />
            <p className="sr-note">
              Ein Strich heißt: Der <Term term="VPI" /> reicht für diesen Monat oder das Vorjahr
              nicht. Die Differenz ist die eigene Teuerung minus <Term term="VPI" /> in
              Prozentpunkten.
            </p>
          </section>

          <section className="sr-card sr-wide" aria-labelledby="pi-yearly">
            <div className="sr-head">
              <h2 id="pi-yearly">Je Kalenderjahr</h2>
            </div>
            <ScrollRegion label="Teuerung je Kalenderjahr">
              <table className="sr-table" data-testid="yearly-table">
                <thead>
                  <tr>
                    <th scope="col">Jahr</th>
                    <th scope="col">Deine Teuerung</th>
                    <th scope="col">
                      <Term term="VPI" />
                    </th>
                    <th scope="col">Ergebnis</th>
                  </tr>
                </thead>
                <tbody>
                  {data.years.map((y) => (
                    <tr key={y.year}>
                      <th scope="row">
                        {y.year}
                        {!y.throughMonth.endsWith('-12') && (
                          <small>bis {monthShort(y.throughMonth)}</small>
                        )}
                      </th>
                      {y.ownChangeBp === null ? (
                        <td colSpan={3}>Für diesen Monat fehlt der Vergleichsmonat im Vorjahr.</td>
                      ) : (
                        <>
                          <td>{yearPercent(y.ownChangeBp)}</td>
                          <td>{yearPercent(y.referenceChangeBp)}</td>
                          <td>
                            {y.differenceBp === null ? (
                              <>
                                Für den <Term term="VPI" /> fehlt der Vergleichsmonat.
                              </>
                            ) : y.differenceBp === 0 ? (
                              <>
                                Gleich wie der <Term term="VPI" />
                              </>
                            ) : (
                              <>
                                {pp(y.differenceBp)} Prozentpunkte Differenz zum <Term term="VPI" />
                              </>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <p className="sr-note">
              Dezember gegen Dezember; im laufenden Jahr der letzte Monat gegen denselben
              Vorjahresmonat.
            </p>
          </section>
        </>
      }

      <section className="sr-card sr-wide" aria-labelledby="pi-contrib">
        <div className="sr-head">
          <h2 id="pi-contrib">Beitrag je Kategorie</h2>
          <span className="sr-state">
            Summe {pp(data.contributionSumBp)} <Term term="Pp" />
          </span>
        </div>
        <ScrollRegion label="Beitrag je Kategorie, bei Bedarf horizontal verschiebbar">
          <table className="sr-table" data-testid="contributions-table">
            <caption className="sr-only">
              Gewicht, Preisänderung und Beitrag in Prozentpunkten je Kategorie
            </caption>
            <thead>
              <tr>
                <th scope="col">Kategorie</th>
                <th scope="col" className="n">
                  Gewicht
                </th>
                <th scope="col" className="n">
                  Preis 12 M
                </th>
                <th scope="col">Beitrag</th>
                <th scope="col" className="n">
                  <Term term="Pp" />
                </th>
              </tr>
            </thead>
            <tbody>
              {data.contributions.map((c) => (
                <tr key={c.id}>
                  <th scope="row">
                    <span className="sr-name">
                      {c.class ? <ClassSwatch kind={c.class} /> : null}
                      <span>{c.name}</span>
                    </span>
                  </th>
                  <td className="n">{bpText(c.shareBp)}</td>
                  <td className="n">{bpText(c.changeBp, { sign: true })}</td>
                  <td>
                    <span className="sr-pp" aria-hidden="true">
                      <i
                        className={c.contributionBp < 0 ? 'is-neg' : ''}
                        style={{ width: `${(Math.abs(c.contributionBp) / maxPp) * 100}%` }}
                      />
                    </span>
                  </td>
                  <td className="n">
                    <strong>{pp(c.contributionBp)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className="sr-note">
          Die Beiträge stammen aus denselben Indexänderungen wie die Leitkennzahl. Gerundete
          Hundertstel Prozentpunkte werden so verteilt, dass die Summe genau stimmt.
        </p>
      </section>
      <section className="sr-card sr-wide" aria-labelledby="pi-basket">
        <div className="sr-head">
          <h2 id="pi-basket">Warenkorb</h2>
          <Segmented
            label="Warenkorbansicht"
            className="pi-basket-view"
            options={[
              { value: 'base', label: 'Seit Basis' },
              { value: 'year', label: 'Je Jahr' },
            ]}
            value={basketView}
            onChange={setBasketView}
          />
        </div>
        {basketView === 'year' ? (
          <BasketYears data={data} />
        ) : (
          <ScrollRegion label="Verträge im Warenkorb">
            <table className="sr-table" data-testid="inflation-basket">
              <thead>
                <tr>
                  <th scope="col">Kategorie / Vertrag</th>
                  <th scope="col">Quelle</th>
                  <th scope="col">Gewicht</th>
                  <th scope="col">Basis: Preis / Index</th>
                  <th scope="col">Jetzt: Preis / Index</th>
                  <th scope="col">Änderung ab Basis</th>
                  <th scope="col">
                    Beitrag <Term term="Pp" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...new Set(data.basket.map((b) => b.categoryId))].map((id) => (
                  <BasketCategory key={id} id={id} data={data} />
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <p className="sr-note">
          {basketView === 'year'
            ? 'Ø je Monat ist das Mittel der beobachteten Monatspreise. Die Preisänderung vergleicht dieselben Monate im Vorjahr. Beiträge stammen aus dem verketteten Index: Dezember gegen Dezember, im laufenden Jahr der letzte Monat gegen den Vorjahresmonat. Ihre Summe ergibt genau „Je Kalenderjahr“. Ein Strich heißt: Preis oder Vergleich fehlt.'
            : 'Basis ist der erste eigene Preis; Änderung vergleicht Basis und Jetzt. Gewichte werden jährlich erneuert. Beiträge zeigen die letzten zwölf Monate und ergeben die Leitkennzahl.'}
        </p>
        <p className="sr-note">
          Bei VPI-Teilindizes kommt der Preis von Statistik Austria, das Gewicht aus deinen Ausgaben
          im Basisjahr; die Werte sind Indexstände (Basis = 100).
        </p>
        {data.hasOverrides && <p className="sr-note">Warenkorb in den Einstellungen festgelegt</p>}
        <details>
          <summary>Nicht im Warenkorb · {data.excludedCategories} Kategorien</summary>
          <ul>
            {data.excluded.map((c) => (
              <li key={c.id}>
                {c.name} · {c.reason}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}

const W = 760;
const H = 260;
const L = 52;
const R = 70;
const T = 20;
const B = 220;

export function IndexChart({
  data,
  label = 'Persönlicher Preisindex',
  referenceLabel = 'Verbraucherpreisindex',
}: {
  data: Pick<InflationReport, 'points' | 'referenceAvailable'>;
  label?: string;
  referenceLabel?: string;
}) {
  useAmountPrivacy();
  const points = data.points;
  const values = points.flatMap((p) => [p.index, ...(p.reference === null ? [] : [p.reference])]);
  const lo = Math.min(...values, 100);
  const hi = Math.max(...values);
  const pad = Math.max(0.5, (hi - lo) * 0.15);
  const min = lo - pad;
  const max = hi + pad;
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v: number) => B - ((v - min) / (max - min || 1)) * (B - T);
  const step = Math.ceil(points.length / 8);
  const ticks = points.flatMap((p, i) =>
    i % step === 0 ? [{ x: x(i), label: monthShort(p.month) }] : [],
  );
  const grid = [0, 1, 2, 3].map((n) => {
    const v = min + ((max - min) * n) / 3;
    return { y: y(v), label: index1(v) };
  });
  const lastPoint = points[points.length - 1]!;
  return (
    <ScrollRegion label="Diagramm, bei Bedarf horizontal verschiebbar" className="sr-chart">
      <ChartSvg
        width={W}
        height={H}
        label={`${label}, ${monthShort(points[0]!.month)} gleich 100, zuletzt ${index1(lastPoint.index)}.`}
        testId="inflation-chart"
        points={chartPoints(
          points.map((p) => p.month),
          x,
          [
            {
              name: label,
              values: points.map((p) => p.index),
              format: index1,
            },
            ...(data.referenceAvailable
              ? [
                  {
                    name: referenceLabel,
                    values: points.map((p) => p.reference),
                    color: 'var(--ink-3)',
                    format: index1,
                  },
                ]
              : []),
          ],
        )}
      >
        <Graticule x1={L} x2={W - R} lines={grid} />
        <AxisLine x1={L} x2={W - R} y={y(100)} dashed />
        {data.referenceAvailable && (
          <Line
            kind="previous"
            points={points.flatMap((p, i) =>
              p.reference === null ? [] : [[x(i), y(p.reference)] as const],
            )}
          />
        )}
        <Line kind="actual" points={points.map((p, i) => [x(i), y(p.index)] as const)} />
        <XTicks y={H - 18} ticks={ticks} />
        <text x={x(points.length - 1) + 8} y={y(lastPoint.index) + 4} className="svg-label-strong">
          {index1(lastPoint.index)}
        </text>
      </ChartSvg>
    </ScrollRegion>
  );
}

function MonthlyChart({ data }: { data: InflationReport }) {
  useAmountPrivacy();
  const rows = data.monthly;
  if (rows.length < 2) return null;
  const values = rows.flatMap((m) => [m.ownBp, ...(m.referenceBp === null ? [] : [m.referenceBp])]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values);
  const pad = Math.max(50, (hi - lo) * 0.15);
  const min = lo - pad;
  const max = hi + pad;
  const x = (i: number) => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v: number) => B - ((v - min) / (max - min || 1)) * (B - T);
  const step = Math.ceil(rows.length / 8);
  const ticks = rows.flatMap((m, i) =>
    i % step === 0 ? [{ x: x(i), label: monthShort(m.month) }] : [],
  );
  const grid = [0, 1, 2, 3].map((n) => {
    const v = min + ((max - min) * n) / 3;
    return { y: y(v), label: bpText(Math.round(v)) };
  });
  const own = rows.map((m, i) => [x(i), y(m.ownBp)] as const);
  const reference = rows.flatMap((m, i) =>
    m.referenceBp === null ? [] : [[x(i), y(m.referenceBp)] as const],
  );
  return (
    <ScrollRegion label="Diagramm, bei Bedarf horizontal verschiebbar" className="sr-chart">
      <ChartSvg
        width={W}
        height={H}
        label={`Veränderung zum Vorjahresmonat, eigener Warenkorb gegen Verbraucherpreisindex, von ${monthShort(rows[0]!.month)} bis ${monthShort(rows[rows.length - 1]!.month)}.`}
        testId="inflation-monthly-chart"
        points={chartPoints(
          rows.map((m) => m.month),
          x,
          [
            { name: 'Eigener Warenkorb', values: rows.map((m) => m.ownBp), format: chartPercent },
            ...(reference.length > 1
              ? [
                  {
                    name: 'Verbraucherpreisindex',
                    values: rows.map((m) => m.referenceBp),
                    color: 'var(--ink-3)',
                    format: chartPercent,
                  },
                ]
              : []),
          ],
        )}
      >
        <Graticule x1={L} x2={W - R} lines={grid} />
        <AxisLine x1={L} x2={W - R} y={y(0)} />
        {reference.length > 1 && <Line kind="previous" points={reference} />}
        <Line kind="actual" points={own} />
        <XTicks y={H - 18} ticks={ticks} />
      </ChartSvg>
    </ScrollRegion>
  );
}

function BasketYears({ data }: { data: InflationReport }) {
  return (
    <ScrollRegion label="Warenkorb je Kalenderjahr">
      <table className="sr-table" data-testid="inflation-basket-yearly">
        <caption className="sr-only">
          Monatsmittel, Preisänderung zum Vorjahr und Inflationsbeitrag je Warenkorbposition und
          Jahr
        </caption>
        <thead>
          <tr>
            <th scope="col" rowSpan={2}>
              Kategorie / Vertrag
            </th>
            {data.years.map((y) => (
              <th scope="col" colSpan={3} key={y.year}>
                {y.year}
                {!y.throughMonth.endsWith('-12') && <small>bis {monthShort(y.throughMonth)}</small>}
              </th>
            ))}
          </tr>
          <tr>
            {data.years.map((y) => (
              <Fragment key={y.year}>
                <th scope="col" className="n">
                  Ø je Monat
                </th>
                <th scope="col" className="n">
                  Preis zum Vorjahr
                </th>
                <th scope="col" className="n">
                  Beitrag <Term term="Pp" />
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...new Set(data.basket.map((b) => b.categoryId))].map((id) => (
            <BasketCategory key={id} id={id} data={data} yearly />
          ))}
        </tbody>
        <tfoot>
          <tr className="is-total">
            <th scope="row">Deine Teuerung</th>
            {data.years.map((y) => (
              <td key={y.year} colSpan={3} className="n">
                {yearPercent(y.ownChangeBp)}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">
              <Term term="VPI" />
            </th>
            {data.years.map((y) => (
              <td key={y.year} colSpan={3} className="n">
                {yearPercent(y.referenceChangeBp)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </ScrollRegion>
  );
}

const basketPrice = (b: InflationReport['basket'][number], value: number) =>
  b.source === 'cpi' ? index1(value / 100) : eur(value);

function BasketCategory({
  id,
  data,
  yearly = false,
}: {
  id: string;
  data: InflationReport;
  yearly?: boolean;
}) {
  const rows = data.basket.filter((b) => b.categoryId === id);
  return (
    <>
      {rows.map((b, i) => (
        <tr key={b.id}>
          <th scope="row">
            {i === 0 && <small>{b.categoryName}</small>}
            {yearly && b.source === 'cpi' && (
              <small>VPI-Teilindex {b.coicopLabel}, mit deinem Gewicht</small>
            )}
            <details>
              <summary>
                {b.name}
                {b.successors.length ? ` → ${b.successors.join(' → ')}` : ''}
              </summary>
              <ul>
                {b.history.map((p) => (
                  <li key={p.month}>
                    {monthShort(p.month)} · {basketPrice(b, p.cents)}
                  </li>
                ))}
              </ul>
            </details>
          </th>
          {yearly ? (
            b.years.map((y) => (
              <Fragment key={y.year}>
                <td className="n">
                  {y.averageCents === null ? '–' : basketPrice(b, y.averageCents)}
                </td>
                <td className="n">{yearPercent(y.changeBp)}</td>
                <td className="n" data-year={y.year} data-contribution>
                  {y.contributionBp === null ? '–' : pp(y.contributionBp)}
                </td>
              </Fragment>
            ))
          ) : (
            <>
              <td>
                {b.source === 'cpi'
                  ? `VPI-Teilindex ${b.coicopLabel}, mit deinem Gewicht`
                  : b.source === 'trailing'
                    ? '12-Monats-Mittel, enthält Verbrauch und Nachzahlungen'
                    : b.source === 'bookings'
                      ? 'aus Buchungen abgeleitet'
                      : 'gespeichert'}
              </td>
              <td>{bpText(b.shareBp)}</td>
              <td>{basketPrice(b, b.baseCents)}</td>
              <td>{basketPrice(b, b.nowCents)}</td>
              <td>{bpText(b.changeBp, { sign: true })}</td>
              <td>{pp(b.contributionBp)}</td>
            </>
          )}
        </tr>
      ))}
    </>
  );
}
const DEFINITIONS = {
  Pp: 'Prozentpunkte – Differenz zweier Prozentwerte, z. B. 5,7 % − 3,2 % = 2,5 Pp',
  VPI: 'Verbraucherpreisindex – Preisentwicklung eines allgemeinen Warenkorbs von Statistik Austria.',
  Index:
    'Preisindex – die Preisentwicklung relativ zum ersten Monat mit Daten; dort ist der Wert 100.',
};
function Term({ term }: { term: keyof typeof DEFINITIONS }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="sr-term"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {term}
      </button>
      <span role="tooltip" id={id} hidden={!open}>
        {DEFINITIONS[term]}
      </span>
    </span>
  );
}
