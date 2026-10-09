import {
  useAmountPrivacy,
  AmountInput,
  Button,
  Field,
  Select,
  Segmented,
  Switch,
  TextInput,
} from '@budget/ui';
import {
  LIQUIDITY_BUFFER_PERCENT,
  addDays,
  parseAmount,
  plannedEventOccurrences,
  type LiquidityHorizon,
  type LiquidityLeverId,
  type LiquidityReport,
} from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, CheckCircle2, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur, longDay, monthName, shortDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import {
  createPlannedEvent,
  createIncomePause,
  deleteIncomePause,
  deletePlannedEvent,
  liquidityQuery,
  patchIncomePause,
  patchPlannedEvent,
  type IncomePauseView,
  type LiquidityReportView,
  type PlannedEventView,
} from './liquidity-api';
import { LiquidityChart } from './liquidity-chart';
import { expectedQuery, type ExpectedPayment } from '../expected/api';
import './reports-future.css';

const HORIZON_OPTIONS: ReadonlyArray<{ value: LiquidityHorizon; label: string }> = [
  { value: '90d', label: '90 Tage' },
  { value: '6m', label: '6 Monate' },
  { value: '12m', label: '12 Monate' },
];
const HORIZON_TITLE: Record<LiquidityHorizon, string> = {
  '90d': 'nächste 90 Tage',
  '6m': 'nächste 6 Monate',
  '12m': 'nächste 12 Monate',
};
const LEVER_TEXT: Record<LiquidityLeverId, { name: string; note: (labels: string[]) => string }> = {
  'pause-future': {
    name: 'Zukunft-Zahlungen 90 Tage aussetzen',
    note: (labels) => `Sparpläne und Rücklagen: ${labels.join(', ')}`,
  },
  'cancel-want': {
    name: 'Wunsch-Verträge kündigen',
    note: (labels) => `ab nächstem Monat: ${labels.join(', ')}`,
  },
  'trim-variable': {
    name: 'Variable Ausgaben um 10 % senken',
    note: () => 'laufende Ausgaben nach Plan, ohne Verträge',
  },
};
const STATUS_TEXT: Record<PlannedEventView['status'], string> = {
  in_horizon: 'im Prognosezeitraum',
  later: 'nach dem Prognosezeitraum',
  past: 'vergangen, zählt nicht mehr',
  off_budget: 'nicht auf Budget-Konten',
  disabled: 'ausgeschaltet',
  unknown_account: 'Konto nicht mehr vorhanden',
};
const monthLong = (month: string) => `${monthName(`${month}-01`)} ${month.slice(0, 4)}`;

export function LiquidityReportPage({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [horizon, setHorizon] = useState<LiquidityHorizon>('6m');
  const [levers, setLevers] = useState<LiquidityLeverId[]>([]);
  const query = useQuery(liquidityQuery(horizon, levers));
  // Never mix cached figures with a failed or loading read of another horizon.
  const view = query.isSuccess ? query.data : undefined;
  return (
    <PageFrame
      verdict={
        view && !query.isFetching && !query.isError
          ? {
              reportId: report.id,
              period: `${view.asOf}..${view.report?.verdictEnd ?? view.asOf}`,
              metric: {
                label: 'Tiefster Prognosestand',
                value: view.report?.low?.cents ?? null,
                unit: 'money',
                better: 'higher',
              },
            }
          : undefined
      }
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis="Budget-Konten, wiederkehrende Zahlungen, Einkommenspausen und geplante Ereignisse"
      standDay={view?.asOf}
    >
      <div className="kview rf-report liquidity-report">
        {query.isPending && <LoadingNote what="Prognose" />}
        {query.isError && (
          <ErrorNote what="Prognose" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {view && !view.available && (
          <EmptyNote action={<AppLink to="/konten">Konten öffnen</AppLink>}>
            Ohne Budget-Konto gibt es nichts zu prognostizieren. Lege unter Konten ein Budget-Konto
            an.
          </EmptyNote>
        )}
        {view?.report && (
          <>
            <ForecastCard
              view={view}
              report={view.report}
              horizon={horizon}
              onHorizon={setHorizon}
              levers={levers}
              stale={query.isFetching}
            />
            <IncomePausesCard view={view} />
            <EventsCard view={view} />
            <LeversCard
              report={view.report}
              onToggle={(id, on) =>
                setLevers((current) => (on ? [...current, id] : current.filter((l) => l !== id)))
              }
            />
            <OutlookCard report={view.report} />
            <MovementsCard report={view.report} />
          </>
        )}
      </div>
    </PageFrame>
  );
}

function ForecastCard({
  view,
  report,
  horizon,
  onHorizon,
  levers,
  stale,
}: {
  view: LiquidityReportView;
  report: LiquidityReport;
  horizon: LiquidityHorizon;
  onHorizon: (h: LiquidityHorizon) => void;
  levers: ReadonlyArray<LiquidityLeverId>;
  stale: boolean;
}) {
  useAmountPrivacy();
  const { verdict, low, lowBuffer, lowPlain } = report;
  const Icon =
    verdict.status === 'ok'
      ? CheckCircle2
      : verdict.status === 'warn'
        ? AlertTriangle
        : AlertCircle;
  const text =
    verdict.status === 'ok'
      ? `Geht sich aus, auch mit ${LIQUIDITY_BUFFER_PERCENT} % Puffer.`
      : verdict.status === 'warn'
        ? `Geht sich knapp aus: ohne Puffer ja, mit ${LIQUIDITY_BUFFER_PERCENT} % Puffer fehlen im ${monthLong(verdict.month ?? '')} ${eur(verdict.shortfallCents, { cents: false })}.`
        : `Geht sich nicht aus: im ${monthLong(verdict.month ?? '')} fehlen ${eur(verdict.shortfallCents, { cents: false })}.`;
  const activeEvents = view.events.filter((e) => e.status === 'in_horizon' || e.status === 'later');
  // Count actual planned occurrences within the six-month verdict window, not old recurrence anchors.
  const eventCount = activeEvents.filter(
    (event) =>
      plannedEventOccurrences(event, addDays(report.startDay, 1), report.verdictEnd).length > 0,
  ).length;
  const chartPauses = view.incomePauses.filter((pause) => pause.coverage === 'applied');
  const chartPauseCount = chartPauses.length;
  const verdictPauseCount = view.incomePauses.filter(
    (pause) => pause.verdictSuppressedOccurrences.length > 0,
  ).length;
  const scenarioBasis =
    chartPauseCount > 0
      ? `Die Cash-Prognose berücksichtigt ${chartPauseCount} ${chartPauseCount === 1 ? 'Einkommenspause' : 'Einkommenspausen'} bei den ausgewiesenen Fälligkeiten. Der hinterlegte Zahlungsplan bleibt unverändert.`
      : verdictPauseCount > 0
        ? `Der 6-Monats-Tiefpunkt berücksichtigt ${verdictPauseCount} ${verdictPauseCount === 1 ? 'Einkommenspause' : 'Einkommenspausen'} außerhalb des gewählten Diagrammzeitraums.`
        : report.eventMarks.length > 0
          ? 'Grundplan aus hinterlegten Zahlungen und variabler Planung, ergänzt um geplante Ereignisse.'
          : activeEvents.length > 0
            ? 'Grundplan aus hinterlegten Zahlungen und variabler Planung. Geplante Ereignisse liegen außerhalb des gewählten Prognosezeitraums.'
            : view.events.length > 0
              ? 'Grundplan aus hinterlegten Zahlungen und variabler Planung. Vorhandene Ereignisse zählen derzeit nicht zur Prognose.'
              : 'Grundplan aus hinterlegten Zahlungen und variabler Planung. Noch keine geplanten Ereignisse eingerichtet; ergänze bei Bedarf unten ein Ereignis.';
  const activeLeverNames = levers.map((id) => LEVER_TEXT[id].name);
  const forecastLabel =
    chartPauseCount > 0
      ? report.eventMarks.length > 0
        ? 'Prognose mit geplanten Ereignissen und Einkommenspausen'
        : 'Prognose mit Einkommenspausen'
      : report.eventMarks.length > 0
        ? 'Prognose mit geplanten Ereignissen'
        : activeEvents.length > 0
          ? 'Grundplan im gewählten Prognosezeitraum'
          : 'Grundplan ohne aktive geplante Ereignisse';
  const verdictInputs = [
    eventCount > 0
      ? `${eventCount} ${eventCount === 1 ? 'geplantem Ereignis' : 'geplanten Ereignissen'}`
      : '',
    verdictPauseCount > 0
      ? `${verdictPauseCount} ${verdictPauseCount === 1 ? 'Einkommenspause' : 'Einkommenspausen'}`
      : '',
  ].filter(Boolean);
  return (
    <section
      className="card rf-card rf-wide"
      aria-labelledby="liq-title"
      aria-busy={stale}
      data-testid="liq-forecast-card"
    >
      <div className="tbd-head">
        <h2 id="liq-title">Budget-Konten · {HORIZON_TITLE[horizon]}</h2>
        <Segmented
          label="Prognosezeitraum"
          options={HORIZON_OPTIONS}
          value={horizon}
          onChange={onHorizon}
        />
      </div>
      <div className={`rf-verdict is-${verdict.status}`} role="status" data-testid="liq-verdict">
        <Icon className="icon" size={20} strokeWidth={1.75} aria-hidden="true" />
        <div>
          <strong>{text}</strong>
          <small>
            6 Monate bis {longDay(report.verdictEnd)} ·{' '}
            {verdictInputs.length > 0
              ? `mit ${verdictInputs.join(' und ')}`
              : 'ohne Ereignisse im Entscheidungszeitraum'}
            {levers.length > 0 &&
              ` und ${levers.length} ${levers.length === 1 ? 'Stellschraube' : 'Stellschrauben'}`}
          </small>
        </div>
      </div>
      <p className="vnote" data-testid="liq-scenario-basis">
        {scenarioBasis}
        {activeLeverNames.length > 0 &&
          ` Vorschau mit aktiver Stellschraube: ${activeLeverNames.join(', ')}.`}
      </p>
      <div className="rf-figs">
        <div>
          <span className="tech" data-testid="liq-low-context">
            {chartPauseCount > 0
              ? report.eventMarks.length > 0
                ? 'Tiefpunkt mit Ereignissen und Einkommenspausen'
                : 'Tiefpunkt mit Einkommenspausen'
              : report.eventMarks.length > 0
                ? 'Tiefpunkt mit Ereignissen'
                : 'Tiefpunkt im Grundplan'}
          </span>
          <strong className={low && low.cents < 0 ? 'is-alert' : undefined} data-testid="liq-low">
            {eur(low?.cents ?? 0)}
          </strong>
          <small>{low ? `am ${shortDay(low.day)} · Ziel ≥ 0 € (R07)` : 'keine Prognose'}</small>
        </div>
        <div>
          <span className="tech">Mit {LIQUIDITY_BUFFER_PERCENT} % Puffer</span>
          <strong data-testid="liq-low-buffer">{eur(lowBuffer?.cents ?? 0)}</strong>
          <small>variable Ausgaben +{LIQUIDITY_BUFFER_PERCENT} %</small>
        </div>
        <div>
          <span className="tech">Ohne Ereignisse</span>
          <strong data-testid="liq-low-plain">{eur(lowPlain?.cents ?? 0)}</strong>
          <small>{lowPlain ? `Tiefpunkt am ${shortDay(lowPlain.day)}` : ''}</small>
        </div>
        <div>
          <span className="tech">Heute</span>
          <strong data-testid="liq-start">{eur(report.startCents)}</strong>
          <small>
            Budget-Konten
            {view.overdraftLimitCents > 0 &&
              `, Rahmen ${eur(view.overdraftLimitCents, { cents: false })} zählt nicht`}
          </small>
        </div>
      </div>
      <LiquidityChart report={report} />
      <ul className="rf-legend" aria-label="Legende" data-testid="liq-legend">
        <li>
          <svg viewBox="0 0 26 8" aria-hidden="true">
            <path className="l-forecast" d="M0 4h26" />
          </svg>
          {forecastLabel}
        </li>
        <li>
          <i className="rf-sq rf-sq-band" aria-hidden="true" />
          {LIQUIDITY_BUFFER_PERCENT} % Puffer auf variable Ausgaben
        </li>
        <li>
          <svg viewBox="0 0 26 8" aria-hidden="true">
            <path className="l-prev" d="M0 4h26" />
          </svg>
          ohne geplante Ereignisse
        </li>
        <li>
          <svg viewBox="0 0 12 10" aria-hidden="true">
            <path className="kote" d="M1 1h10L6 9Z" />
          </svg>
          Tiefpunkt
        </li>
        <li>
          <i className="rf-sq rf-sq-event" aria-hidden="true" />
          geplantes Ereignis
        </li>
      </ul>
      <p className="vnote">
        Kontostand der Budget-Konten, wiederkehrende Zahlungen und Einnahmen an ihren
        Fälligkeitstagen, variable Kategorien nach Plan gleichmäßig über den Monat. Ein
        Überziehungsrahmen zählt nicht als Geld. Rücklagen auf Konten außerhalb des Budgets bleiben
        draußen.
      </p>
    </section>
  );
}

const PAUSE_SOURCE_STATE: Record<IncomePauseView['sourceState'], string> = {
  active: 'Quelle aktiv',
  inactive: 'Quelle inaktiv',
  deleted: 'Quelle gelöscht',
  missing: 'Quelle nicht gefunden',
};

function eligiblePauseSource(payment: ExpectedPayment, asOf: string): boolean {
  return (
    payment.kind === 'inflow' &&
    payment.deletedAt === null &&
    payment.version?.currency === 'EUR' &&
    (payment.startDate === null || payment.startDate <= asOf) &&
    (payment.endDate === null || payment.endDate >= asOf)
  );
}

function IncomePausesCard({ view }: { view: LiquidityReportView }) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const paymentQuery = useQuery(expectedQuery());
  const sources = (paymentQuery.data ?? []).filter((payment) =>
    eligiblePauseSource(payment, view.asOf),
  );
  const [sourceId, setSourceId] = useState('');
  const [startDate, setStartDate] = useState(addDays(view.asOf, 1));
  const [endDate, setEndDate] = useState(addDays(view.asOf, 1));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const editing = view.incomePauses.find((pause) => pause.id === editingId);
  if (editingId !== null && !editing) {
    setEditingId(null);
    setSourceId('');
    setStartDate(addDays(view.asOf, 1));
    setEndDate(addDays(view.asOf, 1));
    setRangeError(null);
  }
  const selectedSourceId = editing
    ? sourceId
    : sources.some((payment) => payment.id === sourceId)
      ? sourceId
      : (sources[0]?.id ?? '');
  const source = sources.find((payment) => payment.id === selectedSourceId);

  const reset = () => {
    setEditingId(null);
    setSourceId('');
    setStartDate(addDays(view.asOf, 1));
    setEndDate(addDays(view.asOf, 1));
    setRangeError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!source) return;
    if (endDate < startDate) return setRangeError('Das Ende darf nicht vor dem Beginn liegen.');
    setRangeError(null);
    const input = { sourceId: source.id, startDate, endDate };
    const saved = await write(
      () => (editing ? patchIncomePause(editing.id, input) : createIncomePause(input)),
      () => `Einkommenspause für „${source.name}“ gespeichert.`,
    );
    if (saved) reset();
  };

  const sourceName = (pause: IncomePauseView) =>
    pause.sourceName ?? `Unbekannte Quelle (${pause.sourceId})`;

  const coverageText = (pause: IncomePauseView) => {
    if (pause.coverage === 'applied') return null;
    if (pause.sourceState === 'deleted' || pause.sourceState === 'missing')
      return 'Diese Quelle liefert derzeit keine Prognosezahlung.';
    if (pause.sourceState === 'inactive') return 'Die Quelle ist derzeit inaktiv.';
    if (pause.coverage === 'outside_horizon') return 'Außerhalb des gewählten Prognosezeitraums.';
    if (pause.coverage === 'outside_budget') return 'Die Quelle liegt außerhalb der Budget-Konten.';
    if (pause.coverage === 'foreign_currency')
      return 'Fremdwährungsfälligkeiten bleiben unverändert; die Pause gilt nur für native EUR-Einnahmen.';
    if (pause.coverage === 'zero_amount')
      return 'Die EUR-Fälligkeit beträgt 0,00 € und bleibt unverändert.';
    return 'In diesem Zeitraum gibt es keine passende Fälligkeit.';
  };

  return (
    <section className="card rf-card rf-main" aria-labelledby="liq-pauses">
      <div className="tbd-head">
        <h2 id="liq-pauses">Einkommenspausen</h2>
      </div>
      <p className="vnote">
        Eine Pause setzt passende wiederkehrende EUR-Einnahmen in der Cash-Prognose auf 0 €. Der
        hinterlegte Zahlungsplan und der normale Einnahmenbericht bleiben unverändert.
      </p>
      {view.incomePauses.length === 0 ? (
        <p className="muted" role="status">
          Keine Einkommenspausen eingerichtet.
        </p>
      ) : (
        <ul className="rf-pause-list" data-testid="liq-income-pauses">
          {view.incomePauses.map((pause) => (
            <li key={pause.id} data-testid="liq-income-pause">
              <div className="rf-pause-source">
                <strong>{sourceName(pause)}</strong>
                <small>
                  {longDay(pause.startDate)} bis {longDay(pause.endDate)} ·{' '}
                  {PAUSE_SOURCE_STATE[pause.sourceState]}
                </small>
              </div>
              <div className="rf-pause-effect">
                {pause.suppressedOccurrences.length > 0 ||
                pause.verdictSuppressedOccurrences.length > 0 ||
                pause.unchangedOccurrences.length > 0 ? (
                  <div>
                    {pause.coverage === 'outside_horizon' &&
                      pause.verdictSuppressedOccurrences.length === 0 && (
                        <small>{coverageText(pause)}</small>
                      )}
                    {pause.suppressedOccurrences.length > 0 ? (
                      <ul aria-label={`Ausgesetzte Fälligkeiten für ${sourceName(pause)}`}>
                        {pause.suppressedOccurrences.map((occurrence) => (
                          <li key={occurrence.dueDate}>
                            {longDay(occurrence.dueDate)} · {eur(occurrence.amountCents)} Einnahme
                            ausgesetzt
                          </li>
                        ))}
                      </ul>
                    ) : pause.verdictSuppressedOccurrences.length > 0 ? (
                      <>
                        <small>
                          Außerhalb des Diagrammzeitraums; wirkt auf den 6-Monats-Tiefpunkt.
                        </small>
                        <ul aria-label={`Auswirkung auf den Tiefpunkt für ${sourceName(pause)}`}>
                          {pause.verdictSuppressedOccurrences.map((occurrence) => (
                            <li key={occurrence.dueDate}>
                              {longDay(occurrence.dueDate)} · {eur(occurrence.amountCents)} Einnahme
                              ausgesetzt
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {pause.unchangedOccurrences.length > 0 && (
                      <ul aria-label={`Unveränderte Fälligkeiten für ${sourceName(pause)}`}>
                        {pause.unchangedOccurrences.map((occurrence) => (
                          <li key={`${occurrence.dueDate}-${occurrence.reason}`}>
                            {longDay(occurrence.dueDate)} ·{' '}
                            {occurrence.reason === 'foreign_currency'
                              ? `${occurrence.currency}-Fälligkeit bleibt unverändert; Pause gilt nur für native EUR-Einnahmen.`
                              : '0,00 € Fälligkeit bleibt unverändert.'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <small>{coverageText(pause)}</small>
                )}
              </div>
              <div className="rf-pause-actions">
                <Button
                  variant="ghost"
                  className="rf-pause-action"
                  aria-label={`Pause für ${sourceName(pause)} bearbeiten`}
                  onClick={() => {
                    setEditingId(pause.id);
                    setSourceId(pause.sourceId);
                    setStartDate(pause.startDate);
                    setEndDate(pause.endDate);
                    setRangeError(null);
                  }}
                >
                  Bearbeiten
                </Button>
                <button
                  type="button"
                  className="rf-icon-btn"
                  aria-label={`Pause für ${sourceName(pause)} entfernen`}
                  onClick={() =>
                    void write(
                      () => deleteIncomePause(pause.id),
                      () => `Einkommenspause für „${sourceName(pause)}“ entfernt.`,
                    )
                  }
                >
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {paymentQuery.isPending ? (
        <LoadingNote what="Einnahmequellen" />
      ) : paymentQuery.isError ? (
        <ErrorNote
          what="Einnahmequellen"
          error={paymentQuery.error}
          onRetry={() => void paymentQuery.refetch()}
        />
      ) : (
        <form
          className="rf-add rf-pause-form"
          onSubmit={(event) => void submit(event)}
          noValidate
          aria-label={editing ? 'Einkommenspause bearbeiten' : 'Einkommenspause einrichten'}
        >
          <div className="rf-f">
            <Field label="Einnahmequelle">
              {({ id }) => (
                <Select
                  id={id}
                  value={selectedSourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  disabled={sources.length === 0}
                  required
                >
                  {editing && !sources.some((payment) => payment.id === editing.sourceId) && (
                    <option value={editing.sourceId} disabled>
                      {sourceName(editing)} · nicht verfügbar
                    </option>
                  )}
                  {sources.map((payment) => (
                    <option key={payment.id} value={payment.id}>
                      {payment.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="rf-f">
            <Field label="Beginn">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  required
                />
              )}
            </Field>
          </div>
          <div className="rf-f">
            <Field label="Ende">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  value={endDate}
                  min={startDate || addDays(view.asOf, 1)}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              )}
            </Field>
          </div>
          <div className="rf-pause-submit">
            <Button type="submit" variant="ghost" className="rf-pause-action" disabled={!source}>
              {editing ? 'Pause speichern' : 'Pause einrichten'}
            </Button>
            {editing && (
              <Button variant="ghost" className="rf-pause-action" onClick={reset}>
                Abbrechen
              </Button>
            )}
          </div>
          {sources.length === 0 && !paymentQuery.isPending && (
            <p className="muted rf-pause-empty">
              Keine aktiven wiederkehrenden EUR-Einnahmen verfügbar.
            </p>
          )}
          {rangeError && (
            <p className="field-error rf-add-error" role="alert">
              {rangeError}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

function EventsCard({ view }: { view: LiquidityReportView }) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const today = view.asOf;
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [kind, setKind] = useState<'-1' | '1'>('-1');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<{ field: 'name' | 'date' | 'amount'; text: string } | null>(
    null,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseAmount(amount);
    if (name.trim() === '')
      return setError({ field: 'name', text: 'Bitte das Ereignis benennen.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= today)
      return setError({ field: 'date', text: 'Bitte ein Datum nach heute wählen.' });
    if (!parsed.ok || parsed.cents <= 0)
      return setError({ field: 'amount', text: 'Bitte einen Betrag über 0 eingeben.' });
    setError(null);
    const saved = await write(
      () =>
        createPlannedEvent({
          name: name.trim(),
          date,
          amountCents: Number(kind) * parsed.cents,
        }),
      (r) => `„${r.event.name}“ eingeplant.`,
    );
    if (saved) {
      setName('');
      setAmount('');
    }
  };

  return (
    <section className="card rf-card rf-main" aria-labelledby="liq-events">
      <div className="tbd-head">
        <h2 id="liq-events">Geplante Ereignisse</h2>
      </div>
      {view.events.length === 0 ? (
        <p className="muted" role="status">
          Keine Ereignisse geplant.
        </p>
      ) : (
        <div
          className="rf-scroll"
          role="region"
          aria-label="Geplante Ereignisse, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table on narrow viewports.
          tabIndex={0}
        >
          <p className="table-scroll-hint">Seitlich wischen für weitere Spalten</p>
          <table className="rf-table rf-events">
            <thead>
              <tr>
                <th className="tech">Datum / Beginn</th>
                <th className="tech">Ereignis</th>
                <th className="tech n">Betrag</th>
                <th className="tech">Zählt</th>
                <th>
                  <span className="sr-only">Entfernen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.events.map((e) => (
                <EventRow key={e.id} event={e} write={write} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="rf-add"
        onSubmit={(e) => void submit(e)}
        noValidate
        aria-label="Ereignis einplanen"
      >
        <div className="rf-f">
          <Field label="Ereignis">
            {({ id }) => (
              <TextInput
                id={id}
                value={name}
                maxLength={80}
                autoComplete="off"
                placeholder="z. B. Autoreparatur"
                aria-invalid={error?.field === 'name'}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="rf-f">
          <Field label="Datum">
            {({ id }) => (
              <TextInput
                id={id}
                type="date"
                value={date}
                min={today}
                aria-invalid={error?.field === 'date'}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="rf-f">
          <Field label="Art">
            {({ id }) => (
              <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as '-1' | '1')}>
                <option value="-1">Ausgabe</option>
                <option value="1">Einnahme</option>
              </Select>
            )}
          </Field>
        </div>
        <div className="rf-f">
          <AmountInput
            label="Betrag"
            value={amount}
            onChange={setAmount}
            sign={kind === '-1' ? '−' : '+'}
            error={error?.field === 'amount' ? error.text : undefined}
          />
        </div>
        <Button variant="ghost" size="sm" type="submit">
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
          Ereignis
        </Button>
        {error && error.field !== 'amount' && (
          <p className="field-error rf-add-error" role="alert">
            {error.text}
          </p>
        )}
      </form>
      <p className="vnote">
        Zusätzliche einmalige und wiederkehrende Ausgaben oder Einnahmen verändern die Prognose
        sofort; „Zählt“ schaltet ein Ereignis aus, ohne es zu löschen. Kategorien, Wiederholungen
        und Änderungen pflegst du in <AppLink to="/plan/jahr">Plan · Jahr</AppLink>.
      </p>
    </section>
  );
}

function EventRow({
  event: e,
  write,
}: {
  event: PlannedEventView;
  write: ReturnType<typeof useBudgetWrite>;
}) {
  useAmountPrivacy();
  const muted = e.status === 'past' || e.status === 'disabled' || e.status === 'off_budget';
  return (
    <tr className={muted ? 'is-muted' : undefined} data-testid="liq-event">
      <td>{longDay(e.date)}</td>
      <td>
        {e.name}
        <small>
          {STATUS_TEXT[e.status]}
          {e.recurrence !== 'once' && ' · wiederkehrend'}
          {e.accountName ? ` · ${e.accountName}` : ''}
        </small>
      </td>
      <td className="n">
        <strong>{eur(e.amountCents, { sign: true })}</strong>
      </td>
      <td>
        <Switch
          label={`${e.name} berücksichtigen`}
          checked={e.enabled}
          onChange={(enabled) =>
            void write(
              () => patchPlannedEvent(e.id, { enabled }),
              () => (enabled ? `„${e.name}“ zählt wieder.` : `„${e.name}“ zählt nicht mehr.`),
            )
          }
        />
      </td>
      <td className="n">
        <button
          type="button"
          className="rf-icon-btn"
          aria-label={`${e.name} entfernen`}
          onClick={() =>
            void write(
              () => deletePlannedEvent(e.id),
              () => `„${e.name}“ entfernt.`,
            )
          }
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function LeversCard({
  report,
  onToggle,
}: {
  report: LiquidityReport;
  onToggle: (id: LiquidityLeverId, on: boolean) => void;
}) {
  useAmountPrivacy();
  const levers = report.levers.filter((l) => l.available || l.active);
  return (
    <section className="card rf-card rf-side" aria-labelledby="liq-levers">
      <div className="tbd-head">
        <h2 id="liq-levers">Stellschrauben</h2>
      </div>
      {levers.length === 0 ? (
        <p className="muted" role="status">
          Im Hauptbuch gibt es noch nichts, woran die Prognose drehen könnte.
        </p>
      ) : (
        <ul className="rf-levers">
          {levers.map((l) => (
            <li key={l.id}>
              <label className="rf-lever">
                <input
                  type="checkbox"
                  checked={l.active}
                  onChange={(e) => onToggle(l.id, e.target.checked)}
                />
                <span>
                  <strong>{LEVER_TEXT[l.id].name}</strong>
                  <small>{LEVER_TEXT[l.id].note(l.labels)}</small>
                </span>
                <span className="rf-gain" data-testid={`lever-gain-${l.id}`}>
                  {l.active ? 'aktiv' : eur(l.gainCents, { cents: false, sign: true })}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="vnote">
        Rechts: um so viel hebt die Stellschraube den Tiefpunkt der nächsten 6 Monate. Der
        Notgroschen bleibt unangetastet (R02).
      </p>
    </section>
  );
}

function OutlookCard({ report }: { report: LiquidityReport }) {
  useAmountPrivacy();
  return (
    <section className="card rf-card rf-wide" aria-labelledby="liq-outlook">
      <div className="tbd-head">
        <h2 id="liq-outlook">Vorausschau je Monat</h2>
        <span className="tbd-state">
          <span className="ink">bis {shortDay(report.verdictEnd)}</span>
        </span>
      </div>
      <div
        className="rf-scroll"
        role="region"
        aria-label="Vorausschau je Monat, bei Bedarf horizontal verschiebbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table on narrow viewports.
        tabIndex={0}
      >
        <p className="table-scroll-hint">Seitlich wischen für weitere Spalten</p>
        <table className="rf-table" data-testid="liq-outlook">
          <thead>
            <tr>
              <th className="tech">Monat</th>
              <th className="tech n">Anfang</th>
              <th className="tech n">Einnahmen</th>
              <th className="tech n">Zahlungen</th>
              <th className="tech n">Variabel (Plan)</th>
              <th className="tech n">Ereignisse</th>
              <th className="tech n">Ende</th>
              <th className="tech n">Tiefpunkt</th>
              <th className="tech n">mit Puffer</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((m, i) => (
              <tr key={m.month}>
                <td>
                  {monthLong(m.month)}
                  {i === 0 && m.partialStart && <small>ab {shortDay(report.startDay)}</small>}
                </td>
                <td className="n">{eur(m.startCents)}</td>
                <td className="n">{eur(m.incomeCents, { sign: true })}</td>
                <td className="n">{eur(m.fixedCents)}</td>
                <td className="n">{eur(m.variableCents)}</td>
                <td className="n">
                  {m.eventCents ? (
                    <strong>{eur(m.eventCents, { sign: true })}</strong>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
                <td className="n">
                  <strong>{eur(m.endCents)}</strong>
                  {m.partialEnd && <small>am {shortDay(report.verdictEnd)}</small>}
                </td>
                <td className={`n${m.lowCents < 0 ? ' is-alert' : ''}`}>{eur(m.lowCents)}</td>
                <td className={`n${m.lowBufferCents < 0 ? ' is-short' : ' muted'}`}>
                  {eur(m.lowBufferCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MovementsCard({ report }: { report: LiquidityReport }) {
  useAmountPrivacy();
  return (
    <section className="card rf-card rf-wide" aria-labelledby="liq-moves">
      <div className="tbd-head">
        <h2 id="liq-moves">Große Bewegungen je Monat</h2>
      </div>
      <div
        className="rf-scroll"
        role="region"
        aria-label="Große Bewegungen je Monat, bei Bedarf horizontal verschiebbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table on narrow viewports.
        tabIndex={0}
      >
        <p className="table-scroll-hint">Seitlich wischen für weitere Spalten</p>
        <table className="rf-table rf-moves">
          <thead>
            <tr>
              <th className="tech">Datum</th>
              <th className="tech">Bewegung</th>
              <th className="tech n">Betrag</th>
              <th className="tech n">Saldo danach</th>
            </tr>
          </thead>
          {report.movements.map((b) => (
            <tbody key={b.month}>
              <tr className="rf-grp">
                <th scope="colgroup" colSpan={3}>
                  {monthLong(b.month)}
                </th>
                <td className="n">{eur(b.startCents)}</td>
              </tr>
              {b.rows.map((r, i) => (
                <tr key={`${r.day}-${i}`} className={r.planned ? 'is-event' : undefined}>
                  <td>{shortDay(r.day)}</td>
                  <td>
                    {r.planned && <i className="rf-sq rf-sq-event" aria-hidden="true" />}
                    {r.label}
                    {r.planned && <small>geplantes Ereignis</small>}
                  </td>
                  <td className="n">{eur(r.cents, { sign: true })}</td>
                  <td className="n">{eur(r.afterCents)}</td>
                </tr>
              ))}
              <tr className="is-rest">
                <td>{shortDay(b.lastDay)}</td>
                <td>Variable Ausgaben und kleine Zahlungen im Monat</td>
                <td className="n">{eur(b.restCents, { sign: true })}</td>
                <td className="n">
                  <strong>{eur(b.endCents)}</strong>
                </td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>
      <p className="vnote">
        Je Monat: Anfang, Bewegungen ab 250 € und geplante Ereignisse, der Rest als eine Zeile,
        Ende. Wiederkehrende Zahlungen kommen aus den gespeicherten Verträgen, variable Kategorien
        nach Plan. Zahlungen von Konten außerhalb des Budgets stehen nicht darin.
      </p>
    </section>
  );
}
