import {
  explorerTemplateSources,
  explorerTemplateSummaries,
  heatForCell,
  tableHeatStats,
  type ExplorerTemplateFacts,
  type ExplorerTemplateModel,
  type TableRow,
} from '@budget/domain';
import { Button, ClassSwatch, useAmountPrivacy } from '@budget/ui';
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { eur, longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import { ExplorerTemplateTrend } from './explorer-template-trend';
import { monthLong, monthShort, percentWhole } from './table-format';
import './table-reports.css';

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
  const root = useRef<HTMLElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  const lastFullMonth = facts.lastFullMonth;
  const viewKey = model.id === 'year' ? `year:${model.months[0] ?? ''}` : model.id;
  const [groups, setGroups] = useState<{ viewKey: string; expanded: Set<string> }>(() => ({
    viewKey,
    expanded: new Set(),
  }));
  const expandedGroups = groups.viewKey === viewKey ? groups.expanded : new Set<string>();
  useEffect(() => {
    setGroups({ viewKey, expanded: new Set() });
  }, [viewKey]);
  const categoryGroups = new Map<string, string>();
  let groupKey: string | null = null;
  for (const candidate of model.rows) {
    if (candidate.kind === 'group') groupKey = candidate.key;
    else if (candidate.kind === 'category' && groupKey)
      categoryGroups.set(candidate.key, groupKey);
    else groupKey = null;
  }
  const selectedGroupKey = categoryGroups.get(selectedRowKey ?? '') ?? null;
  // The year model stays canonical (12 months, including CSV and source lookups).
  // Only its trailing future columns are omitted from this report table.
  const visibleMonths =
    model.id === 'year' && lastFullMonth !== null
      ? model.months.filter((month) => month <= lastFullMonth)
      : model.months;
  const row = model.rows.find((candidate) => candidate.key === selectedRowKey);
  const columnIndex = model.months.indexOf(selectedColumn ?? '');
  const value = row
    ? selectedColumn === 'summe'
      ? explorerTemplateSummaries(row).total
      : (row.vals[columnIndex] ?? null)
    : null;
  const sources =
    row && value !== null && selectedColumn
      ? explorerTemplateSources(facts, model, row.key, selectedColumn)
      : [];
  const sourceSum = sources.reduce((sum, source) => sum + source.cents, 0);
  useEffect(() => {
    if (row && value !== null) detailHeading.current?.focus();
  }, [row, value, selectedColumn]);
  const open = (event: MouseEvent<HTMLButtonElement>, key: string, column: string) => {
    origin.current = event.currentTarget;
    onSelect(key, column);
  };
  const number = (row: TableRow, amount: number | null) =>
    amount === null ? '–' : row.kind === 'pct' ? percentWhole(amount) : eur(amount);
  return (
    <section
      ref={root}
      className="table-report ex-template card ov-card"
      aria-labelledby={`${prefix}-title`}
      data-testid={`template-${model.id}`}
    >
      <div className="tbd-head">
        <h2 id={`${prefix}-title`}>{model.title}</h2>
      </div>
      {visibleMonths.length > 0 && (
        <p className="ov-note">
          Angezeigte Monate: {monthLong(visibleMonths[0]!)} bis {monthLong(visibleMonths.at(-1)!)}.
        </p>
      )}
      {model.id === 'category' && <ExplorerTemplateTrend model={model} />}
      {model.rows.length === 0 ? (
        <p role="status">Für diese Auswahl sind keine vollständigen Monatswerte verfügbar.</p>
      ) : (
        <div
          className="rscroll rsticky ex-template-scroll"
          role="region"
          aria-label={`${model.title}, bei Bedarf horizontal verschiebbar`}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Native horizontal table scrolling is also keyboard accessible.
          tabIndex={0}
        >
          <table className="rtable ex-template-table">
            <caption className="sr-only">
              {model.title}: Monatswerte in Euro; Betrag öffnet die zugehörigen Buchungen
            </caption>
            <thead>
              <tr>
                <th scope="col" className="rg-first">
                  Position
                </th>
                {visibleMonths.map((month) => (
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
              {model.rows.map((row) => {
                const stats = tableHeatStats(row.vals);
                const summaries = explorerTemplateSummaries(row);
                const expanded = expandedGroups.has(row.key) || selectedGroupKey === row.key;
                const collapsedCategory =
                  model.id === 'year' &&
                  row.kind === 'category' &&
                  !expandedGroups.has(categoryGroups.get(row.key) ?? '') &&
                  selectedGroupKey !== categoryGroups.get(row.key);
                return (
                  <tr
                    key={row.key}
                    className={`rk-${row.kind} lv-${row.level}${collapsedCategory ? ' ex-year-category-collapsed' : ''}`}
                    data-template-row={row.key}
                    data-level={row.level}
                  >
                    <th scope="row" className="rg-first">
                      {row.swatch && (
                        <ClassSwatch kind={row.swatch === 'income' ? 'open' : row.swatch} />
                      )}
                      {model.id === 'year' && row.kind === 'group' ? (
                        <button
                          type="button"
                          className="ex-year-group-toggle"
                          aria-expanded={expanded}
                          aria-label={`${row.label}: Kategorien ${expanded ? 'ausblenden' : 'anzeigen'}`}
                          onClick={() => {
                            setGroups((current) => {
                              const next = new Set(
                                current.viewKey === viewKey ? current.expanded : [],
                              );
                              if (expanded) next.delete(row.key);
                              else next.add(row.key);
                              return { viewKey, expanded: next };
                            });
                            if (expanded && selectedGroupKey === row.key) onClose();
                          }}
                        >
                          {row.label}
                        </button>
                      ) : (
                        row.label
                      )}
                    </th>
                    {row.vals.slice(0, visibleMonths.length).map((amount, index) => {
                      const month = visibleMonths[index]!;
                      const heat = row.kind === 'pct' ? null : heatForCell(amount, stats, row.good);
                      return (
                        <td
                          key={month}
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
                                <span aria-hidden="true">{amount > stats.mean ? ' ↑' : ' ↓'}</span>
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    {model.total && (
                      <td className="n">
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
                    {model.average && <td className="n">{number(row, summaries.average)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="ov-note">
        Beträge bleiben centgenau. Teal bedeutet günstiger, Orange ungünstiger gegenüber dem
        Durchschnitt derselben Zeile; die Zahl bleibt das Signal. Summe und Ø verwenden nur
        vorhandene Monate. Der Durchschnitt und Prozentwerte sind keine Summe einzelner Buchungen.
        {model.partialMonth &&
          ` * ${monthLong(model.partialMonth)} läuft noch; Werte bis ${facts.asOf}.`}
      </p>
      {row && value !== null && row.kind !== 'pct' && (
        <section
          className="ex-template-sources"
          aria-labelledby={`${prefix}-sources`}
          data-testid="template-sources"
        >
          <div className="ex-template-source-heading">
            <h3 id={`${prefix}-sources`} ref={detailHeading} tabIndex={-1}>
              {row.label} · {selectedColumn === 'summe' ? 'Summe' : monthLong(selectedColumn!)} ·
              Buchungen
            </h3>
            <Button
              variant="ghost"
              onClick={() => {
                const target = origin.current?.isConnected
                  ? origin.current
                  : [
                      ...(root.current?.querySelectorAll<HTMLButtonElement>(
                        '[data-template-column]',
                      ) ?? []),
                    ].find(
                      (button) =>
                        button.dataset['templateColumn'] === selectedColumn &&
                        button.closest('[data-template-row]')?.getAttribute('data-template-row') ===
                          row.key,
                    );
                onClose();
                target?.focus();
              }}
            >
              Buchungen schließen
            </Button>
          </div>
          <p>
            Gewählte Zelle: <strong>{eur(value)}</strong> · Summe der zugeordneten Anteile:{' '}
            <strong>{eur(sourceSum)}</strong>
          </p>
          {sourceSum !== value && (
            <p role="alert">
              Die Buchungsanteile stimmen nicht mit der Zelle überein. Bitte lade die Auswertung
              neu.
            </p>
          )}
          {sources.length === 0 ? (
            <p>Keine Buchungen in dieser Zelle.</p>
          ) : (
            <ul>
              {sources.map((source, index) => (
                <li key={`${source.bookingId}:${index}`}>
                  <AppLink
                    className="report-source-link"
                    to="/konten/buchungen"
                    search={{ buchung: source.bookingId }}
                  >
                    {longDay(source.date)} · Zugeordneter Anteil {eur(source.cents)}
                  </AppLink>
                </li>
              ))}
            </ul>
          )}
          <p className="ov-note">
            Bei geteilten Buchungen steht hier nur der klassifizierte Anteil dieser Zelle, nicht der
            gesamte Kontobetrag. Erstattungen und Umbuchungen behalten ihre bestehende Zuordnung.
          </p>
        </section>
      )}
    </section>
  );
}
