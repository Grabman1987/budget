import { AllocationBar } from '../reports/allocation-bar';
import { IncomeTargetsCard } from './income-targets-card';
import {
  useAmountPrivacy,
  Button,
  ClassSwatch,
  Count,
  DimensionChain,
  RevisionTriangle,
  Select,
  cx,
  type DimensionChainTerm,
} from '@budget/ui';
import { cents, coverShortfall, todayInVienna } from '@budget/domain';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Info,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { expectedQuery } from '../expected/api';
import { PLAN_MONAT } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { eur, eurParts } from '../ledger/format';
import { accountsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel, shiftMonth } from '../nav/month';
import { useMonth } from '../shell/use-month';
import { AppLink } from '../shell/app-link';
import { lastDayOfMonth } from '@budget/domain';
import {
  MONTH_SPANS,
  setMonthSpan,
  useIsPhone,
  useMonthSpan,
  useStoredMonthSpan,
} from './month-span';
import { MultiTable } from './plan-multi';
import { AssignCell } from './assign-cell';
import { QuickAssignActions } from './quick-assign-actions';
import { assign, coverAll, budgetQuery, type BudgetMonthView } from './budget-api';
import { CategoryIcon } from './category-icon';
import { IncomeButton, IncomePanel } from '../expected/income-panel';
import { EnvelopePanel } from './envelope-panel';
import {
  barFor,
  CLASS_TEXT,
  expectedDues,
  freeCoverCents,
  coverSourceLabel,
  groupStatus,
  isCard,
  isCashOver,
  monthStatus,
  planGroups,
  planMulti,
  planRows,
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
  useAmountPrivacy();
  const [month] = useMonth();
  const span = useMonthSpan();
  const months = useMemo(
    () => Array.from({ length: span }, (_, i) => shiftMonth(month, i)),
    [month, span],
  );
  // The leftmost month drives hero, triage, inspector and title block; the others only fill columns.
  const results = useQueries({ queries: months.map((m) => budgetQuery(m)) });
  const budget = results[0]!;
  const data = budget.data;
  const views = results.every((r) => r.data) ? results.map((r) => r.data!) : null;
  const extraError = results.slice(1).find((r) => r.isError);
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
          <PlanBody
            key={month}
            month={month}
            months={months}
            data={data}
            views={views}
            extraError={extraError}
            onIncome={() => setIncomeOpen(true)}
          />
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
  months,
  data,
  views,
  extraError,
  onIncome,
}: {
  month: string;
  /** The visible months, leftmost first (`month` is the first). */
  months: string[];
  data: BudgetMonthView;
  /** All visible months once loaded. */
  views: BudgetMonthView[] | null;
  extraError: { error: Error; refetch: () => unknown } | undefined;
  onIncome: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const accounts = useQuery(accountsQuery()).data?.accounts ?? [];
  const expected = useQuery(expectedQuery()).data;
  const search = useSearch({ strict: false }) as { ansicht?: 'triage'; kategorie?: string };
  const [view, setView] = useState<PlanView>(search.ansicht ?? 'stage');
  const phone = useIsPhone();
  const storedSpan = useStoredMonthSpan();
  const [distribute, setDistribute] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<{ id: string; month: string } | null>(
    search.kategorie ? { id: search.kategorie, month } : null,
  );
  const [bulkSource, setBulkSource] = useState('suggested');
  const [covering, setCovering] = useState(false);
  const [coverResult, setCoverResult] = useState<string | null>(null);

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
  const panelView = views?.find((v) => v.summary.month === open?.month) ?? data;
  const allRows = planRows({
    ...data,
    categories: data.categories.map((c) => ({ ...c, hiddenAt: null })),
  });
  const panelRows =
    panelView === data
      ? allRows
      : planRows({
          ...panelView,
          categories: panelView.categories.map((c) => ({ ...c, hiddenAt: null })),
        });
  // Several months show the "Gruppen" layout; starting to distribute goes back to one month.
  const multi = months.length > 1 && !distribute;
  const shownView: PlanView = multi ? 'group' : view;
  const groups = planGroups(shownView, rows, data, ctx);
  const shownRows = groups.flatMap((g) => g.rows);
  const shownIds = new Set(shownRows.map((r) => r.id));
  const orderedRows = [...shownRows, ...rows.filter((r) => !shownIds.has(r.id))];
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  const coverPool = rows
    .filter((r) => !isCard(r) && freeCoverCents(r) > 0)
    .sort((a, b) => freeCoverCents(b) - freeCoverCents(a));
  const missing = coverShortfall(
    rows.reduce((sum, r) => sum + r.overspentCents, 0),
    coverPool.map(freeCoverCents),
    tba,
    data.budgetMoney?.coverCapCents,
  );
  const source =
    bulkSource === 'suggested' ||
    (bulkSource === '' && tba > 0) ||
    coverPool.some((r) => r.id === bulkSource)
      ? bulkSource
      : 'suggested';
  const coverLabel =
    source === 'suggested'
      ? 'verfügbaren Envelopes'
      : source === ''
        ? 'Zu verteilen'
        : byId.get(source)!.name;
  const coverMonth = async () => {
    setCovering(true);
    const result = await write(
      () => coverAll(month, source === 'suggested' ? undefined : source === '' ? null : source),
      (res) =>
        `${res.coveredCount} gedeckt, ${res.openCount} offen · ${eur(res.missingCents)} fehlen${res.openCount > 0 ? ' · auf freies Geld begrenzt' : ''}`,
    );
    if (result)
      setCoverResult(
        `${result.coveredCount} gedeckt, ${result.openCount} offen · ${eur(result.missingCents)} fehlen`,
      );
    setCovering(false);
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
  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
    <div className={cx('plan-grid', multi && 'is-wide')}>
      <div className="plan-main">
        {data.budgetMoney && (
          <details className="plan-budget-money">
            <summary
              title={data.budgetMoney.accounts
                .map(
                  (a) =>
                    `${a.name}: ${eur(a.balanceCents)}${a.usedCreditCents > 0 ? ` · Kredit genutzt ${eur(-a.usedCreditCents)}${a.creditLineCents !== null ? ` · Rahmen ${eur(a.creditLineCents)}` : ' · Rahmen nicht hinterlegt'}` : ''}`,
                )
                .join(' · ')}
            >
              Geld auf Budget-Konten · {eur(data.budgetMoney.totalCents)}
              {data.budgetMoney.usedCreditCents > 0 && (
                <> · davon Dispo/Kreditrahmen genutzt {eur(-data.budgetMoney.usedCreditCents)}</>
              )}
            </summary>
            <ul>
              {data.budgetMoney.accounts.map((a) => (
                <li key={a.id}>
                  {a.name} · {eur(a.balanceCents)}
                  {a.usedCreditCents > 0 && (
                    <>
                      {' '}
                      · Kredit genutzt {eur(-a.usedCreditCents)} ·{' '}
                      {a.creditLineCents !== null
                        ? `Rahmen ${eur(a.creditLineCents)}`
                        : 'Rahmen nicht hinterlegt'}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        <Hero
          data={data}
          month={months.length > 1 ? month : undefined}
          urgent={urgent.length}
          distribute={distribute}
          onIncome={onIncome}
          onDistribute={() => {
            setDistribute(true);
            setView('stage');
          }}
        />
        {s.unclassified && s.unclassified.count > 0 && (
          <section className="plan-unclassified" aria-label="Noch ohne Kategorie">
            <strong>Noch ohne Kategorie</strong>
            <span>
              {s.unclassified.count} Buchungen · Eingang{' '}
              {eur(s.unclassified.inflowCents, { sign: true })} · Ausgang{' '}
              {eur(-s.unclassified.outflowCents)} · Saldo{' '}
              {eur(s.unclassified.netCents, { sign: true })}
            </span>
            <p>
              Ohne Kategorie oder noch unbestätigt. Bereits in den Kontosalden und „Zu verteilen“
              berücksichtigt.
            </p>
            <AppLink
              to="/konten/buchungen"
              search={{ kategorie: 'none', von: `${month}-01`, bis: lastDayOfMonth(month) }}
            >
              Ohne Kategorie öffnen
            </AppLink>
            <AppLink
              to="/konten/buchungen"
              search={{ status: 'pending', von: `${month}-01`, bis: lastDayOfMonth(month) }}
            >
              Unbestätigte öffnen
            </AppLink>
          </section>
        )}
        {(urgent.length > 0 || credit.length > 0 || tba < 0) && (
          <section className="triage triage-compact" aria-labelledby="triage-title">
            <div className="head">
              <h2 id="triage-title">
                {urgent.length + credit.length} Envelopes überzogen ·{' '}
                {eur(rows.reduce((sum, r) => sum + r.overspentCents, 0))} zu decken
              </h2>
            </div>
            <p className="panel-sub">
              Decken verschiebt freies Geld zwischen Envelopes; die Summe auf deinen Konten bleibt
              gleich.
            </p>
            {missing > 0 && (
              <div className="cover-missing" role="note">
                <p>
                  Es fehlen {eur(missing)} – Geld kommt nur durch Einnahmen oder Umbuchungen auf ein
                  Budget-Konto (z. B. aus Tagesgeld oder Depot).
                </p>
                <AppLink to="/plan/monat" search={{ monat: shiftMonth(month, 1) }}>
                  In den nächsten Monat mitnehmen
                </AppLink>
                <p>
                  Offene Barüberziehungen mindern dort „Zu verteilen“; ungedeckte Kartenausgaben
                  bleiben Kartenschuld.
                </p>
              </div>
            )}
            {urgent.length + credit.length > 0 && (
              <div className="cover-all-controls">
                <label className="sr-only" htmlFor="cover-all-source">
                  Quelle für alle Überziehungen
                </label>
                <Select
                  id="cover-all-source"
                  value={source}
                  onChange={(e) => setBulkSource(e.target.value)}
                >
                  <option value="suggested">Vorschläge · größtes Guthaben zuerst</option>
                  {tba > 0 && <option value="">Zu verteilen · {eur(tba)}</option>}
                  {coverPool.map((r) => (
                    <option key={r.id} value={r.id}>
                      {coverSourceLabel(r)}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="alert"
                  disabled={covering || (!coverPool.length && tba <= 0)}
                  onClick={() => void coverMonth()}
                >
                  Alle aus {coverLabel} decken
                </Button>
              </div>
            )}
            {tba < 0 && (
              <div className="cover-all-controls">
                <strong>Zu viel zugewiesen · {eur(-tba)} fehlen</strong>
                <Button variant="ghost" onClick={unassign}>
                  Zurücknehmen
                </Button>
              </div>
            )}
          </section>
        )}
        {coverResult && (
          <p role="status" className="heute-note">
            Letzte Deckung: {coverResult}
          </p>
        )}
        <section className="ptable-wrap card" aria-labelledby="table-title">
          <h2 className="sr-only" id="table-title">
            Envelopes im Monat
          </h2>
          <div className="ptoolbar">
            {!multi && (
              <QuickAssignActions
                month={month}
                emptyIds={orderedRows
                  .filter((r) => r.assignedCents === 0 && (r.quickAssign?.ghostCents ?? 0) > 0)
                  .map((r) => r.id)}
                selectedIds={orderedRows.filter((r) => selected.has(r.id)).map((r) => r.id)}
              />
            )}
            {multi ? (
              <p
                className="pm-layout"
                title="Wasserfall, Zeit, Klassen und Triage zeigen einen Monat."
              >
                Gliederung: Gruppen
              </p>
            ) : (
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
            )}
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
            {!phone && (
              <div className="pm-span" role="group" aria-label="Anzahl Monate">
                <span className="pm-span-label" aria-hidden="true">
                  Monate
                </span>
                <div className="seg">
                  {MONTH_SPANS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={storedSpan === n}
                      aria-label={n === 1 ? '1 Monat' : `${n} Monate`}
                      onClick={() => setMonthSpan(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {multi ? (
            extraError ? (
              <ErrorNote
                what="Folgemonate"
                error={extraError.error}
                onRetry={() => void extraError.refetch()}
              />
            ) : views ? (
              <MultiTable
                months={months}
                views={views}
                groups={planMulti(views)}
                collapsed={collapsed}
                onToggle={toggleGroup}
                onOpen={(id, selectedMonth) => setOpen({ id, month: selectedMonth })}
              />
            ) : (
              <LoadingNote what="Folgemonate" />
            )
          ) : (
            <>
              <table className={cx('ptable', distribute && 'is-distributing')}>
                <caption className="sr-only">
                  Envelopes mit Zugewiesen, Aktivität und Verfügbar
                </caption>
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
                    const toggle = () => toggleGroup(g.key);
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
                              onOpen={() => setOpen({ id: r.id, month })}
                              selected={selected.has(r.id)}
                              onSelect={() => toggleSelected(r.id)}
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
            </>
          )}
        </section>
      </div>
      <aside className="inspector" aria-label="Monatsüberblick">
        <MonthOverview data={data} rows={rows} month={months.length > 1 ? month : undefined} />
        {data.incomeTargets && (
          <IncomeTargetsCard
            data={data.incomeTargets}
            rows={allRows}
            onOpen={(id) => setOpen({ id, month })}
          />
        )}
        <SplitBand data={data} rows={rows} />
        <section className="insp-card card insp-rail" aria-labelledby="rail-title">
          <h2 className="insp-title" id="rail-title">
            {shownView === 'stage' ? 'Wasserfall' : RAIL_LABEL[shownView]}
          </h2>
          <Rail view={shownView} groups={groups} data={data} onJump={jump} />
        </section>
      </aside>
      <EnvelopePanel
        month={open?.month ?? month}
        row={open ? panelRows.find((r) => r.id === open.id) : undefined}
        rows={panelRows}
        toBeAssignedCents={panelView.summary.toBeAssignedCents}
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
  useAmountPrivacy();
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
  month,
  urgent,
  distribute,
  onIncome,
  onDistribute,
}: {
  data: BudgetMonthView;
  /** Several months are shown: the hero names the leftmost one. */
  month: string | undefined;
  urgent: number;
  distribute: boolean;
  onIncome: () => void;
  onDistribute: () => void;
}) {
  useAmountPrivacy();
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
            {month && <span className="hero-month"> · {monthLabel(month)}</span>}
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
function MonthOverview({
  data,
  rows,
  month,
}: {
  data: BudgetMonthView;
  rows: PlanRow[];
  /** Several months are shown: the overview names the leftmost one. */
  month: string | undefined;
}) {
  useAmountPrivacy();
  const s = data.summary;
  const activity = rows.reduce((a, r) => a + r.activityCents, 0);
  const available = rows.reduce((a, r) => a + r.availableCents, 0);
  const status = monthStatus(s, rows);
  return (
    <section className="insp-card card" aria-labelledby="overview-title">
      <h2 className="insp-title" id="overview-title">
        Monatsüberblick
        {month && <span className="insp-month"> · {monthLabel(month)}</span>}
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
  useAmountPrivacy();
  const state = splitState(data.summary, rows);
  const shares = state.kind === 'shares' ? state : null;
  const inSoll = shares !== null && shares.need <= 50 && shares.want <= 30 && shares.future >= 20;
  const reason =
    state.kind === 'no-income'
      ? 'Ohne Einnahmen im Monat gibt es keine Anteile.'
      : state.kind === 'empty'
        ? 'Noch nichts zugewiesen.'
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
      {shares ? (
        <AllocationBar
          data={{
            incomeCents: 10000,
            needCents: shares.need * 100,
            wantCents: shares.want * 100,
            futureCents: shares.future * 100,
            restCents: (100 - shares.need - shares.want - shares.future) * 100,
          }}
          label={`Zugewiesen: Bedarf ${shares.need} %, Wunsch ${shares.want} %, Zukunft ${shares.future} % der Einnahmen. Soll 50, 30, 20.`}
        />
      ) : (
        <p>{reason}</p>
      )}
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
  useAmountPrivacy();
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
  selected,
  onSelect,
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
  selected: boolean;
  onSelect: () => void;
}) {
  useAmountPrivacy();
  const cash = isCashOver(r);
  const credit = !cash && r.creditOverspentCents > 0;
  const over = r.overspentCents > 0;
  const bar = barFor(r, ctx);
  return (
    <tr className={cx('prow', over && 'is-over', credit && 'is-credit')}>
      <td className="col-pos">
        {r.quickAssign && (
          <label className="plan-select">
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelect}
              aria-label={`${r.name} auswählen`}
            />
          </label>
        )}
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
        <AssignCell
          row={r}
          tba={tba}
          editing={editing}
          monthKey={ctx.month}
          onEdit={onEdit}
          onCommit={onCommit}
        />
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
          className={cx('pill', over ? 'is-bad' : r.availableCents > 0 && 'is-good')}
          title={credit ? 'neue Kartenschuld' : undefined}
        >
          {eur(r.availableCents)}
        </span>
        {over && (
          <button
            type="button"
            className="cover-row"
            aria-label={`${r.name} decken`}
            onClick={onOpen}
          >
            <ArrowRightLeft size={16} aria-hidden="true" />
          </button>
        )}
      </td>
    </tr>
  );
}
