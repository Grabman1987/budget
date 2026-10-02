import { cents, formatDecimal, todayInVienna } from '@budget/domain';
import {
  Button,
  ClassSwatch,
  Count,
  DimensionChain,
  RevisionTriangle,
  Select,
  cx,
  type DimensionChainTerm,
} from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Info,
} from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { expectedQuery } from '../expected/api';
import { PLAN_MONAT } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { eur, eurParts } from '../ledger/format';
import { accountsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { useMonth } from '../shell/use-month';
import { assign, budgetQuery, type BudgetMonthView } from './budget-api';
import { CategoryIcon } from './category-icon';
import { CoverChoice, useCover } from './cover-choice';
import { IncomeButton, IncomePanel } from '../expected/income-panel';
import { EnvelopePanel } from './envelope-panel';
import { STAGES } from './labels';
import {
  assignGuard,
  barFor,
  CLASS_TEXT,
  coverFromToBeAssigned,
  coverSource,
  expectedDues,
  groupStatus,
  isCard,
  isCashOver,
  monthStatus,
  planGroups,
  planRows,
  readAssign,
  splitState,
  statusText,
  suggestions,
  unassignPlan,
  type PlanContext,
  type PlanGroup,
  type PlanRow,
  type PlanView,
} from './plan-model';
import { useBudgetWrite } from './use-category-writes';

/** `05.10.` of `2026-10-05`. */
const dayMonth = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;

const VIEWS = [
  { value: 'stage', label: 'Wasserfall' },
  { value: 'time', label: 'Zeit' },
  { value: 'group', label: 'Gruppen' },
  { value: 'class', label: 'Klassen' },
] as const;
const RAIL_LABEL = {
  stage: 'Wasserfall-Stufen',
  time: 'Fälligkeiten',
  group: 'Gruppen',
  class: 'Klassen',
  triage: 'Triage',
};

/**
 * Plan › Monat (port of `design/prototype/plan.html`): "Zu verteilen" with its dimension chain and
 * the 50/30/20 band, the triage bar when something needs action, the waterfall rail and the parts
 * list of the envelopes. Every figure comes from `/api/budget/:month`.
 */
export function PlanMonthPage() {
  const [month] = useMonth();
  const budget = useQuery(budgetQuery(month));
  const data = budget.data;
  // The month's income (title block and chain term) opens received against expected.
  const [incomeOpen, setIncomeOpen] = useState(false);
  const income = data ? (
    <IncomeButton value={eur(data.summary.incomeCents)} onOpen={() => setIncomeOpen(true)} />
  ) : (
    '–'
  );
  return (
    <PageFrame meta={PLAN_MONAT} income={income}>
      <div className="plan">
        {budget.isPending && <LoadingNote what="Envelopes" />}
        {budget.isError && (
          <ErrorNote what="Envelopes" error={budget.error} onRetry={() => void budget.refetch()} />
        )}
        {data && (
          <PlanBody key={month} month={month} data={data} onIncome={() => setIncomeOpen(true)} />
        )}
      </div>
      <IncomePanel
        month={month}
        open={incomeOpen}
        onClose={() => setIncomeOpen(false)}
        bookedCents={data?.summary.incomeCents}
      />
    </PageFrame>
  );
}

function PlanBody({
  month,
  data,
  onIncome,
}: {
  month: string;
  data: BudgetMonthView;
  onIncome: () => void;
}) {
  const write = useBudgetWrite();
  const accounts = useQuery(accountsQuery()).data?.accounts ?? [];
  const expected = useQuery(expectedQuery()).data;
  const [view, setView] = useState<PlanView>('stage');
  const [distribute, setDistribute] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, string>>({});
  /** Triage row whose "Decken" from "Zu verteilen" waits for the choice (not enough money). */
  const [choosing, setChoosing] = useState<string | null>(null);

  const s = data.summary;
  const today = todayInVienna();
  const ctx: PlanContext = {
    month,
    today,
    cardName: (id) => accounts.find((a) => a.id === id)?.name ?? 'Kreditkarte',
    ...(expected && { expected: expectedDues(expected) }),
  };
  const rows = planRows(data);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = planGroups(view, rows, data, ctx);
  const tba = s.toBeAssignedCents;
  const sug = distribute ? suggestions(rows, tba) : {};
  const urgent = rows.filter(isCashOver);
  const credit = rows.filter((r) => !isCashOver(r) && r.creditOverspentCents > 0);

  const setAssigned = (r: PlanRow, value: number) =>
    value !== r.assignedCents &&
    void write(
      () => assign(month, [{ categoryId: r.id, assignedCents: value }]),
      () => `${r.name}: ${eur(r.assignedCents)} → ${eur(value)} zugewiesen`,
    );
  const take = (ids: string[]) => {
    const list = ids.filter((id) => sug[id]);
    const sum = list.reduce((a, id) => a + (sug[id] ?? 0), 0);
    if (!list.length) return;
    void write(
      () =>
        assign(
          month,
          list.map((id) => ({
            categoryId: id,
            assignedCents: byId.get(id)!.assignedCents + sug[id]!,
          })),
        ),
      () => `${eur(sum)} verteilt`,
    ).then((done) => done && sum >= tba && setDistribute(false));
  };
  const coverFrom = useCover(month, (id) => byId.get(id)?.name);
  const cover = (r: PlanRow) => {
    const from = sources[r.id] ?? coverSource(rows, r)?.id ?? '';
    if (from === '' && coverFromToBeAssigned(r.overspentCents, tba).short) return setChoosing(r.id);
    void coverFrom(r, from === '' ? null : from);
  };
  const unassign = () => {
    const plan = unassignPlan(rows, -tba);
    void write(
      () =>
        assign(
          month,
          plan.map(([id, v]) => ({
            categoryId: id,
            assignedCents: byId.get(id)!.assignedCents - v,
          })),
        ),
      () => `${eur(-tba)} zurückgenommen`,
    );
  };
  const jump = (key: string) => {
    setCollapsed((c) => new Set([...c].filter((k) => k !== key)));
    const row = document.getElementById(`grp-${key}`);
    if (!row) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    row.classList.add('is-flash');
    window.setTimeout(() => row.classList.remove('is-flash'), 900);
  };

  return (
    <div className="plan-grid">
      <div className="plan-main">
        <Hero
          data={data}
          urgent={urgent.length}
          distribute={distribute}
          onIncome={onIncome}
          onDistribute={() => {
            setDistribute(true);
            setView('stage');
          }}
        />
        {(urgent.length > 0 || credit.length > 0 || tba < 0) && (
          <section
            className={cx('triage', urgent.length === 0 && tba >= 0 && 'is-calm')}
            aria-labelledby="triage-title"
          >
            <div className="head">
              <h2 id="triage-title">Erst decken</h2>
              <span className="aside">
                {tba > 0 && urgent.length
                  ? 'Erst decken, dann verteilen.'
                  : `${urgent.length + credit.length + (tba < 0 ? 1 : 0)} offen`}
              </span>
            </div>
            <table className="rev-table triage-table">
              <caption className="sr-only">Überzogene Envelopes</caption>
              <thead>
                <tr>
                  <th className="tech" scope="col">
                    Rev.
                  </th>
                  <th className="tech" scope="col">
                    Änderung
                  </th>
                  <th className="tech" scope="col">
                    Aus Envelope
                  </th>
                  <th className="tech rev-act" scope="col">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...urgent, ...credit].map((r, i) => {
                  const cash = isCashOver(r);
                  const pick = sources[r.id] ?? coverSource(rows, r)?.id ?? '';
                  return [
                    <tr key={r.id} className={cx('rev-row', cash && 'is-urgent')}>
                      <td className="rev-mark">
                        <RevisionTriangle letter={String.fromCharCode(65 + i)} urgent={cash} />
                      </td>
                      <td className="rev-what">
                        <strong>
                          {cash ? `${r.name} ist überzogen` : `${r.name}: neue Kartenschuld`}
                        </strong>
                        <span>
                          {eur(-r.overspentCents)}
                          {r.stage ? ` · Stufe ${r.stage} ${STAGES[r.stage - 1]?.short}` : ''}
                          {!cash && ' · nicht gedeckt, bleibt auf der Karte'}
                        </span>
                      </td>
                      <td className="rev-src">
                        <label className="sr-only" htmlFor={`src-${r.id}`}>
                          Aus Envelope für {r.name}
                        </label>
                        <Select
                          id={`src-${r.id}`}
                          className="select-sm"
                          value={pick}
                          onChange={(e) => {
                            setSources({ ...sources, [r.id]: e.target.value });
                            setChoosing(null);
                          }}
                        >
                          <option value="">Zu verteilen · {eur(tba)}</option>
                          {rows
                            .filter((o) => o.id !== r.id && !isCard(o) && o.availableCents > 0)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} · {eur(o.availableCents)}
                              </option>
                            ))}
                        </Select>
                      </td>
                      <td className="rev-act">
                        <Button
                          size="sm"
                          variant={cash ? 'alert' : 'ghost'}
                          onClick={() => cover(r)}
                        >
                          Decken
                        </Button>
                      </td>
                    </tr>,
                    choosing === r.id && pick === '' && (
                      <tr key={`${r.id}-choice`} className="rev-row rev-choice">
                        <td className="rev-mark" />
                        <td colSpan={3}>
                          <CoverChoice
                            overspentCents={r.overspentCents}
                            toBeAssignedCents={tba}
                            onCover={(allowNegative) => {
                              setChoosing(null);
                              void coverFrom(r, null, allowNegative);
                            }}
                            onCancel={() => setChoosing(null)}
                          />
                        </td>
                      </tr>
                    ),
                  ];
                })}
                {tba < 0 && (
                  <tr className="rev-row is-urgent">
                    <td className="rev-mark">
                      <RevisionTriangle
                        letter={String.fromCharCode(65 + urgent.length + credit.length)}
                        urgent
                      />
                    </td>
                    <td className="rev-what">
                      <strong>Zu viel zugewiesen</strong>
                      <span>
                        {eur(tba)} · von unten nach oben zurücknehmen, ab der tiefsten Stufe
                      </span>
                    </td>
                    <td className="rev-src" />
                    <td className="rev-act">
                      <Button size="sm" variant="alert" onClick={unassign}>
                        Zurücknehmen
                      </Button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}
        <section className="ptable-wrap card" aria-labelledby="table-title">
          <h2 className="sr-only" id="table-title">
            Envelopes im Monat
          </h2>
          <div className="ptoolbar">
            <div className="seg" role="group" aria-label="Gliederung">
              {[...VIEWS, { value: 'triage' as const, label: 'Triage' }].map((v) => (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={view === v.value}
                  onClick={() => setView(v.value)}
                >
                  {v.label}
                  {v.value === 'triage' && urgent.length > 0 && (
                    <Count tone="alert">{urgent.length}</Count>
                  )}
                </button>
              ))}
            </div>
            <span className="spacer" />
            <div className="dist-actions">
              {distribute && (
                <>
                  <span className="dist-left">noch {eur(tba)}</span>
                  {Object.keys(sug).length > 0 && (
                    <Button size="sm" onClick={() => take(Object.keys(sug))}>
                      Alle Ziele füllen · {eur(Object.values(sug).reduce((a, v) => a + v, 0))}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDistribute(false)}>
                    Fertig
                  </Button>
                </>
              )}
            </div>
          </div>
          <table className={cx('ptable', distribute && 'is-distributing')}>
            <caption className="sr-only">Envelopes mit Zugewiesen, Aktivität und Verfügbar</caption>
            <thead>
              <tr>
                <th className="tech col-pos" scope="col">
                  Pos.
                </th>
                <th className="tech col-name" scope="col">
                  Kategorie
                </th>
                <th className="tech col-num" scope="col">
                  Zugewiesen
                </th>
                <th className="tech col-num" scope="col">
                  Aktivität
                </th>
                <th className="tech col-num" scope="col">
                  Verfügbar
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const st = groupStatus(g.rows);
                const isCollapsed = collapsed.has(g.key);
                const sugSum = g.rows.reduce((a, r) => a + (sug[r.id] ?? 0), 0);
                const toggle = () =>
                  setCollapsed((c) => {
                    const next = new Set(c);
                    if (next.has(g.key)) next.delete(g.key);
                    else next.add(g.key);
                    return next;
                  });
                return [
                  <tr
                    key={g.key}
                    className={cx('pgroup', isCollapsed && 'is-collapsed')}
                    id={`grp-${g.key}`}
                  >
                    <td className="col-pos">
                      <span className="grp-no">{g.no}</span>
                    </td>
                    <td className="col-name">
                      <button
                        type="button"
                        className="grp-toggle"
                        aria-expanded={!isCollapsed}
                        onClick={toggle}
                      >
                        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                        <span className="grp-text">
                          <span className="grp-title">{g.title}</span>
                          {g.sub && <span className="grp-sub">{g.sub}</span>}
                        </span>
                      </button>
                      {g.rows.length > 0 && <GroupState group={g} status={st} />}
                      {distribute && sugSum > 0 && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => take(g.rows.map((r) => r.id))}
                        >
                          {g.stage ? 'Stufe füllen' : 'Übernehmen'} · {eur(sugSum)}
                        </Button>
                      )}
                    </td>
                    {g.rows.length === 0 ? (
                      // Nothing in the group: no sums to show, the empty state says it.
                      <td className="col-num group-none" colSpan={3} />
                    ) : (
                      <>
                        <td className="col-num col-assign" data-label="Zugewiesen">
                          {eur(st.assigned)}
                        </td>
                        <td className="col-num col-act" data-label="Aktivität">
                          {eur(st.activity)}
                        </td>
                        <td className="col-num col-avail" data-label="Verfügbar">
                          {eur(st.available)}
                        </td>
                      </>
                    )}
                  </tr>,
                  ...(g.rows.length === 0 && !isCollapsed && (g.emptyNote ?? g.emptyText)
                    ? [
                        <tr key={`${g.key}-empty`} className="prow is-empty">
                          <td className="col-pos" />
                          <td className="col-name" colSpan={4}>
                            <span className="pempty">
                              <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
                              {g.emptyNote ?? g.emptyText}
                            </span>
                          </td>
                        </tr>,
                      ]
                    : []),
                  ...(isCollapsed
                    ? []
                    : g.rows.map((r, i) => (
                        <EnvelopeRow
                          key={r.id}
                          row={r}
                          pos={`${g.no}.${i + 1}`}
                          ctx={ctx}
                          suggestion={distribute ? sug[r.id] : undefined}
                          tba={tba}
                          editing={editing === r.id}
                          onEdit={(on) => setEditing(on ? r.id : null)}
                          onCommit={(v) => {
                            setEditing(null);
                            setAssigned(r, v);
                          }}
                          onTake={() => take([r.id])}
                          onOpen={() => setOpen(r.id)}
                        />
                      ))),
                ];
              })}
            </tbody>
          </table>
          <div className="plegend" aria-hidden="true">
            <span>
              <i className="lg-bar">
                <i className="lg-fill" />
              </i>
              ausgegeben
            </span>
            <span>
              <i className="lg-bar">
                <i className="lg-tick" />
              </i>
              Pace: Soll bis heute
            </span>
            <span>
              <i className="lg-ghost">+0,00</i>Vorschlag beim Verteilen
            </span>
            <span>
              <i className="lg-debt">0,00</i>neue Kartenschuld
            </span>
          </div>
        </section>
      </div>
      <aside className="inspector" aria-label="Monatsüberblick">
        <MonthOverview data={data} rows={rows} />
        <SplitBand data={data} rows={rows} />
        <section className="insp-card card insp-rail" aria-labelledby="rail-title">
          <h2 className="insp-title" id="rail-title">
            {view === 'stage' ? 'Wasserfall' : RAIL_LABEL[view]}
          </h2>
          <Rail view={view} groups={groups} data={data} onJump={jump} />
        </section>
      </aside>
      <EnvelopePanel
        month={month}
        row={open ? byId.get(open) : undefined}
        rows={rows}
        toBeAssignedCents={tba}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function GroupState({
  group,
  status,
}: {
  group: PlanGroup;
  status: ReturnType<typeof groupStatus>;
}) {
  const text = statusText(group, status);
  if (group.key === 'cards') return null;
  return (
    <span className="grp-status">
      {status.cashOver > 0 ? (
        <span className="neg-alert">{text}</span>
      ) : (
        <>
          {status.need === 0 && group.rows.length > 0 && (
            <Check size={13} strokeWidth={2} aria-hidden="true" />
          )}
          {text}
        </>
      )}
    </span>
  );
}

/**
 * The month's one number: "Zu verteilen" on forest green while money waits for a job, a compact
 * soft-red card with the figure right-aligned when too much was assigned, a calm card at zero. The Maßkette below the figure explains it; the
 * button starts the distribution.
 */
function Hero({
  data,
  urgent,
  distribute,
  onIncome,
  onDistribute,
}: {
  data: BudgetMonthView;
  urgent: number;
  distribute: boolean;
  onIncome: () => void;
  onDistribute: () => void;
}) {
  const s = data.summary;
  const tba = s.toBeAssignedCents;
  const { whole, fraction } = eurParts(tba);
  const terms: DimensionChainTerm[] = [
    { label: 'Übertrag', value: cents(s.carryInCents) },
    { label: 'Einnahmen', value: cents(s.incomeCents), op: '+', onSelect: onIncome },
    ...(s.uncoveredCents !== 0
      ? [{ label: 'Ungedeckt', value: cents(s.uncoveredCents), op: '-' as const }]
      : []),
    { label: 'Zugewiesen', value: cents(s.assignedCents), op: '-' },
    ...(s.heldCents !== 0
      ? [{ label: 'Gehalten', value: cents(s.heldCents), op: '-' as const }]
      : []),
    { label: 'Zu verteilen', value: cents(tba), op: '=' },
  ];
  const tone = tba > 0 ? 'is-positive' : tba < 0 ? 'is-negative' : 'is-zero';
  return (
    <section className={cx('hero-kpi tbd', tone)} aria-labelledby="tbd-title">
      <div className="hero-top">
        <div className="hero-figure">
          <h2 id="tbd-title" className="hero-label">
            Zu verteilen
          </h2>
          <div className="tbd-fig hero-fig" aria-live="polite" data-testid="to-be-assigned">
            {whole}
            <span className="cents">,{fraction} €</span>
          </div>
          {tba < 0 ? (
            // The red card says it; one label for screen readers, no second warning.
            <span className="sr-only">zu viel zugewiesen</span>
          ) : (
            <span className="hero-state">
              {tba > 0 ? (
                <>
                  <ArrowDownToLine size={16} strokeWidth={1.75} aria-hidden="true" />
                  {urgent > 0 ? 'erst decken, dann verteilen' : 'bereit zum Verteilen'}
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  jeder Euro hat einen Job
                </>
              )}
            </span>
          )}
        </div>
        {tba > 0 && !distribute && (
          <button type="button" className="btn-on-hero" onClick={onDistribute}>
            <ArrowDownToLine size={16} strokeWidth={1.75} aria-hidden="true" />
            Geld verteilen
          </button>
        )}
      </div>
      <DimensionChain terms={terms} precision="cent" label="Maßkette Zu verteilen" />
    </section>
  );
}

/** Inspector: the month in figures, the overspending state and what is left in the envelopes. */
function MonthOverview({ data, rows }: { data: BudgetMonthView; rows: PlanRow[] }) {
  const s = data.summary;
  const activity = rows.reduce((a, r) => a + r.activityCents, 0);
  const available = rows.reduce((a, r) => a + r.availableCents, 0);
  const status = monthStatus(s, rows);
  return (
    <section className="insp-card card" aria-labelledby="overview-title">
      <h2 className="insp-title" id="overview-title">
        Monatsüberblick
      </h2>
      <ul className="insp-status" aria-label="Zustand des Monats">
        {status.map((l) => (
          <li key={l.text} className={`is-${l.tone}`}>
            {l.tone === 'good' ? (
              <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <AlertTriangle size={15} strokeWidth={1.75} aria-hidden="true" />
            )}
            {l.text}
          </li>
        ))}
      </ul>
      <dl className="insp-list">
        <div>
          <dt>Übertrag</dt>
          <dd>{eur(s.carryInCents)}</dd>
        </div>
        <div>
          <dt>Einnahmen</dt>
          <dd>{eur(s.incomeCents)}</dd>
        </div>
        <div>
          <dt>Zugewiesen</dt>
          <dd>{eur(s.assignedCents)}</dd>
        </div>
        <div>
          <dt>Aktivität</dt>
          <dd>{eur(activity)}</dd>
        </div>
        <div className="insp-total">
          <dt>Verfügbar in Envelopes</dt>
          <dd>
            <span className={cx('pill', available > 0 ? 'is-good' : available < 0 && 'is-bad')}>
              {eur(available)}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Inspector: the 50/30/20 band of what was assigned, against the month's income. */
function SplitBand({ data, rows }: { data: BudgetMonthView; rows: PlanRow[] }) {
  const state = splitState(data.summary, rows);
  const shares = state.kind === 'shares' ? state : null;
  const inSoll = shares !== null && shares.need <= 50 && shares.want <= 30 && shares.future >= 20;
  const reason =
    state.kind === 'no-income'
      ? 'Ohne Einnahmen im Monat gibt es keine Anteile.'
      : state.kind === 'empty'
        ? 'Noch nichts zugewiesen.'
        : state.kind === 'too-much'
          ? 'Es ist mehr zugewiesen als eingenommen: die Anteile sagen dann nichts.'
          : '';
  return (
    <section className="insp-card card split-band" aria-labelledby="split-title">
      <div className="insp-head">
        <h2 className="insp-title" id="split-title">
          50/30/20
        </h2>
        <span className="tbd-state">
          {shares === null ? (
            <span className="muted">–</span>
          ) : inSoll ? (
            <span className="ok">
              <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden="true" />
              im Soll
            </span>
          ) : (
            <span className="ink">
              <AlertTriangle size={15} strokeWidth={1.75} aria-hidden="true" />
              {shares.need > 50
                ? 'Bedarf über 50 %'
                : shares.want > 30
                  ? 'Wunsch über 30 %'
                  : 'Zukunft unter 20 %'}
            </span>
          )}
        </span>
      </div>
      <div className="sb-scale" aria-hidden="true">
        <span style={{ left: '50%' }}>50</span>
        <span style={{ left: '80%' }}>80</span>
        <span style={{ left: '100%' }}>100 %</span>
      </div>
      <div
        className="sb-bar"
        role="img"
        aria-label={
          shares
            ? `Zugewiesen: Bedarf ${shares.need} %, Wunsch ${shares.want} %, Zukunft ${shares.future} % der Einnahmen. Soll 50, 30, 20.`
            : `Keine Anteile. ${reason}`
        }
      >
        {shares && (
          <>
            <span className="sb-seg hatch-need" style={{ width: `${shares.need}%` }} />
            <span className="sb-seg hatch-want" style={{ width: `${shares.want}%` }} />
            <span className="sb-seg hatch-future" style={{ width: `${shares.future}%` }} />
          </>
        )}
        <i className="sb-mark" style={{ left: '50%' }} />
        <i className="sb-mark" style={{ left: '80%' }} />
      </div>
      <div className="sb-legend">
        {(['need', 'want', 'future'] as const).map((k) => (
          <span key={k}>
            <ClassSwatch kind={k} />
            {CLASS_TEXT[k]} <b>{shares ? `${shares[k]} %` : '–'}</b>
          </span>
        ))}
      </div>
      {reason && (
        <p className="sb-note">
          <Info size={13} strokeWidth={1.75} aria-hidden="true" />
          {reason}
        </p>
      )}
    </section>
  );
}

function Rail({
  view,
  groups,
  data,
  onJump,
}: {
  view: PlanView;
  groups: PlanGroup[];
  data: BudgetMonthView;
  onJump: (key: string) => void;
}) {
  const s = data.summary;
  const next =
    view === 'stage' ? groups.find((g) => g.stage && groupStatus(g.rows).need > 0) : undefined;
  return (
    <nav className="rail" aria-label={RAIL_LABEL[view]}>
      <ol className={cx('rail-list', view === 'stage' && 'is-flow')}>
        <li className="rail-io">
          <span className="tech">Zufluss</span>
          <strong>{eur(s.incomeCents)}</strong>
        </li>
        {s.uncoveredCents > 0 && (
          <li className="rail-io rail-io-sub">
            <span className="tech">Ungedeckt Vormonat</span>
            <strong>{eur(-s.uncoveredCents)}</strong>
          </li>
        )}
        {groups.map((g) => {
          const st = groupStatus(g.rows);
          const text = statusText(g, st);
          const isNext = next?.key === g.key;
          return [
            isNext && (
              <li key={`${g.key}-level`} className="rail-level" aria-hidden="true">
                <svg viewBox="0 0 12 10">
                  <path d="M0.5 0.5h11L6 9.5Z" />
                </svg>
                <span>Wasserstand</span>
              </li>
            ),
            <li key={g.key} className={cx('rail-item', `is-${st.state}`, isNext && 'is-next')}>
              <button
                type="button"
                className="rail-btn"
                aria-label={`${g.title}: ${text}${isNext ? ', hier endet das Geld' : ''}`}
                onClick={() => onJump(g.key)}
              >
                <span className="rail-no">{g.no}</span>
                <span className="rail-name">
                  {g.title}
                  {g.sub && <small>{g.sub}</small>}
                </span>
                <span className="rail-fill" aria-hidden="true">
                  <i style={{ width: `${st.fill * 100}%` }} />
                </span>
                <span className="rail-status">
                  {st.state === 'over' ? (
                    <span className="neg-alert">{text}</span>
                  ) : st.state === 'full' ? (
                    <>
                      <Check size={13} strokeWidth={2} aria-hidden="true" />
                      gedeckt
                    </>
                  ) : (
                    text
                  )}
                </span>
              </button>
            </li>,
          ];
        })}
        <li className="rail-io">
          <span className="tech">Noch frei</span>
          <strong className={cx(s.toBeAssignedCents < 0 && 'neg-alert')}>
            {eur(s.toBeAssignedCents)}
          </strong>
        </li>
      </ol>
    </nav>
  );
}

function EnvelopeRow({
  row: r,
  pos,
  ctx,
  suggestion,
  tba,
  editing,
  onEdit,
  onCommit,
  onTake,
  onOpen,
}: {
  row: PlanRow;
  pos: string;
  ctx: PlanContext;
  suggestion: number | undefined;
  /** "Zu verteilen": the guard refuses raising the assignment beyond it. */
  tba: number;
  editing: boolean;
  onEdit: (on: boolean) => void;
  onCommit: (value: number) => void;
  onTake: () => void;
  onOpen: () => void;
}) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  /** Why the guard refused the typed amount, with the highest amount that is still allowed. */
  const [refused, setRefused] = useState<{ message: string; maxCents: number } | null>(null);
  // A leading + / − is relative only when typed first into an emptied or fully selected field.
  const [relative, setRelative] = useState(false);
  const replacing = useRef(false);
  // Enter or Escape ends the edit; the blur of the field going away must not commit (again).
  const settled = useRef(false);
  const cash = isCashOver(r);
  const credit = !cash && r.creditOverspentCents > 0;
  const bar = barFor(r, ctx);
  const commit = () => {
    if (settled.current) return;
    const v = readAssign(text, r.assignedCents, relative);
    if (v === null) return setInvalid(true);
    const guard = assignGuard(v, r.assignedCents, tba);
    if (!guard.ok) {
      setInvalid(true);
      return setRefused({ message: guard.message, maxCents: guard.maxCents });
    }
    settled.current = true;
    onCommit(v);
  };
  const noteSelection = (el: HTMLInputElement) => {
    replacing.current =
      el.value === '' || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    noteSelection(e.currentTarget);
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      settled.current = true;
      onEdit(false);
    }
  };
  return (
    <tr className={cx('prow', cash && 'is-over', credit && 'is-credit')}>
      <td className="col-pos">
        <span className="pos">{pos}</span>
        {cash && <RevisionTriangle letter="!" urgent />}
      </td>
      <td className="col-name">
        <button type="button" className="pname" onClick={onOpen}>
          {r.cls ? <ClassSwatch kind={r.cls} /> : <ClassSwatch kind="bound" />}
          <CategoryIcon icon={r.icon} />
          {r.name}
          {r.cls && <span className="env-class">{CLASS_TEXT[r.cls]}</span>}
        </button>
        {bar.fill !== null && (
          <span className={cx('pbar', bar.over && 'is-over')} aria-hidden="true">
            <i
              className={cx('pbar-fill', r.cls && `hatch-${r.cls}`)}
              style={{ width: `${(bar.over ? 1 : bar.fill) * 100}%` }}
            />
            {bar.pace !== null && (
              <i className="pbar-tick" style={{ left: `${bar.pace * 100}%` }} />
            )}
            {bar.goalMark && <i className="pbar-goal" style={{ left: '100%' }} />}
          </span>
        )}
        {r.due?.source === 'expected' && (
          <span className="pmeta pdue">
            <Clock size={13} strokeWidth={1.75} aria-hidden="true" />
            {`erwartet ${dayMonth(r.due.date)}${r.due.name && r.due.name !== r.name ? ` · ${r.due.name}` : ''}${
              r.due.amountCents ? ` · ${eur(r.due.amountCents)}` : ''
            }`}
          </span>
        )}
        {bar.meta && (
          <span className="pmeta">
            {bar.icon === 'check' && <Check size={13} strokeWidth={2} aria-hidden="true" />}
            {bar.icon === 'clock' && <Clock size={13} strokeWidth={1.75} aria-hidden="true" />}
            {bar.meta}
          </span>
        )}
      </td>
      <td className="col-num col-assign" data-label="Zugewiesen">
        {editing ? (
          <input
            className="assign-input"
            inputMode="decimal"
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the field replaces the button just clicked
            autoFocus
            value={text}
            aria-invalid={invalid}
            aria-describedby={refused ? `refused-${r.id}` : undefined}
            aria-label={`Zugewiesen für ${r.name}. Rechnen erlaubt, +50 addiert.`}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const next = e.target.value;
              const signed = /^\s*[+\-−]/.test(next);
              setRelative(signed && (replacing.current || relative));
              replacing.current = false;
              setText(next);
              setInvalid(false);
              setRefused(null);
            }}
            onKeyDown={keys}
            onSelect={(e) => noteSelection(e.currentTarget)}
            onBlur={commit}
          />
        ) : (
          <button
            type="button"
            className="assign-btn"
            aria-label={`Zugewiesen ${eur(r.assignedCents)} für ${r.name} ändern`}
            onClick={() => {
              setText(eur(r.assignedCents).replace(/\s?€$/, ''));
              setRelative(false);
              setRefused(null);
              settled.current = false;
              onEdit(true);
            }}
          >
            {eur(r.assignedCents)}
          </button>
        )}
        {editing && refused && (
          <span className="assign-note" id={`refused-${r.id}`} role="alert">
            {refused.message}
            {refused.maxCents > r.assignedCents && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setText(formatDecimal(cents(refused.maxCents)));
                  setRelative(false);
                  setInvalid(false);
                  setRefused(null);
                }}
              >
                {eur(refused.maxCents)} einsetzen
              </button>
            )}
          </span>
        )}
        {suggestion !== undefined && (
          <button
            type="button"
            className="ghost"
            aria-label={`Vorschlag ${eur(suggestion)} für ${r.name} übernehmen`}
            onClick={onTake}
          >
            +{eur(suggestion).replace(/\s?€$/, '')}
          </button>
        )}
      </td>
      <td className="col-num col-act" data-label="Aktivität">
        {r.activityCents ? eur(r.activityCents) : <span className="muted">{eur(0)}</span>}
      </td>
      <td className="col-num col-avail" data-label="Verfügbar">
        <span
          className={cx(
            'pill',
            cash ? 'is-bad' : credit ? 'is-debt' : r.availableCents > 0 && 'is-good',
          )}
          title={credit ? 'neue Kartenschuld' : undefined}
        >
          {eur(r.availableCents)}
        </span>
      </td>
    </tr>
  );
}
