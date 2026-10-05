import { chartPoints } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
  maskMoneyText,
  ChartSvg,
  Graticule,
  Line,
  LineLegend,
  RevisionTable,
  type Point,
} from '@budget/ui';
import {
  dayCounts,
  lastDayOfMonth,
  ruleTimelines,
  STAGES,
  type DayCounts,
  type RuleTimeline,
} from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { stageRange, thresholdText } from '../rules/rules-model';
import { finanzcheckVerlaufQuery, type FinanzcheckVerlauf } from './finanzcheck-api';
import { useRuleDerivation } from './overview-api';
import { monthLong, monthShortYear } from './overview-format';
import './overview-reports.css';
import './finanzcheck-report.css';

type Status = 'ok' | 'warn' | 'bad' | 'open' | null;

const STATUS_TEXT: Record<'ok' | 'warn' | 'bad' | 'open', string> = {
  ok: 'erfüllt',
  warn: 'Warnung',
  bad: 'verletzt',
  open: 'offen',
};

function StatusMark({ status }: { status: Status }) {
  useAmountPrivacy();
  const key = status ?? 'open';
  const Icon =
    key === 'ok'
      ? CheckCircle2
      : key === 'bad'
        ? AlertCircle
        : key === 'warn'
          ? AlertTriangle
          : CircleDashed;
  return (
    <span className={`ov-status is-${key}`}>
      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
      {status === null ? 'nicht bewertbar' : STATUS_TEXT[status]}
    </span>
  );
}

/** "seit 31.08.2026", or "seit Sep 25 oder länger" when the run reaches the first day shown. */
function sinceText(line: RuleTimeline): string {
  if (line.sinceDay === null) return '';
  return line.sinceStart
    ? `seit ${monthShortYear(line.sinceDay)} oder länger`
    : `seit ${longDay(line.sinceDay)}`;
}

const dayLabel = (day: string) =>
  day === lastDayOfMonth(day.slice(0, 7)) ? monthShortYear(day) : longDay(day).slice(0, 6);

const stripLabel = (line: RuleTimeline) =>
  `Verlauf ${line.code}: ${line.strip
    .map(
      (c) => `${dayLabel(c.asOf)} ${c.status === null ? 'nicht bewertbar' : STATUS_TEXT[c.status]}`,
    )
    .join(', ')}`;

export function FinanzcheckReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const query = useQuery(finanzcheckVerlaufQuery());
  const data = query.data;
  const days = data?.matrix.days ?? [];
  // Re-derive idempotently once on every visit, including changes to book-rule sources.
  useRuleDerivation(data !== undefined);
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : days.length > 0
            ? `${days.length} Auswertungstage bis ${longDay(days[days.length - 1] as string)}`
            : query.data
              ? 'keine gespeicherten Ergebnisse'
              : 'wird geladen'
      }
    >
      <div className="kview ov finanzcheck-report">
        {query.isPending && <LoadingNote what="Finanz-Check-Verlauf" />}
        {query.isError && (
          <ErrorNote
            what="Finanz-Check-Verlauf"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}

        {data && <Body data={data} />}
      </div>
    </PageFrame>
  );
}

function Body({ data }: { data: FinanzcheckVerlauf }) {
  useAmountPrivacy();
  const { matrix, check, book } = data;
  const timelines = ruleTimelines(matrix);
  const counts = dayCounts(matrix);
  const rules = new Map(book.rules.map((r) => [r.code, r]));
  const current = check.stage;
  const next = STAGES.find((s) => s.stage === current.stage + 1);
  const stageItems = (stage: number) => check.checklist.items.filter((i) => i.stage === stage);
  const open = timelines.filter((t) => t.current !== null && t.current !== 'ok');
  const firstBad = open.findIndex((t) => t.current === 'bad');
  const byCode = [...timelines].sort((a, b) => a.code.localeCompare(b.code));
  const empty = matrix.days.length === 0;

  return (
    <>
      <section className="card ov-card" aria-labelledby="fc-stage">
        <div className="tbd-head">
          <h2 id="fc-stage">
            Stufe {current.stage} von {STAGES.length}: {current.label}
          </h2>
          <span className="tbd-state">
            <span className="ink">Nettovermögen {eur(check.netWorthCents, { cents: false })}</span>
          </span>
        </div>
        <ol className="fc-stages" aria-label="Stufen nach Nettovermögen">
          {STAGES.map((s) => (
            <li
              key={s.stage}
              className={
                s.stage === current.stage ? 'is-cur' : s.stage < current.stage ? 'is-done' : ''
              }
              aria-current={s.stage === current.stage ? 'step' : undefined}
            >
              <strong>
                <span className="ov-pos">{s.stage}</span>
                {s.label}
              </strong>
              <small>{stageRange(s.stage)}</small>
              {s.stage === current.stage && (
                <>
                  <span
                    className="fc-progress"
                    role="progressbar"
                    aria-label={`Fortschritt in Stufe ${s.stage}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(current.progressBp / 100)}
                  >
                    <i style={{ width: `${current.progressBp / 100}%` }} />
                  </span>
                  <small>
                    {Math.round(current.progressBp / 100)} % · noch{' '}
                    {eur(current.remainingCents, { cents: false })}
                  </small>
                </>
              )}
            </li>
          ))}
        </ol>
        <div className="ov-split fc-stage-rules">
          <div>
            <h3 className="tech">Regeln dieser Stufe</h3>
            {stageItems(current.stage).length === 0 ? (
              <p className="ov-empty">Für diese Stufe sind keine Punkte aktiv.</p>
            ) : (
              <table className="ov-table">
                <caption className="sr-only">Regeln der aktuellen Stufe</caption>
                <thead className="sr-only">
                  <tr>
                    <th>Regel</th>
                    <th>Stand</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stageItems(current.stage).map((item) => (
                    <tr key={item.code}>
                      <td>
                        <span className="ov-name">{item.text}</span>
                        <small>
                          {item.source ?? ''}
                          {item.ruleCode ? ` · ${item.ruleCode}` : ''}
                        </small>
                      </td>
                      <td>{maskMoneyText(item.valueText ?? '')}</td>
                      <td>
                        <StatusMark status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {next && (
            <div>
              <h3 className="tech">
                Als Nächstes: Stufe {next.stage} {next.label}
              </h3>
              <ul className="fc-next">
                {stageItems(next.stage).map((item) => (
                  <li key={item.code}>
                    <strong>{item.text}</strong>
                    <small>
                      {item.source ?? ''}
                      {item.valueText ? ` · ${maskMoneyText(item.valueText)}` : ''}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <p className="ov-note">
          Regeln aus I Will Teach You to Be Rich, Get Good with Money, Your Money or Your Life und
          Everyday Millionaires, in den Einstellungen änderbar. Haltung: Kein Report bewertet eine
          Ausgabe als Fehler; Regeln zeigen den Abstand zum Ziel.
        </p>
      </section>

      <div className="ov-split">
        <section className="card ov-card" aria-labelledby="fc-today">
          <div className="tbd-head">
            <h2 id="fc-today">Heute</h2>
            <span className="tbd-state">
              <span className={check.counts.bad > 0 ? 'neg-alert' : 'ok'}>
                {check.counts.bad} verletzt, {check.counts.warn} Warnung
              </span>
            </span>
          </div>
          <div className="ov-figs">
            <div>
              <strong data-testid="fc-ok-count">{check.counts.ok}</strong>
              <small>
                von {check.counts.total} erfüllt
                {check.counts.notEvaluated > 0
                  ? ` · ${check.counts.notEvaluated} nicht bewertbar`
                  : ''}
              </small>
            </div>
          </div>
          <div
            className="ov-cells"
            role="img"
            aria-label={`${check.counts.ok} erfüllt, ${check.counts.warn} Warnung, ${check.counts.bad} verletzt`}
          >
            {byCode.map((t) => (
              <span
                key={t.code}
                className={`ov-cell is-${t.current ?? 'none'}`}
                title={`${t.code} ${t.name}: ${t.current === null ? 'nicht bewertbar' : STATUS_TEXT[t.current]}`}
              />
            ))}
          </div>
          {empty ? (
            <p className="ov-empty">
              Es sind noch keine Regelergebnisse gespeichert; sie werden gerade berechnet.
            </p>
          ) : (
            <VerlaufChart counts={counts} total={check.counts.total} />
          )}
        </section>

        <section className="card ov-card" aria-labelledby="fc-actions">
          <div className="tbd-head">
            <h2 id="fc-actions">Maßnahmen</h2>
          </div>
          <RevisionTable
            caption="Maßnahmen zu Regeln, die nicht erfüllt sind"
            empty="Alle bewertbaren Regeln sind erfüllt."
            headers={{ revision: 'Rev.', change: 'Regel und Schritt', action: '' }}
            rows={open.map((t, i) => {
              const rule = rules.get(t.code);
              return {
                id: t.code,
                letter: String.fromCharCode(65 + (i % 26)),
                title: `${t.code} ${t.name}`,
                detail:
                  rule?.latest?.actionText ??
                  rule?.action ??
                  'Schwelle in den Einstellungen prüfen.',
                urgent: i === firstBad,
              };
            })}
          />
        </section>
      </div>

      <section className="card ov-card" aria-labelledby="fc-matrix">
        <div className="tbd-head">
          <h2 id="fc-matrix">
            {timelines.length} aktive Regeln, {matrix.days.length} Auswertungstage
          </h2>
        </div>
        {empty ? (
          <p className="ov-empty">
            Es sind noch keine Regelergebnisse gespeichert; sie werden gerade berechnet.
          </p>
        ) : (
          <div
            className="ov-scroll"
            role="region"
            aria-label="Regelwerk mit Verlauf, bei Bedarf horizontal verschiebbar"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the wide table.
            tabIndex={0}
          >
            <table className="ov-table fc-table">
              <thead>
                <tr>
                  <th className="tech">Regel</th>
                  <th className="tech">Stand</th>
                  <th className="tech">Schwelle</th>
                  <th className="tech">
                    Verlauf {monthShortYear(matrix.days[0] as string)} bis{' '}
                    {longDay(matrix.days[matrix.days.length - 1] as string).slice(0, 6)}
                  </th>
                  <th className="tech">Status</th>
                </tr>
              </thead>
              <tbody>
                {timelines.map((t) => {
                  const rule = rules.get(t.code);
                  return (
                    <tr key={t.code} data-rule={t.code}>
                      <td>
                        <span className="ov-pos">{t.code}</span>
                        <span className="ov-name">{t.name}</span>
                      </td>
                      <td>{maskMoneyText(rule?.latest?.valueText ?? '–')}</td>
                      <td className="muted">{rule ? thresholdText(t.code, rule.params) : ''}</td>
                      <td>
                        <span className="ov-strip" role="img" aria-label={stripLabel(t)}>
                          {t.strip.map((c) => (
                            <span
                              key={c.asOf}
                              className={`ov-cell is-${c.status ?? 'none'}`}
                              title={`${dayLabel(c.asOf)}: ${c.status === null ? 'nicht bewertbar' : STATUS_TEXT[c.status]}${c.valueText ? ` · ${maskMoneyText(c.valueText)}` : ''}`}
                            />
                          ))}
                        </span>
                      </td>
                      <td>
                        <StatusMark status={t.current} />
                        <small>{sinceText(t)}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ov-note">
          Gespeicherte Ergebnisse der letzten zwölf Monatsenden und von heute. Schwellen sind
          Vorschläge aus dem Regelwerk und unter Einstellungen änderbar; jede Regel lässt sich
          abschalten. Ein Tag ohne Daten bleibt „nicht bewertbar“.
        </p>
      </section>
    </>
  );
}

/** Count of fulfilled rules per evaluated day: flat segments, dashed line at "all rules". */
function VerlaufChart({ counts, total }: { counts: DayCounts[]; total: number }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = 200;
  const left = 34;
  const right = 14;
  const top = 14;
  const bottom = 168;
  const plot = Math.max(1, width - left - right);
  const slot = plot / Math.max(counts.length, 1);
  const x = (i: number) => left + (i + 0.5) * slot;
  const y = (v: number) => bottom - (v / Math.max(total, 1)) * (bottom - top);
  const step = total > 8 ? 4 : 2;
  const grid = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const points: Point[] = counts.flatMap(
    (c, i) =>
      [
        [x(i) - slot * 0.4, y(c.ok)],
        [x(i) + slot * 0.4, y(c.ok)],
      ] as Point[],
  );
  const every = slot < 44 ? 2 : 1;
  const last = counts[counts.length - 1] as DayCounts;
  const label = `Erfüllte Regeln je Auswertungstag: ${counts
    .map((c) => `${dayLabel(c.asOf)} ${c.ok}`)
    .join(', ')} von ${total}.`;
  return (
    <div ref={ref} className="ov-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          label={label}
          testId="fc-chart"
          points={chartPoints(
            counts.map((c) => c.asOf),
            x,
            [
              {
                name: 'Erfüllte Regeln',
                values: counts.map((c) => c.ok),
                color: 'var(--line)',
                format: String,
              },
              {
                name: 'Alle Regeln',
                values: counts.map(() => total),
                color: 'var(--line-2)',
                format: String,
              },
            ],
          )}
        >
          <Graticule
            x1={left}
            x2={width - right}
            lines={grid.map((v) => ({ y: y(v), label: String(v) }))}
          />
          <Line
            points={[
              [left, y(total)],
              [width - right, y(total)],
            ]}
            kind="plan"
          />
          <Line points={points} kind="actual" />
          {counts.map((c, i) =>
            (counts.length - 1 - i) % every === 0 ? (
              <text key={c.asOf} x={x(i)} y={height - 8} textAnchor="middle" className="svg-label">
                {i === counts.length - 1 && c.asOf !== lastDayOfMonth(c.asOf.slice(0, 7))
                  ? 'heute'
                  : monthShortYear(c.asOf)}
              </text>
            ) : null,
          )}
          <text
            x={x(counts.length - 1) + slot * 0.4}
            y={y(last.ok) - 8}
            textAnchor="end"
            className="svg-label-strong"
          >
            {last.ok} erfüllt
          </text>
        </ChartSvg>
      )}
      <LineLegend
        items={[
          { kind: 'actual', label: 'Erfüllte Regeln' },
          { kind: 'plan', label: `Alle ${total} Regeln` },
        ]}
      />
      <p className="ov-note">
        Monatsenden der letzten zwölf Monate, zuletzt heute. {monthLong(last.asOf)}.
      </p>
    </div>
  );
}
