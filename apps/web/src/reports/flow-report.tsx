import { useAmountPrivacy, DimensionChain, Segmented } from '@budget/ui';
import { CLASS_NAMES, cents, type FlowNode, type MoneyFlow } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SankeyChart, type SankeyModel } from '../charts/sankey-chart';
import { useElementWidth } from '../charts/use-element-width';
import { eur } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { flowReportQuery, type FlowReportData, type FlowSpan } from './month-api';
import { MonthReportFrame, monthTitle, shortMonth, useReportMonth } from './month-frame';

const SPANS = [
  { value: 'month', label: 'Monat' },
  { value: 'year', label: '12 Monate' },
] as const;

/** The nodes and links of the domain's money flow as the Sankey chart wants them. */
export function sankeyModel(flow: MoneyFlow): SankeyModel {
  const node = (n: FlowNode) => ({
    id: n.id,
    name: n.name,
    value: n.cents,
    tone: n.tone,
    // Kapitalerträge and folded nodes stay labelled, however thin.
    forceLabel: n.tone === 'cap' || n.id.endsWith('weitere'),
  });
  return {
    columns: [
      flow.columns.income.map(node),
      flow.columns.pool.map(node),
      flow.columns.classes.map(node),
      flow.columns.groups.map(node),
    ].filter((column) => column.length > 0),
    links: flow.links.map((l) => ({
      from: l.from,
      to: l.to,
      value: l.cents,
      tone: l.tone,
      label: l.label,
    })),
  };
}

export function FlowReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const { month, shift, current } = useReportMonth();
  const [span, setSpan] = useState<FlowSpan>('month');
  const query = useQuery(flowReportQuery(month, span));
  const data = query.data;
  return (
    <MonthReportFrame
      verdict={
        data && !query.isFetching && !query.isError
          ? {
              reportId: report.id,
              period: `${data.from}..${data.to}`,
              partial: data.partial,
              metric: {
                label: 'Übrig nach Geldfluss',
                value: data.flow.restCents,
                unit: 'money',
                better: 'higher',
              },
            }
          : undefined
      }
      report={report}
      meta={meta}
      month={month}
      shift={shift}
      current={current}
      firstMonth={data?.firstMonth}
      asOf={data?.asOf}
      basis={query.isError ? 'nicht verfügbar' : undefined}
    >
      <div className="mrep flow-report" data-testid="flow-report">
        {query.isPending && <LoadingNote what="Daten des Geldflusses" />}
        {query.isError && (
          <ErrorNote
            what="Daten des Geldflusses"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {data?.beforeRecords && (
          <EmptyNote>
            Vor {shortMonth(data.firstMonth)} gibt es keine Aufzeichnungen, also auch keinen
            Geldfluss.
          </EmptyNote>
        )}
        {data && !data.beforeRecords && <FlowBody data={data} span={span} setSpan={setSpan} />}
      </div>
    </MonthReportFrame>
  );
}

const TONE_SWATCH = { need: 'need', want: 'want', future: 'future', rest: 'open' } as const;

function FlowBody({
  data,
  span,
  setSpan,
}: {
  data: FlowReportData;
  span: FlowSpan;
  setSpan: (value: FlowSpan) => void;
}) {
  useAmountPrivacy();
  const { flow } = data;
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const period =
    span === 'month'
      ? monthTitle(data.month, data.partial, data.asOf)
      : `${shortMonth(data.from)} bis ${shortMonth(data.to)}`;
  const empty = flow.totalCents === 0;
  const terms = flow.chain.map((c) => ({
    label: c.label,
    value: cents(c.cents),
    ...(c.op ? { op: c.op } : {}),
    ...(c.result ? { result: true } : {}),
  }));
  const label = `Sankey ${period}: Einnahmen ${eur(flow.earnedCents)}${
    flow.capitalCents > 0 ? ` und Kapitalerträge ${eur(flow.capitalCents)}` : ''
  } fließen in einen Topf und von dort in Bedarf, Wunsch und Zukunft; ${
    flow.restCents >= 0 ? 'Übrig' : 'Aus Guthaben'
  } ${eur(Math.abs(flow.restCents))}.`;
  return (
    <>
      <section className="mr-card mr-wide" aria-labelledby="flow-title">
        <div className="tbd-head">
          <h2 id="flow-title">Geldfluss {period}</h2>
          <Segmented
            label="Zeitraum des Geldflusses"
            options={SPANS}
            value={span}
            onChange={setSpan}
          />
        </div>
        {empty ? (
          <EmptyNote>
            {span === 'month'
              ? 'In diesem Monat fließt noch kein Geld: weder Einnahmen noch Ausgaben sind gebucht.'
              : 'Im Zeitraum fließt kein Geld.'}
          </EmptyNote>
        ) : (
          <>
            <DimensionChain terms={terms} precision="euro" label="Maßkette Geldfluss" />
            <div
              className="mr-sankey-scroll"
              role="region"
              aria-label="Sankey-Diagramm, bei Bedarf horizontal verschiebbar"
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the chart.
              tabIndex={0}
            >
              <div ref={ref} className="mr-sankey">
                <SankeyChart
                  width={width}
                  model={sankeyModel(flow)}
                  period={period}
                  label={label}
                  height={width < 600 ? 400 : 380}
                />
              </div>
            </div>
            <p className="vnote">
              Alle Einnahmen fließen erst in einen Topf und von dort in die Klassen; Umbuchungen
              zwischen eigenen Konten, Erstattungen auf Kategorien und Rückzahlungen von Kontakten
              sind weggelassen. Kapitalerträge sind eigens ausgewiesen und zählen nicht zum
              Haushaltseinkommen. Zukunft heißt: Geld, das im Vermögen bleibt (ETF, Notgroschen,
              Sondertilgung).
              {data.partial && span === 'month'
                ? ' Der Monat läuft noch: gezeigt ist, was bis heute gebucht ist.'
                : ''}
              {span === 'year' && data.monthCount < 12
                ? ` Aufzeichnungen liegen für ${data.monthCount} Monate vor.`
                : ''}
            </p>
          </>
        )}
      </section>

      {!empty && (
        <section className="mr-card mr-wide" aria-labelledby="flow-list-title">
          <div className="tbd-head">
            <h2 id="flow-list-title">Stückliste des Flusses</h2>
          </div>
          <div
            className="mr-scroll"
            role="region"
            aria-label="Stückliste, bei Bedarf horizontal verschiebbar"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table.
            tabIndex={0}
          >
            <table className="mr-table" data-testid="flow-list">
              <thead>
                <tr>
                  <th scope="col" className="tech">
                    Klasse
                  </th>
                  <th scope="col" className="tech">
                    Gruppe
                  </th>
                  <th scope="col" className="tech n">
                    Betrag
                  </th>
                  <th scope="col" className="tech n">
                    Anteil an {flow.columns.pool[0]?.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {flow.table.map((row, i) => (
                  <tr
                    key={`${row.class}-${row.name}`}
                    className={i > 0 && flow.table[i - 1]?.class !== row.class ? 'is-break' : ''}
                  >
                    <td>
                      <i className={`sw sw-${TONE_SWATCH[row.class]}`} aria-hidden="true" />
                      {row.class === 'rest' ? 'Übrig' : CLASS_NAMES[row.class]}
                    </td>
                    <td>{row.class === 'rest' ? '–' : row.name}</td>
                    <td className="n">{eur(row.cents, { cents: false })}</td>
                    <td className="n">
                      {row.sharePercent === 0 && row.cents > 0 ? '< 1' : row.sharePercent} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
