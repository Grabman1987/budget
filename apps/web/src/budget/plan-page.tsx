import { cents, percentShares, todayInVienna } from '@budget/domain';
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
} from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
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
  barFor,
  CLASS_TEXT,
  coverFromToBeAssigned,
  coverSource,
  groupStatus,
  isCard,
  isCashOver,
  planGroups,
  planRows,
  readAssign,
  statusText,
  suggestions,
  unassignPlan,
  type PlanContext,
  type PlanGroup,
  type PlanRow,
  type PlanView,
} from './plan-model';
import { useBudgetWrite } from './use-category-writes';

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
    <>
      <Head data={data} rows={rows} onIncome={onIncome} />
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
                      <Button size="sm" variant={cash ? 'alert' : 'ghost'} onClick={() => cover(r)}>
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
      <div className="plan-body">
        <Rail view={view} groups={groups} data={data} onJump={jump} />
        <section className="ptable-wrap" aria-labelledby="table-title">
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
              {distribute ? (
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
              ) : (
                <Button
                  size="sm"
                  variant={tba > 0 && urgent.length === 0 ? 'primary' : 'ghost'}
                  disabled={tba <= 0}
                  title={tba <= 0 ? 'Nichts zu verteilen' : undefined}
                  onClick={() => {
                    setDistribute(true);
                    setView('stage');
                  }}
                >
                  <ArrowDownToLine size={16} strokeWidth={1.75} aria-hidden="true" />
                  Geld verteilen
                </Button>
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
                        <span className="grp-title">{g.title}</span>
                        {g.sub && <span className="grp-sub">{g.sub}</span>}
                      </button>
                      <GroupState group={g} status={st} />
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
                    <td className="col-num col-assign" data-label="Zugewiesen">
                      {eur(st.assigned)}
                    </td>
                    <td className="col-num col-act" data-label="Aktivität">
                      {eur(st.activity)}
                    </td>
                    <td className="col-num col-avail" data-label="Verfügbar">
                      {eur(st.available)}
                    </td>
                  </tr>,
                  ...(g.stage === 9 && g.rows.length === 0
                    ? [
                        <tr key={`${g.key}-empty`} className="prow is-empty">
                          <td className="col-pos" />
                          <td className="col-name" colSpan={4}>
                            <span className="pmeta">
                              Keine günstigen Schulden. Was übrig bleibt, geht in Stufe 8.
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
      <EnvelopePanel
        month={month}
        row={open ? byId.get(open) : undefined}
        rows={rows}
        toBeAssignedCents={tba}
        onClose={() => setOpen(null)}
      />
    </>
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

function Head({
  data,
  rows,
  onIncome,
}: {
  data: BudgetMonthView;
  rows: PlanRow[];
  onIncome: () => void;
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
  const byClass = { need: 0, want: 0, future: 0 };
  for (const r of rows) if (r.cls) byClass[r.cls] += r.assignedCents;
  const shares = percentShares({
    needCents: byClass.need,
    wantCents: byClass.want,
    futureCents: byClass.future,
    incomeCents: s.incomeCents,
  });
  const inSoll = shares.need <= 50 && shares.want <= 30 && shares.future >= 20;
  const width = (p: number) => `${Math.min(Math.max(p, 0), 100)}%`;
  return (
    <section className="tbd" aria-labelledby="tbd-title">
      <div className="tbd-main">
        <div className="tbd-head">
          <h2 id="tbd-title">Zu verteilen</h2>
          <span className="tbd-state">
            {tba < 0 ? (
              <span className="neg-alert">
                <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
                zu viel zugewiesen
              </span>
            ) : tba > 0 ? (
              <span className="ink">
                <ArrowDownToLine size={16} strokeWidth={1.75} aria-hidden="true" />
                bereit zum Verteilen
              </span>
            ) : (
              <span className="ok">
                <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
                jeder Euro hat einen Job
              </span>
            )}
          </span>
        </div>
        <div className="tbd-fig" aria-live="polite" data-testid="to-be-assigned">
          <span className={cx(tba < 0 && 'neg-alert')}>
            {whole}
            <span className="cents">,{fraction} €</span>
          </span>
        </div>
        <DimensionChain terms={terms} precision="cent" label="Maßkette Zu verteilen" />
      </div>
      <div className="split-band">
        <div className="tbd-head">
          <h2>50/30/20</h2>
          <span className="tbd-state">
            {s.assignedCents === 0 ? (
              <span className="muted">noch nichts zugewiesen</span>
            ) : inSoll ? (
              <span className="ok">
                <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
                im Soll
              </span>
            ) : (
              <span className="ink">
                <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
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
          aria-label={`Zugewiesen: Bedarf ${shares.need} %, Wunsch ${shares.want} %, Zukunft ${shares.future} % der Einnahmen. Soll 50, 30, 20.`}
        >
          <span className="sb-seg hatch-need" style={{ width: width(shares.need) }} />
          <span className="sb-seg hatch-want" style={{ width: width(shares.want) }} />
          <span className="sb-seg hatch-future" style={{ width: width(shares.future) }} />
          <i className="sb-mark" style={{ left: '50%' }} />
          <i className="sb-mark" style={{ left: '80%' }} />
        </div>
        <div className="sb-legend">
          {(['need', 'want', 'future'] as const).map((k) => (
            <span key={k}>
              <ClassSwatch kind={k} />
              {CLASS_TEXT[k]} <b>{shares[k]} %</b>
            </span>
          ))}
        </div>
      </div>
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
  editing: boolean;
  onEdit: (on: boolean) => void;
  onCommit: (value: number) => void;
  onTake: () => void;
  onOpen: () => void;
}) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
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
            aria-label={`Zugewiesen für ${r.name}. Rechnen erlaubt, +50 addiert.`}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const next = e.target.value;
              const signed = /^\s*[+\-−]/.test(next);
              setRelative(signed && (replacing.current || relative));
              replacing.current = false;
              setText(next);
              setInvalid(false);
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
              settled.current = false;
              onEdit(true);
            }}
          >
            {eur(r.assignedCents)}
          </button>
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
      <td className={cx('col-num col-avail', cash && 'neg-alert')} data-label="Verfügbar">
        {credit ? (
          <span className="debt-val" title="neue Kartenschuld">
            {eur(r.availableCents)}
          </span>
        ) : (
          eur(r.availableCents)
        )}
      </td>
    </tr>
  );
}
