import { useAmountPrivacy, ChartSvg, Graticule, LineLegend, type GraticuleLine } from '@budget/ui';
import type { AllocationClass, AllocationHistory, AllocationReport } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useElementWidth } from '../charts/use-element-width';
import { request } from '../api/http';
import { LoadingNote } from '../ledger/states';
import { eur, eurWhole, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
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
import { TargetSetNote } from '../wealth/target-set';

interface AllocationResponse {
  allocation: AllocationReport;
}

const allocationQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'portfolio-allocation-report'],
  retry: false,
  queryFn: () => request<AllocationResponse>('GET', '/api/portfolio/allocation-report'),
});

/** Ink families of the blueprint: solid ink, 60 % ink, 38 % ink, outlined tint (never red or green). */
const INKS = ['pk-1', 'pk-2', 'pk-3', 'pk-4'] as const;
const inkOf = (index: number) => INKS[Math.min(index, INKS.length - 1)] as (typeof INKS)[number];

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
  const unassigned = data.regions.find((r) => r.region === null);
  return (
    <>
      <section className="prep-card" aria-labelledby="alloc-title">
        <div className="tbd-head">
          <h2 id="alloc-title">Woraus das Portfolio besteht</h2>
          <DecisionLink />
        </div>
        <div className="sb-pair">
          <figure className="sb-fig">
            <Sunburst
              testId="sunburst-classes"
              title="Klassen"
              totalCents={data.totalCents}
              label={`Sonnendiagramm: innen Anlageklasse, außen Produkt. ${data.classes
                .map((c) => `${c.name} ${bpText(c.shareBp)}`)
                .join(', ')}.`}
              groups={data.classes.map((c, i) => ({
                name: c.name,
                ink: inkOf(i),
                valueCents: c.valueCents,
                kids: c.products.map((p) => ({ name: p.name, valueCents: p.valueCents })),
              }))}
            />
            <figcaption>
              Innen Anlageklasse, außen Produkt. Die Tabelle nennt alle Werte.
            </figcaption>
          </figure>
          <figure className="sb-fig">
            <Sunburst
              testId="sunburst-regions"
              title="Regionen"
              totalCents={data.totalCents}
              label={`Sonnendiagramm: innen Region, außen Produkt. ${data.regions
                .map((r) => `${r.region ?? 'Ohne Regionsangabe'} ${bpText(r.shareBp)}`)
                .join(', ')}.`}
              groups={data.regions.map((r, i) => ({
                name: r.region ?? 'Ohne Angabe',
                ink: inkOf(i),
                valueCents: r.valueCents,
                kids: r.products.map((p) => ({ name: p.name, valueCents: p.valueCents })),
              }))}
            />
            <figcaption>
              Innen Region (nach gespeicherten Länderanteilen), außen Produkt.
              {unassigned
                ? ` Ohne Regionsangabe: ${unassigned.products.map((p) => p.name).join(', ')}.`
                : ''}
            </figcaption>
          </figure>
        </div>
        <ClassTable classes={data.classes} totalCents={data.totalCents} />
        <RegionTable data={data} />
      </section>
      <section className="prep-card" aria-labelledby="alloc-soll-title">
        <div className="tbd-head">
          <h2 id="alloc-soll-title">Soll und Ist über die Zeit</h2>
        </div>
        {data.history ? (
          <SollIstChart history={data.history} order={data.classes.map((c) => c.assetClassId)} />
        ) : (
          <p className="prep-empty" role="status">
            Für den Verlauf liegt keine bewertbare Historie vor.
          </p>
        )}
        <TargetSetNote set={data.targetSet} />
        <SollTable data={data} />
        <p className="vnote">
          Soll und Band stellst du in den Einstellungen ein; ob und wie umgeschichtet wird,
          entscheidest du unter Vermögen › Portfolio. Dieser Report zeigt nur, wie sich die
          Verteilung entwickelt hat. Das Soll gilt jeweils ab dem Datum seiner Version, bei Zielsets
          nach Anlagesumme gilt je Monatsende das Set der damaligen Anlagesumme.
        </p>
      </section>
    </>
  );
}

// ---------- sunburst: inner ring and outer ring as ink arcs ----------

interface SbKid {
  name: string;
  valueCents: number;
}
interface SbGroup {
  name: string;
  ink: string;
  valueCents: number;
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

/** Angles of every group and of the products inside it (pure, in order). */
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
}: {
  groups: SbGroup[];
  totalCents: number;
  title: string;
  label: string;
  testId: string;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const size = Math.max(0, Math.min(width, 380));
  const cx = size / 2;
  const cy = size / 2;
  const r = [size * 0.14, size * 0.34, size / 2 - 3];
  const total = Math.max(1, totalCents);
  const layout = layoutSunburst(groups, total);
  return (
    <div className="sunburst" ref={ref}>
      {size > 0 && (
        <ChartSvg width={size} height={size} label={label} testId={testId}>
          {layout.map(({ group, a0, a1, kids }) => {
            const mid = (a0 + a1) / 2;
            const [lx, ly] = point(cx, cy, ((r[0] as number) + (r[1] as number)) / 2, mid);
            return (
              <g key={group.name}>
                <path
                  d={ringPath(cx, cy, r[0] as number, (r[1] as number) - 1.5, a0, a1)}
                  className={`sb-arc ${group.ink}`}
                  fillRule="evenodd"
                >
                  <title>{`${group.name}: ${eurWhole(group.valueCents)} · ${percentText(group.valueCents / total)}`}</title>
                </path>
                {a1 - a0 > 0.55 && size > 260 && (
                  <text
                    x={lx}
                    y={ly + 4}
                    textAnchor="middle"
                    className={`svg-label-strong sb-lbl${group.ink === 'pk-1' ? ' sb-lbl-inv' : ''}`}
                  >
                    {group.name.length > 10 ? `${group.name.slice(0, 9)}…` : group.name}
                  </text>
                )}
                {kids.map(({ kid, b0, b1 }) => (
                  <path
                    key={`${group.name}-${kid.name}`}
                    d={ringPath(cx, cy, r[1] as number, r[2] as number, b0, b1)}
                    className={`sb-arc sb-out ${group.ink}`}
                    fillRule="evenodd"
                  >
                    <title>{`${kid.name}: ${eurWhole(kid.valueCents)} · ${percentText(kid.valueCents / total)}`}</title>
                  </path>
                ))}
              </g>
            );
          })}
          <text x={cx} y={cy - 2} textAnchor="middle" className="svg-label">
            {title}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="svg-label-strong">
            {eurWhole(totalCents)}
          </text>
        </ChartSvg>
      )}
    </div>
  );
}

// ---------- tables ----------

function ClassTable({ classes, totalCents }: { classes: AllocationClass[]; totalCents: number }) {
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
            <th className="tech">Klasse und Produkt</th>
            <th className="tech">Depot</th>
            <th className="tech n">Wert</th>
            <th className="tech n">Anteil</th>
            <th className="tech n">12 Monate</th>
          </tr>
        </thead>
        {classes.map((c, i) => (
          <tbody key={c.assetClassId ?? 'none'}>
            <tr className="is-group">
              <td>
                <i className={`prep-swatch ${inkOf(i)}`} aria-hidden="true" />
                {c.name}
              </td>
              <td />
              <td className="n">{eur(c.valueCents)}</td>
              <td className="n">{bpText(c.shareBp)}</td>
              <td />
            </tr>
            {c.products.map((p) => (
              <tr key={p.securityId}>
                <td className="indent">
                  <ProductLink id={p.securityId}>{p.name}</ProductLink>
                </td>
                <td className="prep-muted">{p.depots.join(', ')}</td>
                <td className="n">{eur(p.valueCents)}</td>
                <td className="n">{bpText(p.shareBp)}</td>
                <td className="n">{percentText(p.ttwror12, { sign: true })}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr className="is-total">
            <td>Portfolio</td>
            <td />
            <td className="n" data-testid="alloc-total">
              {eur(totalCents)}
            </td>
            <td className="n">100,0 %</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function RegionTable({ data }: { data: AllocationReport }) {
  useAmountPrivacy();
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
          {data.regions.map((r) => (
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
              <th className="tech n">Ist</th>
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
                  <strong>{bpText(c.shareBp)}</strong>
                </td>
                <td className={`n${c.breach ? ' prep-bad' : ''}`}>
                  {c.deviationBp === null ? '–' : `${bpText(c.deviationBp, { sign: true })}`}
                </td>
                <td>
                  {c.targetBp === null ? (
                    <span className="prep-muted">kein Soll hinterlegt</span>
                  ) : c.breach ? (
                    <span className="alloc-status is-out">
                      <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
                      außerhalb des Bands (R13, ±{bpText(c.bandBp ?? 0)})
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
        Spekulative Anteile gesamt (Krypto, P2P, Einzelaktien): {bpText(spec.shareBp)} bei höchstens{' '}
        {bpText(spec.limitBp)} (R15)
        {spec.breach ? ', überschritten.' : ', eingehalten.'}
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
  const first = history.totalCents.findIndex((v) => v > 0);
  if (first < 0) return null;
  const dates = history.dates.slice(first);
  // Same order and ink as the class table above.
  const rank = (id: string | null) => {
    const i = order.indexOf(id);
    return i < 0 ? order.length : i;
  };
  const classes = [...history.classes]
    .sort((a, b) => rank(a.assetClassId) - rank(b.assetClassId))
    .map((c) => ({
      ...c,
      istBp: c.istBp.slice(first),
      targetBp: c.targetBp.slice(first),
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
  const limits = classes.slice(0, -1).map((_, ci) => {
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
  const hasSoll = limits.some((s) => s.length > 0);
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
        >
          <Graticule x1={left} x2={right} lines={lines} />
          {areas.map((a) => (
            <path key={a.name} d={a.d} className={`area ${a.ink}`}>
              <title>{`${a.name}: zuletzt ${bpText(a.end)}`}</title>
            </path>
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
        <LineLegend items={[{ kind: 'plan', label: 'Soll-Grenzen (Summe der Sollanteile)' }]} />
      )}
      {!hasSoll && (
        <p className="vnote" role="status">
          Für diese Klassen ist kein Soll hinterlegt; es werden keine Soll-Grenzen gezeichnet.
        </p>
      )}
    </div>
  );
}
