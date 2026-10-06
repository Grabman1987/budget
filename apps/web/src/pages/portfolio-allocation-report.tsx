import { chartPoints, chartPercent } from '../charts/tooltip-data';
import { Fragment } from 'react';
import { useAmountPrivacy, ChartSvg, Graticule, LineLegend, type GraticuleLine } from '@budget/ui';
import type { AllocationGroup, AllocationHistory, AllocationReport } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useElementWidth } from '../charts/use-element-width';
import { request } from '../api/http';
import { LoadingNote } from '../ledger/states';
import { type WithValuationNotes } from '../ledger/valuation-hint';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import { Term } from '../reports/term';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from './placeholder-page';
import {
  DecisionLink,
  ProductLink,
  ReportUnavailable,
  bpText,
  percentText,
} from './portfolio-report-shared';
import './portfolio-allocation-report.css';
import { BookRuleMetric } from '../rules/book-rule-metric';
import { AppLink } from '../shell/app-link';

interface AllocationResponse extends WithValuationNotes {
  allocation: AllocationReport;
}

const allocationQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'portfolio-allocation-report'],
  retry: false,
  queryFn: () => request<AllocationResponse>('GET', '/api/portfolio/allocation-report'),
});

/** Ink families of the blueprint: solid ink, 60 % ink, 38 % ink, outlined tint (never red or green). */
const INKS = ['pk-1', 'pk-2', 'pk-3', 'pk-4', 'pk-5', 'pk-6', 'pk-7', 'pk-8'] as const;
const inkOf = (index: number) => INKS[index % INKS.length] as (typeof INKS)[number];

export function PortfolioAllocationReport({
  report,
  meta,
}: {
  report: ReportEntry;
  meta: PageMeta;
}) {
  useAmountPrivacy();
  const query = useQuery(allocationQuery);
  const data = query.data?.allocation;
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : data
            ? data.history
              ? `${longDay(data.history.dates[0] as string)} bis ${longDay(data.asOf)}`
              : `Stand ${longDay(data.asOf)}`
            : 'wird geladen'
      }
    >
      <div className="prep portfolio-allocation-report">
        <BookRuleMetric code="R21" />
        {query.isPending && <LoadingNote what="Allocation" />}
        {query.isError && (
          <ReportUnavailable
            what="Die Allocation"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {data && !query.isError && data.classes.length === 0 && (
          <p className="prep-empty" role="status">
            Es sind keine Wertpapierpositionen offen. Eine Verteilung wird nicht angenommen.
          </p>
        )}
        {data && !query.isError && data.classes.length > 0 && <AllocationBody data={data} />}
      </div>
    </PageFrame>
  );
}

function AllocationBody({ data }: { data: AllocationReport }) {
  useAmountPrivacy();
  return (
    <>
      <section className="prep-card" aria-labelledby="alloc-title">
        <div className="tbd-head">
          <h2 id="alloc-title">
            <Term>Allokation</Term> · Woraus das Portfolio besteht
          </h2>
          <DecisionLink />
        </div>
        {data.classifiedCents > 0 && (
          <div className="sb-composition">
            <figure className="sb-fig">
              <Sunburst
                date={data.asOf}
                testId="sunburst-classes"
                title="Portfolio"
                totalCents={data.classifiedCents}
                label={`Sonnendiagramm: innen Gruppe, außen Anlageklasse. ${data.compositionGroups
                  .map((c) => `${c.name} ${bpText(c.shareBp)}`)
                  .join(', ')}.`}
                groups={data.compositionGroups
                  .filter((g) => g.valueCents > 0)
                  .map((c) => ({
                    name: c.name,
                    ink: `alloc-ink ${inkOf(data.compositionGroups.indexOf(c))}`,
                    valueCents: c.valueCents,
                    shareBp: c.shareBp,
                    portfolioShareBp: c.portfolioShareBp,
                    targetBp: c.targetBp,
                    targetComplete: c.targetComplete,
                    kids: c.classes
                      .filter((cls) => cls.valueCents > 0)
                      .map((cls) => ({
                        name: cls.name,
                        valueCents: cls.valueCents,
                        shareBp: cls.shareBp,
                        portfolioShareBp: cls.portfolioShareBp,
                        targetBp: cls.targetBp,
                      })),
                  }))}
              />
              <figcaption>
                Innen Gruppe, außen Anlageklasse. Produkte stehen in der Stückliste.
              </figcaption>
            </figure>
            <CompositionLegend groups={data.compositionGroups} />
          </div>
        )}
        {data.classifiedCents === 0 && <CompositionLegend groups={data.compositionGroups} />}
        <ClassTable groups={data.compositionGroups} totalCents={data.classifiedCents} />
        <RegionTable data={data} />
      </section>
      <section className="prep-card" aria-labelledby="alloc-soll-title">
        <div className="tbd-head">
          <h2 id="alloc-soll-title">Soll und Ist über die Zeit</h2>
        </div>
        {data.history ? (
          <SollIstChart
            history={data.history}
            order={data.compositionClasses.map((c) => c.assetClassId)}
          />
        ) : (
          <p className="prep-empty" role="status">
            Für den Verlauf liegt keine bewertbare Historie vor.
          </p>
        )}
        <p className="vnote">
          100 % = positiver klassifizierter Marktwert ({eur(data.classifiedCents)}). Cash,
          unklassifizierte und negative Positionen bilden keine Schicht. R13 verwendet weiterhin das
          gesamte Anlageuniversum einschließlich signiertem Cash.
        </p>
        {data.separatePositions.length > 0 && (
          <div
            className="prep-scroll"
            role="region"
            aria-label="Separate Positionen"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard scrolling for wide money/name columns.
            tabIndex={0}
          >
            <table className="prep-table" data-testid="allocation-separate">
              <caption>Positionen außerhalb der Schichten</caption>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Einordnung</th>
                  <th className="n">Wert</th>
                </tr>
              </thead>
              <tbody>
                {data.separatePositions.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td>{p.reason}</td>
                    <td className="n">{eur(p.valueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="vnote" role="status">
          {data.quality.confidence === 'provisional'
            ? 'Vorläufig: Klassifikation und Bewertung prüfen.'
            : 'Bewertung und Klassifikation vollständig.'}{' '}
          Unklassifiziert:{' '}
          {data.quality.unclassifiedValueCents === null
            ? 'Wert nicht verfügbar'
            : eur(data.quality.unclassifiedValueCents)}{' '}
          · {data.quality.unclassifiedProductCount} Produkte / Cash-Positionen ·{' '}
          {data.quality.unclassifiedShareBp === null
            ? 'Anteil nicht verfügbar'
            : 'in separaten Positionen'}
          .
        </p>
        <SollTable data={data} />
        <p className="vnote">
          Soll und Band stellst du in den Einstellungen ein; ob und wie umgeschichtet wird,
          entscheidest du unter Vermögen › Portfolio. Dieser Report zeigt nur, wie sich die
          Verteilung entwickelt hat. Das Soll gilt jeweils ab dem Datum seiner Version.
        </p>
      </section>
    </>
  );
}

// ---------- sunburst: inner ring and outer ring as ink arcs ----------

interface SbKid {
  name: string;
  valueCents: number;
  shareBp: number;
  portfolioShareBp: number;
  targetBp: number | null;
}
interface SbGroup extends SbKid {
  targetComplete: boolean;
  ink: string;
  kids: SbKid[];
}

const TAU = Math.PI * 2;
const point = (cx: number, cy: number, r: number, a: number) =>
  [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;

/** One ring segment; a full circle is drawn as two halves with an even-odd hole. */
function ringPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  if (a1 - a0 >= TAU - 1e-6) {
    const ring = (r: number, sweep: 0 | 1) => {
      const [x0, y0] = point(cx, cy, r, 0);
      const [x1, y1] = point(cx, cy, r, Math.PI);
      return `M${x0},${y0} A${r},${r} 0 1 ${sweep} ${x1},${y1} A${r},${r} 0 1 ${sweep} ${x0},${y0} Z`;
    };
    return `${ring(r1, 1)} ${ring(r0, 0)}`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = point(cx, cy, r1, a0);
  const [x1, y1] = point(cx, cy, r1, a1);
  const [x2, y2] = point(cx, cy, r0, a1);
  const [x3, y3] = point(cx, cy, r0, a0);
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
}

/** Angles of every group and its classes (pure, in order). */
function layoutSunburst(groups: SbGroup[], total: number) {
  let angle = 0;
  return groups.map((group) => {
    const a0 = angle;
    const a1 = a0 + (group.valueCents / total) * TAU;
    angle = a1;
    let inner = a0;
    const kids = group.kids.map((kid) => {
      const b0 = inner;
      inner = b0 + (kid.valueCents / total) * TAU;
      return { kid, b0, b1: inner };
    });
    return { group, a0, a1, kids };
  });
}

function Sunburst({
  groups,
  totalCents,
  title,
  label,
  testId,
  date,
}: {
  groups: SbGroup[];
  totalCents: number;
  title: string;
  label: string;
  testId: string;
  date: string;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const size = Math.max(0, Math.min(width, 500));
  const cx = size / 2;
  const cy = size / 2;
  const r = [size * 0.14, size * 0.34, size / 2 - 3];
  const total = Math.max(1, totalCents);
  const layout = layoutSunburst(groups, total);
  const sectors = layout.flatMap(({ group, kids }) => [
    { ...group, within: 1, ink: group.ink, source: group },
    ...kids.map(({ kid }) => ({
      ...kid,
      within: kid.valueCents / group.valueCents,
      ink: group.ink + ' sb-out',
      source: kid,
    })),
  ]);
  return (
    <div className="sunburst" ref={ref}>
      {size > 0 && (
        <ChartSvg
          width={size}
          height={size}
          label={label}
          testId={testId}
          crosshair={false}
          points={sectors.map((s) => ({
            x: cx,
            date,
            series: [
              { name: s.name, value: eur(s.valueCents), className: `sb-arc ${s.ink}` },
              {
                name: 'Anteil am Portfolio',
                value: bpText(s.portfolioShareBp),
                className: `sb-arc ${s.ink}`,
              },
              {
                name: 'Anteil innerhalb der Gruppe',
                value: percentText(s.within, { digits: 2 }),
                className: `sb-arc ${s.ink}`,
              },
              ...(s.targetBp === null
                ? []
                : [
                    {
                      name: 'Soll · Portfolio',
                      value: bpText(s.targetBp),
                      className: `sb-arc ${s.ink}`,
                    },
                  ]),
            ],
          }))}
        >
          {layout.map(({ group, a0, a1, kids }) => {
            const mid = (a0 + a1) / 2;
            const [lx, ly] = point(cx, cy, ((r[0] as number) + (r[1] as number)) / 2, mid);
            return (
              <g key={group.name}>
                <path
                  d={ringPath(cx, cy, r[0] as number, (r[1] as number) - 1.5, a0, a1)}
                  className={`sb-arc ${group.ink}`}
                  data-chart-point={sectors.findIndex((s) => s.source === group)}
                  fillRule="evenodd"
                >
                  <title>{`${group.name}: ${eur(group.valueCents)} · Portfolio ${bpText(group.portfolioShareBp)} · innerhalb der Gruppe 100 %${group.targetBp === null ? (group.targetComplete ? '' : ' · Soll teilweise') : ` · Soll ${bpText(group.targetBp)}`}`}</title>
                </path>
                {group.shareBp >= 600 &&
                  group.name.length * 6 < Math.min(size * 0.22, (a1 - a0) * size * 0.24) && (
                    <text
                      x={lx}
                      y={ly + 4}
                      textAnchor="middle"
                      className={`svg-label-strong sb-lbl sb-lbl-inv ${group.ink}`}
                    >
                      {group.name}
                    </text>
                  )}
                {kids.map(({ kid, b0, b1 }) => {
                  const [kx, ky] = point(
                    cx,
                    cy,
                    ((r[1] as number) + (r[2] as number)) / 2,
                    (b0 + b1) / 2,
                  );
                  return (
                    <g key={`${group.name}-${kid.name}`}>
                      <path
                        key={`${group.name}-${kid.name}`}
                        d={ringPath(cx, cy, r[1] as number, r[2] as number, b0, b1)}
                        className={`sb-arc sb-out ${group.ink}`}
                        data-chart-point={sectors.findIndex((s) => s.source === kid)}
                        fillRule="evenodd"
                      >
                        <title>{`${kid.name}: ${eur(kid.valueCents)} · Portfolio ${bpText(kid.portfolioShareBp)} · innerhalb der Gruppe ${percentText(kid.valueCents / group.valueCents)}${kid.targetBp === null ? '' : ` · Soll ${bpText(kid.targetBp)}`}`}</title>
                      </path>
                      {kid.shareBp >= 600 &&
                        kid.name.length * 6 < Math.min(size * 0.15, (b1 - b0) * size * 0.42) && (
                          <text
                            x={kx}
                            y={ky + 4}
                            textAnchor="middle"
                            className={`svg-label-strong sb-lbl sb-out ${group.ink}`}
                          >
                            {kid.name}
                          </text>
                        )}
                    </g>
                  );
                })}
              </g>
            );
          })}
          <text x={cx} y={cy - 2} textAnchor="middle" className="svg-label">
            {title}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="svg-label-strong">
            {eur(totalCents)}
          </text>
        </ChartSvg>
      )}
    </div>
  );
}

// ---------- tables ----------

function CompositionLegend({ groups }: { groups: AllocationGroup[] }) {
  return (
    <div className="composition-legend" aria-label="Gruppen und Anlageklassen">
      <p className="prep-muted">Anteile am klassifizierten Marktwert</p>
      {groups.map((g, i) => (
        <div key={g.assetClassId} className={`alloc-ink ${inkOf(i)}`}>
          <div className="composition-line is-group">
            <span>
              <i
                className={`prep-swatch${g.valueCents === 0 ? ' is-empty' : ''}`}
                aria-hidden="true"
              />
              {g.name}
            </span>
            <strong>{eur(g.valueCents)}</strong>
            <span>{bpText(g.shareBp)}</span>
          </div>
          {g.classes.map((c) => (
            <div key={c.assetClassId} className="composition-line is-class">
              <span>
                <i
                  className={`prep-swatch sb-out${c.valueCents === 0 ? ' is-empty' : ''}`}
                  aria-hidden="true"
                />
                {c.name}
                {c.valueCents === 0 && c.targetBp !== null && (
                  <small className="unheld-target">0 € von Soll {bpText(c.targetBp)}</small>
                )}
              </span>
              <span>{eur(c.valueCents)}</span>
              <span>{bpText(c.shareBp)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ClassTable({ groups, totalCents }: { groups: AllocationGroup[]; totalCents: number }) {
  useAmountPrivacy();
  return (
    <div
      className="prep-scroll"
      role="region"
      aria-label="Klassen und Produkte, bei Bedarf horizontal verschiebbar"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the wide table.
      tabIndex={0}
    >
      <table className="prep-table alloc-table">
        <thead>
          <tr>
            <th className="tech">Gruppe › Klasse › Produkt</th>
            <th className="tech">Depot</th>
            <th className="tech n">Wert</th>
            <th className="tech n">Anteil · klassifiziert</th>
            <th className="tech n">Ist · Portfolio</th>
            <th className="tech n">Soll</th>
            <th className="tech n">Abweichung</th>
            <th className="tech n">12 Monate</th>
          </tr>
        </thead>
        {groups.map((g, i) => (
          <tbody key={g.assetClassId} className={`alloc-ink ${inkOf(i)}`}>
            <tr className="is-group">
              <td>
                <i className="prep-swatch" aria-hidden="true" />
                {g.name}
              </td>
              <td />
              <td className="n">{eur(g.valueCents)}</td>
              <td className="n">{bpText(g.shareBp)}</td>
              <td className="n">{bpText(g.portfolioShareBp)}</td>
              <td className="n">
                {g.targetBp !== null ? (
                  bpText(g.targetBp)
                ) : g.targetComplete ? (
                  '–'
                ) : (
                  <span title="Nicht alle Klassen haben ein Soll">teilweise</span>
                )}
              </td>
              <td className="n">
                {g.deviationBp === null ? '–' : bpText(g.deviationBp, { sign: true })}
              </td>
              <td />
            </tr>
            {g.classes.map((c) => (
              <Fragment key={c.assetClassId}>
                <tr className="is-class">
                  <td className="indent">
                    <i
                      className={`prep-swatch sb-out${c.valueCents === 0 ? ' is-empty' : ''}`}
                      aria-hidden="true"
                    />
                    {c.name}
                  </td>
                  <td />
                  <td className="n">{eur(c.valueCents)}</td>
                  <td className="n">{bpText(c.shareBp)}</td>
                  <td className="n">{bpText(c.portfolioShareBp)}</td>
                  <td className="n">{c.targetBp === null ? '–' : bpText(c.targetBp)}</td>
                  <td className="n">
                    {c.deviationBp === null ? '–' : bpText(c.deviationBp, { sign: true })}
                  </td>
                  <td />
                </tr>
                {c.products.map((p) => (
                  <tr key={p.securityId}>
                    <td className="product-indent">
                      {p.securityId.startsWith('cash:') ? (
                        p.name
                      ) : (
                        <ProductLink id={p.securityId}>{p.name}</ProductLink>
                      )}
                      {c.assignedSecurities?.some(
                        (s) => s.securityId === p.securityId && s.kind === 'other',
                      ) && (
                        <small className="allocation-kind-hint">
                          Typ „Sonstiges“ prüfen · im Wertpapier bearbeiten
                        </small>
                      )}
                    </td>
                    <td className="prep-muted">{p.depots.join(', ')}</td>
                    <td className="n">{eur(p.valueCents)}</td>
                    <td className="n">{bpText(p.shareBp)}</td>
                    <td />
                    <td />
                    <td />
                    <td className="n">{percentText(p.ttwror12, { sign: true })}</td>
                  </tr>
                ))}
                {c.assignedSecurities
                  ?.filter((s) => !s.held)
                  .map((s) => (
                    <tr key={`unheld:${s.securityId}`} className="allocation-unheld">
                      <td className="product-indent" colSpan={8}>
                        <ProductLink id={s.securityId}>{s.name}</ProductLink>
                        <small>{s.isin ?? 'ISIN nicht hinterlegt'} · noch nicht gekauft</small>
                        {s.kind === 'other' && (
                          <small>Typ „Sonstiges“ prüfen · im Wertpapier bearbeiten</small>
                        )}
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr className="is-total">
            <td>Klassifizierter Marktwert</td>
            <td />
            <td className="n" data-testid="alloc-total">
              {eur(totalCents)}
            </td>
            <td className="n">{totalCents > 0 ? '100,0 %' : '–'}</td>
            <td />
            <td />
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function RegionTable({ data }: { data: AllocationReport }) {
  useAmountPrivacy();
  if (!data.regionsAvailable)
    return (
      <p className="vnote alloc-regions">
        Regionen: für die meisten Produkte keine Länderanteile hinterlegt{' '}
        <AppLink
          to="/einstellungen/anlageklassen"
          search={() => ({
            panel: 'instrument',
            instrument: data.regionEditSecurityId ?? undefined,
          })}
          state={{ panelOpenedInApp: true }}
        >
          Länderanteile bearbeiten
        </AppLink>
      </p>
    );
  return (
    <div
      className="prep-scroll alloc-regions"
      role="region"
      aria-label="Regionen, bei Bedarf horizontal verschiebbar"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the wide table.
      tabIndex={0}
    >
      <table className="prep-table">
        <caption className="sr-only">Regionen</caption>
        <thead>
          <tr>
            <th className="tech">Region</th>
            <th className="tech n">Wert</th>
            <th className="tech n">Anteil</th>
            <th className="tech">Produkte</th>
          </tr>
        </thead>
        <tbody>
          {data.compositionRegions.map((r) => (
            <tr key={r.region ?? 'none'}>
              <td>{r.region ?? 'Ohne Regionsangabe'}</td>
              <td className="n">{eur(r.valueCents)}</td>
              <td className="n">{bpText(r.shareBp)}</td>
              <td className="prep-muted">{r.products.map((p) => p.name).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SollTable({ data }: { data: AllocationReport }) {
  useAmountPrivacy();
  const spec = data.speculative;
  return (
    <>
      <div
        className="prep-scroll"
        role="region"
        aria-label="Soll und Ist, bei Bedarf horizontal verschiebbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the wide table.
        tabIndex={0}
      >
        <table className="prep-table" data-testid="soll-table">
          <thead>
            <tr>
              <th className="tech">Klasse</th>
              <th className="tech n">Soll</th>
              <th className="tech n">Ist · Schichten</th>
              <th className="tech n">Ist · R13</th>
              <th className="tech n">Abweichung</th>
              <th className="tech">Regel</th>
            </tr>
          </thead>
          <tbody>
            {data.classes.map((c) => (
              <tr key={c.assetClassId ?? 'none'}>
                <td>{c.name}</td>
                <td className="n">{c.targetBp === null ? '–' : bpText(c.targetBp)}</td>
                <td className="n">
                  <strong>
                    {data.compositionClasses.find((r) => r.assetClassId === c.assetClassId)
                      ? bpText(
                          data.compositionClasses.find((r) => r.assetClassId === c.assetClassId)!
                            .shareBp,
                        )
                      : '–'}
                  </strong>
                </td>
                <td className="n">{c.valueCents < 0 ? eur(c.valueCents) : bpText(c.shareBp)}</td>
                <td className={`n${c.breach && c.confidence === 'exact' ? ' prep-bad' : ''}`}>
                  {c.deviationBp === null ? '–' : `${bpText(c.deviationBp, { sign: true })}`}
                </td>
                <td>
                  {c.targetBp === null ? (
                    <span className="prep-muted">kein Soll hinterlegt</span>
                  ) : c.breach ? (
                    <span className={`alloc-status${c.confidence === 'exact' ? ' is-out' : ''}`}>
                      <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
                      {c.confidence === 'provisional' ? 'vorläufig ' : ''}außerhalb des Bands (R13,
                      ±{bpText(c.bandBp ?? 0)})
                    </span>
                  ) : (
                    <span className="alloc-status">
                      <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
                      im Band (±{bpText(c.bandBp ?? 0)})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="vnote" data-testid="speculative-note">
        Spekulative Bruttoexposure (einschließlich gehebelter ETF) / Marktwert:{' '}
        {bpText(spec.shareBp)} bei höchstens {bpText(spec.limitBp)} (R15)
        {data.quality.confidence === 'provisional'
          ? ', vorläufig.'
          : spec.breach
            ? ', überschritten.'
            : ', eingehalten.'}
      </p>
    </>
  );
}

// ---------- Soll and Ist over time ----------

function SollIstChart({
  history,
  order,
}: {
  history: AllocationHistory;
  order: Array<string | null>;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  // Days before the first value have no shares.
  const first = history.classifiedCents.findIndex((v) => v > 0);
  if (first < 0) return null;
  const dates = history.dates.slice(first);
  // Same order and ink as the class table above.
  const rank = (id: string | null) => {
    const i = order.indexOf(id);
    return i < 0 ? order.length : i;
  };
  const classes = history.classes
    .filter((c) => c.assetClassId !== null)
    .sort((a, b) => rank(a.assetClassId) - rank(b.assetClassId))
    .map((c) => ({
      ...c,
      istBp: c.chartBp.slice(first),
      targetBp: c.targetBp.slice(first),
      bandBp: c.bandBp.slice(first),
      breach: c.breach.slice(first),
    }));
  const height = 280;
  const left = 48;
  const right = Math.max(left + 1, width - 12);
  const top = 12;
  const bottom = height - 26;
  const t0 = Date.parse(`${dates[0]}T00:00:00Z`);
  const span = Math.max(1, Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) - t0);
  const x = (day: string) => left + ((Date.parse(`${day}T00:00:00Z`) - t0) / span) * (right - left);
  const y = (bp: number) => bottom - (bp / 10_000) * (bottom - top);
  const f = (n: number) => n.toFixed(1);

  const stacked = classes.map((_, ci) =>
    dates.map((__, i) => classes.slice(0, ci + 1).reduce((a, c) => a + (c.istBp[i] as number), 0)),
  );
  const areas = classes.map((c, ci) => {
    const above = stacked[ci] as number[];
    const below = ci === 0 ? dates.map(() => 0) : (stacked[ci - 1] as number[]);
    const upper = above.map((v, i) => `${i ? 'L' : 'M'}${f(x(dates[i] as string))},${f(y(v))}`);
    const lower = below.map((v, i) => `L${f(x(dates[i] as string))},${f(y(v))}`).reverse();
    const d = `${upper.join(' ')} ${lower.join(' ')} Z`;
    return { d, ink: inkOf(ci), name: c.name, end: c.istBp[c.istBp.length - 1] as number };
  });

  // Soll limits: the running sum of the targets, drawn only where every class below has a Soll.
  const limits = classes.map((_, ci) => {
    const segments: string[] = [];
    let current: string[] = [];
    dates.forEach((date, i) => {
      const parts = classes.slice(0, ci + 1).map((c) => c.targetBp[i] as number | null);
      if (parts.some((p) => p === null)) {
        if (current.length) segments.push(current.join(' '));
        current = [];
        return;
      }
      const sum = parts.reduce<number>((a, p) => a + (p as number), 0);
      current.push(`${current.length ? 'L' : 'M'}${f(x(date))},${f(y(sum))}`);
    });
    if (current.length) segments.push(current.join(' '));
    return segments;
  });
  const bands = classes.map((c, ci) =>
    dates.flatMap((date, i) => {
      const parts = classes.slice(0, ci + 1).map((r) => r.targetBp[i]);
      if (parts.some((p) => p == null) || c.bandBp[i] == null) return [];
      const sum = parts.reduce<number>((a, p) => a + p!, 0),
        band = c.bandBp[i]!;
      const x0 = x(date),
        x1 = x(dates[i + 1] ?? date);
      return [
        {
          x: x0,
          y: y(Math.min(10000, sum + band)),
          width: Math.max(1, x1 - x0),
          height: y(Math.max(0, sum - band)) - y(Math.min(10000, sum + band)),
          ink: inkOf(ci),
        },
      ];
    }),
  );
  const hasSoll = bands.some((s) => s.length > 0);
  const step = Math.ceil(dates.length / (width < 420 ? 2 : width < 640 ? 3 : 6));
  const tickIndexes = [
    ...Array.from({ length: Math.ceil((dates.length - 1) / step) }, (_, k) => k * step).filter(
      (i) => i < dates.length - 1 - step / 2,
    ),
    dates.length - 1,
  ];
  const tickLabel = (i: number) =>
    i === 0 || i === dates.length - 1
      ? longDay(dates[i] as string)
      : `${(dates[i] as string).slice(5, 7)}.${(dates[i] as string).slice(0, 4)}`;
  const lines: GraticuleLine[] = [0, 2_500, 5_000, 7_500, 10_000].map((bp) => ({
    y: y(bp),
    label: `${bp / 100} %`,
  }));
  const summary = areas.map((a) => `${a.name} ${bpText(a.end)}`).join(', ');
  return (
    <div ref={ref} className="alloc-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          label={`Anteile der Anlageklassen je Monatsende von ${longDay(dates[0] as string)} bis ${longDay(dates[dates.length - 1] as string)}, Soll gestrichelt. Zuletzt: ${summary}.`}
          testId="soll-ist-chart"
          points={chartPoints(
            dates,
            (i) => x(dates[i]!),
            classes.flatMap((c, i) => [
              {
                name: c.name,
                values: c.istBp,
                className: `area ${inkOf(i)}`,
                format: chartPercent,
              },
              {
                name: `${c.name} · Soll`,
                values: c.targetBp,
                color: 'var(--line-2)',
                format: chartPercent,
              },
            ]),
          )}
        >
          <Graticule x1={left} x2={right} lines={lines} />
          {areas.map((a) => (
            <path key={a.name} d={a.d} className={`area ${a.ink}`}>
              <title>{`${a.name}: zuletzt ${bpText(a.end)}`}</title>
            </path>
          ))}
          {bands.flat().map((b, i) => (
            <rect
              key={`band-${i}`}
              {...{ x: b.x, y: b.y, width: b.width, height: b.height }}
              className={`alloc-band ${b.ink}`}
            />
          ))}
          {limits.flat().map((d, i) => (
            <path key={i} d={d} className="l-plan alloc-limit" />
          ))}
          {tickIndexes.map((i) => (
            <text
              key={dates[i]}
              x={x(dates[i] as string)}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}
              className="svg-label"
            >
              {tickLabel(i)}
            </text>
          ))}
        </ChartSvg>
      )}
      <ul className="chart-legend alloc-legend">
        {areas.map((a, i) => (
          <li key={a.name}>
            <i className={`prep-swatch ${a.ink}`} aria-hidden="true" />
            {a.name}
            {classes[i]?.targetBp.at(-1) != null ? (
              <> · Soll heute {bpText(classes[i]?.targetBp.at(-1) as number)}</>
            ) : null}
          </li>
        ))}
      </ul>
      {hasSoll && (
        <LineLegend
          items={[{ kind: 'plan', label: 'Soll-Grenzen mit Band (Summe der Sollanteile)' }]}
        />
      )}
      {!hasSoll && (
        <p className="vnote" role="status">
          Für diese Klassen ist kein Soll hinterlegt; es werden keine Soll-Grenzen gezeichnet.
        </p>
      )}
    </div>
  );
}
