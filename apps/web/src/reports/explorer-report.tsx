import { PeriodQuickSelect, ReportPeriodControl } from './period-quick-select';
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
  EXPLORER_TEMPLATES,
  explorerTemplate,
  explorerTemplateYears,
  isExplorerTemplate,
  lastDayOfMonth,
  overviewHeat,
  explorerTableHeaders,
  type ExplorerQuery,
  type ExplorerResult,
  type PersistedExplorerView,
} from '@budget/domain';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bookmark, Download, Pencil, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { sameQuery } from './explorer-views';
import { explorerTemplateQuery } from './explorer-template-api';
import { ExplorerTemplates } from './explorer-templates';
import { useZeitraum, ZEITRAUM_VALUES } from '../wealth/zeitraum';
import { useExplorerViews } from './use-explorer-views';
import { savedExplorerEntryQuery } from './explorer-view-api';
import { EXPLORER_CSV_CHANGED_MESSAGE, explorerQuery, fetchExplorerCsv } from './overview-api';
import { euroCellText, monthLong, monthShortYear, wholeText } from './overview-format';
import './overview-reports.css';
import './explorer-report.css';

const label = <T extends ReadonlyArray<{ id: string; label: string }>>(list: T, id: string) =>
  list.find((x) => x.id === id)?.label ?? id;

const periodName = (months: string[]) =>
  months.length === 0
    ? 'kein Zeitraum'
    : months.length === 1
      ? monthLong(months[0] as string)
      : `${monthShortYear(months[0] as string)} bis ${monthShortYear(months[months.length - 1] as string)}`;

export function ExplorerReportPage({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const toast = useToast();
  const search = useSearch({ strict: false }) as {
    vorlage?: unknown;
    ansicht?: string;
    kategorien?: string[];
    zelle?: string;
    spalte?: string;
  };
  const template = !search.ansicht && isExplorerTemplate(search.vorlage) ? search.vorlage : undefined;
  const navigate = useNavigate();
  const changeTemplateSearch = (patch: Record<string, unknown>) =>
    void navigate({
      to: '.',
      search: ((previous: Record<string, unknown>) => ({ ...previous, ...patch })) as never,
    });
  const chooseTemplate = (id: typeof template) =>
    changeTemplateSearch({
      vorlage: id,
      ansicht: undefined,
      zelle: undefined,
      spalte: undefined,
      ...(id
        ? { zeitraum: EXPLORER_TEMPLATES.find((candidate) => candidate.id === id)!.period }
        : {}),
    });
  const [templatePeriod, setTemplatePeriod] = useZeitraum('1J');
  const templateRead = useQuery({ ...explorerTemplateQuery, enabled: Boolean(template) });
  const templateCategory = search.kategorien?.[0];
  const templateModel = useMemo(
    () =>
      template && templateRead.data
        ? explorerTemplate(templateRead.data, {
            id: template,
            period: templatePeriod,
            ...(templateCategory ? { categoryId: templateCategory } : {}),
            ...(templatePeriod.includes('..') ? { year: Number(templatePeriod.slice(0, 4)) } : {}),
          })
        : undefined,
    [template, templateRead.data, templatePeriod, templateCategory],
  );
  const [query, setQuery] = useState<ExplorerQuery>(DEFAULT_EXPLORER_QUERY);
  const entryInstance = useId();
  const [observedEntry, setObservedEntry] = useState({ id: search.ansicht, generation: 0 });
  const entry = useQuery(savedExplorerEntryQuery(search.ansicht, `${entryInstance}:${observedEntry.generation}`));
  const [capturedEntry, setCapturedEntry] = useState<string>();
  const entryFresh = entry.isSuccess && !entry.isFetching && !entry.data.unavailable && entry.data.schemaVersion === 1;
  const requested = entryFresh ? entry.data.views.find((view) => view.id === search.ansicht) : undefined;
  const saved = useExplorerViews();
  const views = saved.views;
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [replace, setReplace] = useState<PersistedExplorerView>();
  // Capture a freshly read tuple once per entry. Background refetches retain local edits;
  // A → failed B → Back A still needs A's new read, never the earlier captured tuple.
  if (observedEntry.id !== search.ansicht) {
    setObservedEntry({ id: search.ansicht, generation: observedEntry.generation + 1 });
    setCapturedEntry(undefined);
  } else if (search.ansicht && requested && capturedEntry !== search.ansicht) {
    setCapturedEntry(search.ansicht);
    setQuery(requested.query);
    setName('');
    setEditingId(undefined);
    setReplace(undefined);
  }
  const entryReady = !search.ansicht || capturedEntry === search.ansicht;
  const result = useQuery({
    ...explorerQuery(query),
    placeholderData: keepPreviousData,
    enabled: !template && entryReady,
  });
  const data = entryReady && (!search.ansicht || (result.data && sameQuery(query, result.data.result.query)))
    ? result.data
    : undefined;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const exportReady =
    !template &&
    Boolean(
      data &&
      !result.isPending &&
      !result.isFetching &&
      !result.isPlaceholderData &&
      !result.isError &&
      sameQuery(query, data.result.query),
    );
  const latest = useRef({ query, result: data?.result, ready: exportReady });
  useEffect(() => {
    latest.current = { query, result: data?.result, ready: exportReady };
  }, [query, data, exportReady]);
  const download = async () => {
    const snapshot = data?.result;
    if (!snapshot || !exportReady || exporting) return;
    setExporting(true);
    setExportError(undefined);
    try {
      const { blob, filename } = await fetchExplorerCsv(snapshot);
      const current = latest.current;
      if (
        !current.ready ||
        current.result !== snapshot ||
        !sameQuery(current.query, snapshot.query)
      )
        throw new Error(EXPLORER_CSV_CHANGED_MESSAGE);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = filename;
        link.hidden = true;
        document.body.append(link);
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setExportError(
        error instanceof Error && error.message === EXPLORER_CSV_CHANGED_MESSAGE
          ? EXPLORER_CSV_CHANGED_MESSAGE
          : 'Der CSV-Export ist fehlgeschlagen. Bitte versuche es erneut.',
      );
    } finally {
      setExporting(false);
    }
  };
  const set = <K extends keyof ExplorerQuery>(key: K, value: ExplorerQuery[K]) =>
    setQuery((q) => ({ ...q, [key]: value }));

  const persist = async (id?: string) => {
    const clean = name.trim();
    const response = await saved.write(
      { kind: 'save', view: { name: clean, query }, ...(id ? { id } : {}) },
      `Ansicht „${clean}“ gespeichert.`,
    );
    if (response) {
      setName('');
      setEditingId(undefined);
      setReplace(undefined);
    }
  };
  const remove = async (view: PersistedExplorerView) => {
    const removed = await saved.write(
      { kind: 'delete', id: view.id },
      `Ansicht „${view.name}“ gelöscht.`,
    );
    if (removed && editingId === view.id) {
      setEditingId(undefined);
      setName('');
      setReplace(undefined);
    }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const clean = name.trim();
    if (!entryReady) return;
    if (clean === '') {
      toast.show({ message: 'Bitte einen Namen für die Ansicht eingeben.' });
      return;
    }
    const existing = views.find((view) => view.name.toLowerCase() === clean.toLowerCase());
    if (existing && existing.id !== editingId) setReplace(existing);
    else void persist(editingId);
  };

  return (
    <PageFrame
      verdict={
        !template && data && !result.isFetching && !result.isPlaceholderData && !result.isError
          ? { reportId: report.id, period: `${query.period}:${data.ref}` }
          : undefined
      }
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      {...(template
        ? {
            extraFields: [
              {
                label: template === 'year' ? 'Jahr' : 'Zeitraum',
                value:
                  template === 'year' ? (
                    <Select
                      aria-label="Jahr"
                      value={templateModel?.months[0]?.slice(0, 4) ?? ''}
                      disabled={!templateRead.data}
                      onChange={(event) => {
                        setTemplatePeriod(`${event.target.value}-01..${event.target.value}-12`);
                      }}
                    >
                      {(templateRead.data ? explorerTemplateYears(templateRead.data) : []).map(
                        (year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ),
                      )}
                    </Select>
                  ) : (
                    <ReportPeriodControl
                      trend={false}
                      label="Zeitraum"
                      options={ZEITRAUM_VALUES.map((value) => ({ value, label: value }))}
                      value={templatePeriod}
                      onChange={setTemplatePeriod}
                    />
                  ),
              },
            ],
          }
        : {})}
      reportDataBasis={
        template
          ? templateRead.isError
            ? 'nicht verfügbar'
            : templateModel
              ? `Monatsdaten bis ${templateModel.asOf}`
              : 'wird geladen'
          : result.isError
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
          <div className="ex-chips" role="group" aria-label="Vorlagen">
            {EXPLORER_TEMPLATES.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="ex-chip"
                aria-pressed={template === preset.id}
                onClick={() => chooseTemplate(preset.id)}
              >
                {preset.label}
              </button>
            ))}
            {template && (
              <button type="button" className="ex-chip" onClick={() => chooseTemplate(undefined)}>
                Eigene Auswertung
              </button>
            )}
          </div>
          {search.ansicht && !entryReady && (
            <div>
              {entry.isFetching && <LoadingNote what="Gespeicherte Auswertung" />}
              {entry.isError && <ErrorNote what="Gespeicherte Auswertung" error={entry.error} onRetry={() => void entry.refetch()} />}
              {entry.isSuccess && !entry.isFetching && !requested && (
                <p role="status">Diese gespeicherte Auswertung ist nicht mehr verfügbar. Es wird keine andere Auswahl geladen.</p>
              )}
              <Button variant="ghost" onClick={() => chooseTemplate(undefined)}>Eigene Auswertung öffnen</Button>
            </div>
          )}
          {saved.isPending && <LoadingNote what="Gespeicherte Ansichten" />}
          {saved.isError && (
            <ErrorNote
              what="Gespeicherte Ansichten"
              error={saved.error}
              onRetry={() => void saved.refetch()}
            />
          )}
          {saved.data?.unavailable && (
            <p role="status">
              Gespeicherte Ansichten sind nicht verfügbar. Die Daten bleiben erhalten; die Vorlagen
              und Filter kannst du weiter verwenden.
            </p>
          )}
          {saved.migrationError && (
            <p role="status">
              {saved.migrationError}{' '}
              <Button variant="ghost" onClick={saved.retryMigration}>
                Erneut versuchen
              </Button>
            </p>
          )}
          {saved.unavailableLocalCount > 0 && (
            <p role="status">
              {saved.unavailableLocalCount} lokale Ansichten sind nicht verfügbar. Ihre
              ursprünglichen Daten bleiben in diesem Browser erhalten.
            </p>
          )}
          <div className="ex-chips" role="group" aria-label="Gespeicherte Ansichten">
            {EXPLORER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="ex-chip"
                aria-pressed={!template && sameQuery(preset.query, query)}
                onClick={() => {
                  chooseTemplate(undefined);
                  setQuery(preset.query);
                }}
              >
                <Bookmark size={13} strokeWidth={1.75} aria-hidden="true" />
                {preset.name}
              </button>
            ))}
            {views.map((view) => (
              <span className="ex-chip-pair" key={view.id}>
                <button
                  type="button"
                  className="ex-chip"
                  aria-pressed={!template && sameQuery(view.query, query)}
                  onClick={() => {
                    chooseTemplate(undefined);
                    setQuery(view.query);
                  }}
                >
                  <Bookmark size={13} strokeWidth={1.75} aria-hidden="true" />
                  {view.name}
                </button>
                <button
                  type="button"
                  className="ex-chip-x"
                  aria-label={`Ansicht ${view.name} bearbeiten`}
                  disabled={saved.busy}
                  onClick={() => {
                    chooseTemplate(undefined);
                    setEditingId(view.id);
                    setName(view.name);
                    setQuery(view.query);
                    setReplace(undefined);
                  }}
                >
                  <Pencil size={13} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ex-chip-x"
                  aria-label={`Ansicht ${view.name} löschen`}
                  disabled={saved.busy}
                  onClick={() => void remove(view)}
                >
                  <X size={13} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          {!template && (
            <fieldset className="ex-custom-query" disabled={!entryReady}>
              <legend className="sr-only">Auswertungseinstellungen</legend>
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
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={!entryReady || !saved.data || saved.data.unavailable || saved.busy}
                >
                  <Bookmark size={15} strokeWidth={1.75} aria-hidden="true" />
                  Speichern
                </Button>
                {editingId && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingId(undefined);
                      setName('');
                      setReplace(undefined);
                    }}
                  >
                    Bearbeiten abbrechen
                  </Button>
                )}
              </form>
              {replace && (
                <div role="alert">
                  Die Ansicht „{replace.name}“ ersetzen?{' '}
                  <Button
                    variant="ghost"
                    onClick={() => void persist(replace.id)}
                    disabled={saved.busy}
                  >
                    Ersetzen
                  </Button>
                  <Button variant="ghost" onClick={() => setReplace(undefined)}>
                    Abbrechen
                  </Button>
                </div>
              )}
            </fieldset>
          )}
          <p className="ov-note">
            Gespeicherte Ansichten sind nach dem Neuladen auch auf deinen anderen Geräten verfügbar.
            Höchstens 20 Ansichten; je Name höchstens 40 Zeichen.
          </p>
        </section>

        {template && (templateRead.isPending || templateRead.isFetching) && (
          <LoadingNote what="Vorlage" />
        )}
        {template && templateRead.isError && (
          <ErrorNote
            what="Vorlage"
            error={templateRead.error}
            onRetry={() => void templateRead.refetch()}
          />
        )}
        {template &&
          templateRead.data &&
          templateModel &&
          !templateRead.isFetching &&
          !templateRead.isError && (
            <>
              {template === 'category' && (
                <Field label="Kategorie">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={templateModel.categoryId ?? ''}
                      onChange={(event) =>
                        changeTemplateSearch({
                          kategorien: [event.target.value],
                          zelle: undefined,
                          spalte: undefined,
                        })
                      }
                    >
                      {templateRead.data.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <ExplorerTemplates
                facts={templateRead.data}
                model={templateModel}
                {...(search.zelle ? { selectedRowKey: search.zelle } : {})}
                {...(search.spalte ? { selectedColumn: search.spalte } : {})}
                onSelect={(key, column) => changeTemplateSearch({ zelle: key, spalte: column })}
                onClose={() => changeTemplateSearch({ zelle: undefined, spalte: undefined })}
              />
            </>
          )}
        {!template && entryReady && (result.isPending || (search.ansicht && result.isFetching && !data)) && (
          <LoadingNote what="Explorer" />
        )}
        {!template && entryReady && result.isError && (
          <ErrorNote what="Explorer" error={result.error} onRetry={() => void result.refetch()} />
        )}
        {!template && data && (
          <Pivot
            result={data.result}
            firstMonth={data.firstMonth}
            fetching={result.isFetching}
            onExport={() => void download()}
            exportDisabled={!exportReady || exporting}
            exporting={exporting}
          />
        )}
        {exportError && (
          <p className="ov-note" role="alert">
            {exportError}{' '}
            <Button
              variant="ghost"
              onClick={() => {
                if (template) chooseTemplate(undefined);
                void result.refetch();
              }}
            >
              Auswertung neu laden
            </Button>
          </p>
        )}
      </div>
    </PageFrame>
  );
}

function Pivot({
  result,
  firstMonth,
  fetching,
  onExport,
  exportDisabled,
  exporting,
}: {
  result: ExplorerResult;
  firstMonth: string | null;
  fetching: boolean;
  onExport: () => void;
  exportDisabled: boolean;
  exporting: boolean;
}) {
  useAmountPrivacy();
  const { query, columns, rows, totals } = result;
  const headers = explorerTableHeaders(result);
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
        <Button
          variant="ghost"
          style={{ minHeight: 'var(--touch)' }}
          disabled={exportDisabled}
          onClick={onExport}
        >
          <Download size={15} strokeWidth={1.75} aria-hidden="true" />
          {exporting ? 'CSV wird geprüft …' : 'CSV exportieren'}
        </Button>
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
                <th className="tech ex-first">{headers[0]}</th>
                {columns.map((c, i) => (
                  <th key={c.key} className="tech n">
                    {headers[i + 1]}
                  </th>
                ))}
                {columns.length > 1 && <th className="tech n">{headers.at(-1)}</th>}
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
        Ausgaben, die noch unter Prüfen liegen.
      </p>
    </section>
  );
}
