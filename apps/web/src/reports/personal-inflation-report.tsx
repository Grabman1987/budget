import {
  useAmountPrivacy,
  AxisLine,
  ChartSvg,
  ClassSwatch,
  Graticule,
  Line,
  LineLegend,
  XTicks,
} from '@budget/ui';
import type { InflationReport } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { longDay, MINUS } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { bpText, monthShort, ReportQuery, ScrollRegion } from './spending-shared';

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

/** 2.4 Persönliche Inflation: Wie stark steigen unsere Preise? */
export function PersonalInflationReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const query = useQuery(inflationQuery);
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
            ? data.points.length
              ? `${monthShort(data.baseMonth as string)} bis ${monthShort(data.toMonth as string)}`
              : 'weniger als 13 Monate'
            : 'wird geladen'
      }
      reportStand={{ label: 'Stichtag', value: 'Monatsende' }}
    >
      <div className="kview sr" data-testid="personal-inflation">
        <ReportQuery query={query} what="Persönliche Inflation">
          {(result) => <Body data={result} />}
        </ReportQuery>
      </div>
    </PageFrame>
  );
}

function Body({ data }: { data: InflationReport }) {
  useAmountPrivacy();
  if (data.status !== 'ok')
    return (
      <section className="sr-card sr-wide" aria-labelledby="pi-empty">
        <div className="sr-head">
          <h2 id="pi-empty">Noch kein Preisindex</h2>
        </div>
        <p className="sr-empty" role="status" data-testid="pi-empty-reason">
          {data.insufficientReason === 'months'
            ? 'Für eine Teuerung über zwölf Monate braucht der Report mindestens 13 geschlossene Monate.'
            : 'Für den eigenen Warenkorb braucht der Report Fixkosten mit Preis und Ausgaben im ersten Jahr der Aufzeichnung: eine erwartete Zahlung braucht dafür eine Preisversion, die in diesem Zeitraum beginnt.'}
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
            {data.latestComparison
              ? `VPI ${bpText(data.latestComparison.referenceBp, { sign: true })} · Differenz ${num1.format(data.latestComparison.differenceBp / 100)} Pp (${monthShort(data.latestComparison.month)})`
              : data.referenceAvailable
                ? 'VPI-Reihe ohne Überschneidung'
                : 'kein Verbraucherpreisindex gespeichert'}
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
        <LineLegend items={[{ kind: 'actual', label: 'Eigener Warenkorb (Index, Start = 100)' }]} />
        {data.reference ? (
          <p className="sr-note">
            {data.reference.source === 'fixture'
              ? 'Synthetische Beispielreihe statt VPI (Entwicklungsdaten).'
              : data.reference.lastMonth >= '2026-01'
                ? 'Verbraucherpreisindex: Statistik Austria, VPI Basis 2020 (bis Dez 2025) und VPI Basis 2025 (ab Jän 2026), beide Open Data, CC BY 4.0. Die Basis 2025 ist über den Jahresdurchschnitt 2025 auf die Basis 2020 verkettet.'
                : 'Verbraucherpreisindex: Statistik Austria, VPI Basis 2020 (Open Data, CC BY 4.0).'}{' '}
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
        <ol className="sr-steps">
          <li>
            <strong>Warenkorb</strong> = Fixkosten mit gespeichertem Preis (Verträge und Abos), im
            Index mit den Ausgaben des ersten Jahres gewichtet. Er deckt{' '}
            {data.coverageBp === null ? '–' : bpText(data.coverageBp, { digits: 0 })} des Konsums
            dieses Jahres ({data.basketItems} Positionen).
          </li>
          <li>
            <strong>Preise</strong> sind die Preisversionen der erwarteten Zahlungen, je Monat in
            Euro (Fremdwährung mit dem gespeicherten Kurs).
            {data.derivedContracts.length > 0 && (
              <span data-testid="pi-derived">
                {' '}
                Ohne gespeicherten Preisverlauf aus Buchungen abgeleitet:{' '}
                {data.derivedContracts.map((c) => c.name).join(', ')}.
              </span>
            )}
          </li>
          <li>
            <strong>Variable Kategorien</strong> ({data.excludedCategories} Kategorien in Bedarf und
            Wunsch ohne Preisreihe) fehlen: Menge und Preis lassen sich dort nicht trennen.
          </li>
          <li>
            <strong>Beitrag</strong> = Gewicht des Vorjahres × Preisänderung, in Prozentpunkten.
          </li>
        </ol>
      </section>

      {data.referenceAvailable && (
        <>
          <section className="sr-card sr-wide" aria-labelledby="pi-monthly">
            <div className="sr-head">
              <h2 id="pi-monthly">Teuerung je Monat gegen den VPI</h2>
              <span className="sr-state">Veränderung zum Vorjahresmonat</span>
            </div>
            <MonthlyChart data={data} />
            <LineLegend
              items={[
                { kind: 'actual', label: 'Eigener Warenkorb' },
                { kind: 'previous', label: 'Verbraucherpreisindex' },
              ]}
            />
            <ScrollRegion label="Teuerung je Monat, bei Bedarf horizontal verschiebbar">
              <table className="sr-table" data-testid="monthly-table">
                <caption className="sr-only">
                  Veränderung zum Vorjahresmonat: eigener Warenkorb und Verbraucherpreisindex
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Monat</th>
                    <th scope="col" className="n">
                      Eigen
                    </th>
                    <th scope="col" className="n">
                      VPI
                    </th>
                    <th scope="col" className="n">
                      Differenz
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.monthly].reverse().map((m) => (
                    <tr key={m.month}>
                      <th scope="row">{monthShort(m.month)}</th>
                      <td className="n">{bpText(m.ownBp, { sign: true })}</td>
                      <td className="n">
                        {m.referenceBp === null ? '–' : bpText(m.referenceBp, { sign: true })}
                      </td>
                      <td className="n">
                        {m.referenceBp === null ? '–' : `${pp(m.ownBp - m.referenceBp)} Pp`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <p className="sr-note">
              Ein Strich heißt: Der VPI reicht für diesen Monat oder das Vorjahr nicht. Die
              Differenz ist die eigene Teuerung minus VPI in Prozentpunkten.
            </p>
          </section>

          <section className="sr-card sr-wide" aria-labelledby="pi-yearly">
            <div className="sr-head">
              <h2 id="pi-yearly">Je Kalenderjahr, Jahresdurchschnitte</h2>
              <span className="sr-state">Index: erster Monat = 100</span>
            </div>
            <ScrollRegion label="Jahresdurchschnitte, bei Bedarf horizontal verschiebbar">
              <table className="sr-table" data-testid="yearly-table">
                <caption className="sr-only">
                  Durchschnittlicher Index und Veränderung zum Vorjahr je Kalenderjahr
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Jahr</th>
                    <th scope="col" className="n">
                      Ø Eigen
                    </th>
                    <th scope="col" className="n">
                      Ø VPI
                    </th>
                    <th scope="col" className="n">
                      Eigen zum Vorjahr
                    </th>
                    <th scope="col" className="n">
                      VPI zum Vorjahr
                    </th>
                    <th scope="col" className="n">
                      Differenz
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.years.map((y) => (
                    <tr key={y.year}>
                      <th scope="row">
                        {y.year}
                        {y.ownMonths < 12 || y.referenceMonths < 12 ? (
                          <small>
                            {y.ownMonths} Monate eigen, {y.referenceMonths} VPI
                          </small>
                        ) : null}
                      </th>
                      <td className="n">{y.ownAverage === null ? '–' : index1(y.ownAverage)}</td>
                      <td className="n">
                        {y.referenceAverage === null ? '–' : index1(y.referenceAverage)}
                      </td>
                      <td className="n">
                        {y.ownChangeBp === null ? '–' : bpText(y.ownChangeBp, { sign: true })}
                      </td>
                      <td className="n">
                        {y.referenceChangeBp === null
                          ? '–'
                          : bpText(y.referenceChangeBp, { sign: true })}
                      </td>
                      <td className="n">
                        {y.ownChangeBp === null || y.referenceChangeBp === null
                          ? '–'
                          : `${pp(y.ownChangeBp - y.referenceChangeBp)} Pp`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <p className="sr-note">
              Eine Veränderung zum Vorjahr gibt es nur zwischen zwei vollständigen Jahren; ein
              angeschnittenes Jahr zeigt den Durchschnitt der vorhandenen Monate.
            </p>
          </section>
        </>
      )}

      <section className="sr-card sr-wide" aria-labelledby="pi-contrib">
        <div className="sr-head">
          <h2 id="pi-contrib">Beitrag je Kategorie</h2>
          <span className="sr-state">Summe {pp(data.contributionSumBp)} Pp</span>
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
                  Pp
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
          Der Index gewichtet mit dem ersten Jahr der Aufzeichnung, die Beiträge mit dem Jahr vor
          dem Zeitfenster; beide Summen können deshalb um wenige Hundertstel Prozentpunkte
          abweichen.
        </p>
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

function IndexChart({ data }: { data: InflationReport }) {
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
        label={`Persönlicher Preisindex, ${monthShort(points[0]!.month)} gleich 100, zuletzt ${index1(lastPoint.index)}.`}
        testId="inflation-chart"
      >
        <Graticule x1={L} x2={W - R} lines={grid} />
        <AxisLine x1={L} x2={W - R} y={y(100)} dashed />
        {data.referenceBp !== null && (
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
