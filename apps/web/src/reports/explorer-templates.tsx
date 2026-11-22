import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { ExplorerPhoneRows, ExplorerTableDetails } from './explorer-redesign';
import {
  explorerTemplateSources,
  heatForCell,
  tableHeatStats,
  type ExplorerTemplateFacts,
  type ExplorerTemplateModel,
  type TableRow,
} from '@budget/domain';
import { ClassSwatch, useAmountPrivacy } from '@budget/ui';
import { useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { eur } from '../ledger/format';
import { ReportCellBookings } from './report-cell-bookings';
import { ReportTable } from './report-table';
import { ExplorerTemplateTrend } from './explorer-template-trend';
import { monthLong, monthShort, percentWhole } from './table-format';
import './table-reports.css';
import { templateChartModel } from './explorer-chart-model-626';
import { ExplorerChart626, ExplorerViewToggle626 } from './explorer-chart-626';
import { ExplorerTableInspector626 } from './explorer-table-inspector-626';
import { useCollapsibleSections } from './month-frame';
import './table-print.css';

export function ExplorerTemplates({
  facts,
  model,
  selectedRowKey,
  selectedColumn,
  onSelect,
  onClose,
}: {
  facts: ExplorerTemplateFacts;
  model: ExplorerTemplateModel;
  selectedRowKey?: string;
  selectedColumn?: string;
  onSelect: (rowKey: string, column: string) => void;
  onClose: () => void;
}) {
  useAmountPrivacy();
  const prefix = useId();
  const [view, setView] = useState<'table' | 'chart'>('table');
  const chartData = useMemo(() => templateChartModel(model), [model]);
  const cellsPerRow = model.months.length + chartData.summaryColumns.length;
  const root = useRef<HTMLDivElement>(null);
  const sectionsRef = useCollapsibleSections(`explorer-template-${model.id}`);
  const origin = useRef<HTMLButtonElement | null>(null);
  const selectedIndex = model.rows.findIndex((candidate) => candidate.key === selectedRowKey);
  const row = model.rows[selectedIndex];
  const columnIndex = model.months.indexOf(selectedColumn ?? '');
  const value = row
    ? selectedColumn === 'summe'
      ? chartData.rows[selectedIndex]!.total
      : (row.vals[columnIndex] ?? null)
    : null;
  const sources =
    row && value !== null && selectedColumn
      ? explorerTemplateSources(facts, model, row.key, selectedColumn)
      : [];
  const close = () => {
    const target = origin.current?.isConnected
      ? origin.current
      : [
          ...(root.current?.querySelectorAll<HTMLButtonElement>('[data-template-column]') ?? []),
        ].find(
          (button) =>
            button.dataset['templateColumn'] === selectedColumn &&
            button.closest('[data-template-row]')?.getAttribute('data-template-row') === row?.key,
        );
    onClose();
    target?.focus();
  };
  const open = (event: MouseEvent<HTMLButtonElement>, key: string, column: string) => {
    origin.current = event.currentTarget;
    onSelect(key, column);
  };
  const number = (row: TableRow, amount: number | null) =>
    amount === null ? '–' : row.kind === 'pct' ? percentWhole(amount) : eur(amount);
  return (
    <div
      ref={root}
      className="table-report report-table-print ex-template"
      data-testid={`template-${model.id}`}
    >
      <section className="card ov-card tr-card" aria-labelledby={`${prefix}-title`}>
        <div className="tbd-head">
          <h2 id={`${prefix}-title`}>{model.title}</h2>
        </div>
        {model.months.length > 0 && (
          <p className="ov-note">
            Angezeigte Monate: {monthLong(model.months[0]!)} bis {monthLong(model.months.at(-1)!)}.
          </p>
        )}
        <ExplorerViewToggle626 value={view} onChange={setView} />
        {view === 'chart' && <ExplorerChart626 data={chartData} />}
        <div hidden={view !== 'table'} className="ex-native-view">
          {model.id === 'category' && <ExplorerTemplateTrend model={model} />}
          <div className="r6-native-grid">
            {REDESIGN_ENABLED && <ExplorerPhoneRows data={chartData} onOpen={open} />}
            <ExplorerTableDetails>
              <ExplorerTableInspector626 data={chartData} active={view === 'table'}>
                {model.rows.length === 0 ? (
                  <p role="status">
                    Für diese Auswahl sind keine vollständigen Monatswerte verfügbar.
                  </p>
                ) : (
                  <ReportTable
                    className="rtable ex-template-table"
                    scrollClassName="ex-template-scroll"
                    caption={`${model.title}: Monatswerte in Euro; Betrag öffnet die zugehörigen Buchungen`}
                    regionLabel={`${model.title}, bei Bedarf horizontal verschiebbar`}
                  >
                    <thead>
                      <tr>
                        <th scope="col" className="rg-first">
                          Position
                        </th>
                        {model.months.map((month) => (
                          <th scope="col" key={month} className="n" title={monthLong(month)}>
                            {monthShort(month, true)}
                            {month === model.partialMonth ? '*' : ''}
                          </th>
                        ))}
                        {model.total && (
                          <th scope="col" className="n">
                            Summe
                          </th>
                        )}
                        {model.average && (
                          <th scope="col" className="n">
                            Ø Monat
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {model.rows.map((row, rowIndex) => {
                        const stats = tableHeatStats(row.vals);
                        const summaries = chartData.rows[rowIndex]!;
                        return (
                          <tr
                            key={row.key}
                            className={`rk-${row.kind} lv-${row.level}`}
                            data-template-row={row.key}
                            data-level={row.level}
                          >
                            <th scope="row" className="rg-first">
                              {row.swatch && (
                                <ClassSwatch kind={row.swatch === 'income' ? 'open' : row.swatch} />
                              )}
                              {row.label}
                            </th>
                            {row.vals.map((amount, index) => {
                              const month = model.months[index]!;
                              // Higher expenses are unfavorable; higher income is favorable.
                              const heat =
                                row.kind === 'pct' ? null : heatForCell(amount, stats, row.good);
                              return (
                                <td
                                  key={month}
                                  data-chart-point={rowIndex * cellsPerRow + index}
                                  className="n"
                                  data-heat={heat?.tone}
                                  style={
                                    heat
                                      ? ({ '--h': heat.strength.toFixed(2) } as CSSProperties)
                                      : undefined
                                  }
                                >
                                  {amount === null || row.kind === 'pct' ? (
                                    number(row, amount)
                                  ) : (
                                    <button
                                      type="button"
                                      className="table-cell-open"
                                      data-template-column={month}
                                      aria-label={`${row.label} · ${monthLong(month)} · ${eur(amount)}${heat ? (amount > stats.mean ? ' · über dem Zeilenmittel' : ' · unter dem Zeilenmittel') : ''}`}
                                      onClick={(event) => open(event, row.key, month)}
                                    >
                                      {eur(amount)}
                                      {heat && (
                                        <span aria-hidden="true">
                                          {amount > stats.mean ? ' ↑' : ' ↓'}
                                        </span>
                                      )}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                            {model.total && (
                              <td
                                className="n"
                                data-chart-point={rowIndex * cellsPerRow + model.months.length}
                              >
                                {summaries.total === null ? (
                                  '–'
                                ) : (
                                  <button
                                    type="button"
                                    className="table-cell-open"
                                    data-template-column="summe"
                                    aria-label={`${row.label} · Summe · ${eur(summaries.total)}`}
                                    onClick={(event) => open(event, row.key, 'summe')}
                                  >
                                    <strong>{eur(summaries.total)}</strong>
                                  </button>
                                )}
                              </td>
                            )}
                            {model.average && (
                              <td
                                className="n"
                                data-chart-point={
                                  rowIndex * cellsPerRow +
                                  model.months.length +
                                  (model.total ? 1 : 0)
                                }
                              >
                                {number(row, summaries.average)}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </ReportTable>
                )}
              </ExplorerTableInspector626>
            </ExplorerTableDetails>
          </div>
        </div>
        {row && value !== null && row.kind !== 'pct' && (
          <ReportCellBookings
            headingId={`${prefix}-sources`}
            heading={`${row.label} � ${selectedColumn === 'summe' ? 'Summe' : monthLong(selectedColumn!)} � Buchungen`}
            value={value}
            sources={sources}
            onClose={close}
          />
        )}
      </section>
      <div key={model.id} ref={sectionsRef}>
        <section
          className="tr-card ex-template-basis"
          aria-labelledby={`explorer-template-${model.id}-basis`}
        >
          <h3 id={`explorer-template-${model.id}-basis`}>Datenbasis und Darstellung</h3>
          <p className="ov-note">
            Beträge bleiben centgenau. Teal bedeutet günstiger, Orange ungünstiger gegenüber dem
            Durchschnitt derselben Zeile; die Zahl bleibt das Signal. Summe und Ø verwenden nur
            vorhandene Monate. Der Durchschnitt und Prozentwerte sind keine Summe einzelner
            Buchungen.
            {model.partialMonth &&
              ` * ${monthLong(model.partialMonth)} läuft noch; Werte bis ${facts.asOf}.`}
          </p>
        </section>
      </div>
    </div>
  );
}
