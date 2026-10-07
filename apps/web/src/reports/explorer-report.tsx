import { PeriodQuickSelect } from './period-quick-select';
import {
  useAmountPrivacy,
  Button,
  ClassSwatch,
  Field,
  Select,
  TextInput,
  useToast,
} from '@budget/ui';
import {
  EXPLORER_CLASSES,
  EXPLORER_COLS,
  EXPLORER_DIMS,
  EXPLORER_MEASURES,
  EXPLORER_PERIODS,
  EXPLORER_PRESETS,
  DEFAULT_EXPLORER_QUERY,
  lastDayOfMonth,
  overviewHeat,
  type ExplorerColumn,
  type ExplorerQuery,
  type ExplorerResult,
} from '@budget/domain';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bookmark, X } from 'lucide-react';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { loadViews, sameQuery, storeViews, withoutView, withView } from './explorer-views';
import { explorerQuery } from './overview-api';
import { euroCellText, monthLong, monthShortYear, wholeText } from './overview-format';
import './overview-reports.css';
import './explorer-report.css';

const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const label = <T extends ReadonlyArray<{ id: string; label: string }>>(list: T, id: string) =>
  list.find((x) => x.id === id)?.label ?? id;

const columnLabel = (column: ExplorerColumn, cols: ExplorerQuery['cols']) => {
  switch (cols) {
    case 'monat':
      return monthShortYear(column.key);
    case 'quartal': {
      const [year = '', q = ''] = column.key.split('-');
      return `${q} ${year.slice(2)}`;
    }
    case 'jahr':
      return column.key;
    case 'keine':
      return 'Zeitraum';
  }
};

const periodName = (months: string[]) =>
  months.length === 0
    ? 'kein Zeitraum'
    : months.length === 1
      ? monthLong(months[0] as string)
      : `${monthShortYear(months[0] as string)} bis ${monthShortYear(months[months.length - 1] as string)}`;

export function ExplorerReportPage({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const toast = useToast();
  const [query, setQuery] = useState<ExplorerQuery>(DEFAULT_EXPLORER_QUERY);
  const [views, setViews] = useState(() => loadViews(browserStorage()));
  const [name, setName] = useState('');
  const result = useQuery({ ...explorerQuery(query), placeholderData: keepPreviousData });
  const data = result.data;
  const set = <K extends keyof ExplorerQuery>(key: K, value: ExplorerQuery[K]) =>
    setQuery((q) => ({ ...q, [key]: value }));

  const save = (event: FormEvent) => {
    event.preventDefault();
    const clean = name.trim();
    if (clean === '') {
      toast.show({ message: 'Bitte einen Namen für die Ansicht eingeben.' });
      return;
    }
    const next = withView(views, clean, query);
    if (!storeViews(browserStorage(), next)) {
      toast.show({ message: 'Die Ansicht konnte in diesem Browser nicht gespeichert werden.' });
      return;
    }
    setViews(next);
    setName('');
    toast.show({ message: `Ansicht „${clean}“ gespeichert.` });
  };
  const remove = (viewName: string) => {
    const next = withoutView(views, viewName);
    storeViews(browserStorage(), next);
    setViews(next);
    toast.show({ message: `Ansicht „${viewName}“ gelöscht.` });
  };

  return (
    <PageFrame
      verdict={
        data && !result.isFetching && !result.isPlaceholderData && !result.isError
          ? { reportId: report.id, period: `${query.period}:${data.ref}` }
          : undefined
      }
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        result.isError
          ? 'nicht verfügbar'
          : data
            ? data.firstMonth
              ? query.period.includes('..')
                ? `Monatsdaten bis ${data.today}`
                : `volle Monate bis ${monthLong(data.ref)}`
              : 'noch keine Buchungen'
            : 'wird geladen'
      }
    >
      <div className="kview ov explorer-report">
        <section className="card ov-card" aria-labelledby="ex-views">
          <div className="tbd-head">
            <h2 id="ex-views">Gespeicherte Ansichten</h2>
          </div>
          <div className="ex-chips" role="group" aria-label="Gespeicherte Ansichten">
            {EXPLORER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="ex-chip"
                aria-pressed={sameQuery(preset.query, query)}
                onClick={() => setQuery(preset.query)}
              >
                <Bookmark size={13} strokeWidth={1.75} aria-hidden="true" />
                {preset.name}
              </button>
            ))}
            {views.map((view) => (
              <span className="ex-chip-pair" key={view.name}>
                <button
                  type="button"
                  className="ex-chip"
                  aria-pressed={sameQuery(view.query, query)}
                  onClick={() => setQuery(view.query)}
                >
                  <Bookmark size={13} strokeWidth={1.75} aria-hidden="true" />
                  {view.name}
                </button>
                <button
                  type="button"
                  className="ex-chip-x"
                  aria-label={`Ansicht ${view.name} löschen`}
                  onClick={() => remove(view.name)}
                >
                  <X size={13} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          <PeriodQuickSelect
            period={query.period}
            onChange={(period) => set('period', period)}
            trend={false}
          />
          <div className="ex-bar">
            <Field label="Zeilen">
              {({ id }) => (
                <Select
                  id={id}
                  value={query.dim}
                  onChange={(e) => set('dim', e.target.value as ExplorerQuery['dim'])}
                >
                  {EXPLORER_DIMS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Klasse">
              {({ id }) => (
                <Select
                  id={id}
                  value={query.cls}
                  disabled={query.dim === 'einnahme'}
                  onChange={(e) => set('cls', e.target.value as ExplorerQuery['cls'])}
                >
                  {EXPLORER_CLASSES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Kennzahl">
              {({ id }) => (
                <Select
                  id={id}
                  value={query.meas}
                  onChange={(e) => set('meas', e.target.value as ExplorerQuery['meas'])}
                >
                  {EXPLORER_MEASURES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Spalten">
              {({ id }) => (
                <Select
                  id={id}
                  value={query.cols}
                  onChange={(e) => set('cols', e.target.value as ExplorerQuery['cols'])}
                >
                  {EXPLORER_COLS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Zeitraum">
              {({ id }) => (
                <Select
                  id={id}
                  value={query.period}
                  onChange={(e) => set('period', e.target.value as ExplorerQuery['period'])}
                >
                  {EXPLORER_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <form className="ex-save" onSubmit={save}>
            <Field label="Ansicht speichern">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={name}
                  maxLength={40}
                  placeholder="Name"
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
            <Button type="submit" variant="ghost" size="sm">
              <Bookmark size={15} strokeWidth={1.75} aria-hidden="true" />
              Speichern
            </Button>
          </form>
          <p className="ov-note">
            Gespeicherte Ansichten liegen in diesem Browser; auf anderen Geräten sind sie nicht
            sichtbar.
          </p>
        </section>

        {result.isPending && <LoadingNote what="Explorer" />}
        {result.isError && (
          <ErrorNote what="Explorer" error={result.error} onRetry={() => void result.refetch()} />
        )}
        {data && (
          <Pivot result={data.result} firstMonth={data.firstMonth} fetching={result.isFetching} />
        )}
      </div>
    </PageFrame>
  );
}

function Pivot({
  result,
  firstMonth,
  fetching,
}: {
  result: ExplorerResult;
  firstMonth: string | null;
  fetching: boolean;
}) {
  useAmountPrivacy();
  const { query, columns, rows, totals } = result;
  const fmt = (value: number) => (result.unit === 'count' ? wholeText(value) : euroCellText(value));
  const first = result.months[0];
  const last = result.months[result.months.length - 1];
  const link = (key: string) =>
    first === undefined || last === undefined || key === ''
      ? null
      : {
          ...(query.dim === 'kategorie' ? { kategorie: key } : { empfaenger: key }),
          von: `${first}-01`,
          bis: lastDayOfMonth(last),
        };
  return (
    <section className="card ov-card" aria-labelledby="ex-result" aria-busy={fetching}>
      <div className="tbd-head">
        <h2 id="ex-result">
          {label(EXPLORER_MEASURES, query.meas)} je {label(EXPLORER_DIMS, query.dim)}
          {query.cols !== 'keine' ? ` und ${label(EXPLORER_COLS, query.cols)}` : ''} ·{' '}
          {periodName(result.months)}
        </h2>
        <span className="tbd-state">
          <span className="ink" data-testid="ex-rows">
            {rows.length} {rows.length === 1 ? 'Zeile' : 'Zeilen'}
          </span>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="ov-empty" role="status">
          {firstMonth === null
            ? 'Es gibt noch keine Buchungen auf Budgetkonten.'
            : 'Keine Werte für diese Auswahl.'}
        </p>
      ) : (
        <div
          className="ov-scroll ex-scroll"
          role="region"
          aria-label="Pivottabelle, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the wide table.
          tabIndex={0}
        >
          <table className="ov-table ex-table" data-testid="ex-table">
            <thead>
              <tr>
                <th className="tech ex-first">{label(EXPLORER_DIMS, query.dim)}</th>
                {columns.map((c) => (
                  <th key={c.key} className="tech n">
                    {columnLabel(c, query.cols)}
                  </th>
                ))}
                {columns.length > 1 && (
                  <th className="tech n">{query.meas === 'avg' ? 'Ø' : 'Gesamt'}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const heat = columns.length > 1 ? overviewHeat(row.values, result.good) : [];
                const to = link(row.key);
                return (
                  <tr key={row.key || '__none'}>
                    <th scope="row" className="ex-first">
                      {row.class && <ClassSwatch kind={row.class} />}
                      {to ? (
                        <AppLink to="/konten/buchungen" search={to}>
                          {row.label}
                        </AppLink>
                      ) : (
                        row.label
                      )}
                    </th>
                    {row.values.map((value, i) => {
                      const h = heat[i];
                      return (
                        <td
                          key={columns[i]?.key ?? i}
                          className={`n${h ? ` ov-hc is-${h.tone}` : ''}`}
                          style={
                            h ? ({ '--h': h.strength.toFixed(2) } as CSSProperties) : undefined
                          }
                        >
                          {value === 0 ? <span className="muted">·</span> : fmt(value)}
                        </td>
                      );
                    })}
                    {columns.length > 1 && (
                      <td className="n">
                        <strong>{fmt(row.total)}</strong>
                      </td>
                    )}
                  </tr>
                );
              })}
              {totals && (
                <tr className="is-total">
                  <th scope="row" className="ex-first">
                    Summe
                  </th>
                  {totals.values.map((value, i) => (
                    <td key={columns[i]?.key ?? i} className="n">
                      {fmt(value)}
                    </td>
                  ))}
                  {columns.length > 1 && <td className="n">{fmt(totals.total)}</td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {result.truncated > 0 && (
        <p className="ov-note" role="note">
          Die größten {rows.length} Zeilen sind aufgelistet, {result.truncated} weitere nicht.
        </p>
      )}
      <p className="ov-note">
        {result.unit === 'count'
          ? 'Anzahl der Buchungen; eine geteilte Buchung zählt in jeder Zeile, in der sie vorkommt.'
          : 'Beträge in Euro, gerundet.'}{' '}
        Farbe je Zeile gegen ihren Durchschnitt (
        {result.good === 'low' ? 'Rot teurer, Grün günstiger' : 'Grün mehr, Rot weniger'}); die Zahl
        bleibt das Signal. Umbuchungen, Erstattungen und Rückzahlungen von Kontakten sind kein
        Einkommen; Kapitalerträge stehen als eigene Einnahmenart. Ohne Kategorie erscheinen
        Ausgaben, die noch im Posteingang liegen.
      </p>
    </section>
  );
}
