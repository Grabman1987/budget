import { AllocationBar } from '../reports/allocation-bar';
import { IncomeTargetsCard } from './income-targets-card';
import {
  useAmountPrivacy,
  Button,
  ClassSwatch,
  DimensionChain,
  Select,
  TextInput,
  cx,
  type DimensionChainTerm,
} from '@budget/ui';
import { cents, coverShortfall, overspentEnvelopes, todayInVienna } from '@budget/domain';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Info,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { expectedQuery } from '../expected/api';
import { PLAN_MONAT } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { eur } from '../ledger/format';
import { accountsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel, shiftMonth } from '../nav/month';
import { useMonth } from '../shell/use-month';
import { AppLink } from '../shell/app-link';
import { lastDayOfMonth } from '@budget/domain';
import { setMonthSpan, useIsPhone, useMonthSpan } from './month-span';
import { MultiTable } from './plan-multi';
import { ActivityLink } from './activity-link';
import { PlanUncategorizedRows } from './plan-uncategorized';
import {
  categoryNameMatches,
  filterPlanRows,
  type PlanFilter,
  type PlanFilterSearch,
} from './plan-filters';
import { AssignCell, assignGhost, ghostSource } from './assign-cell';
import { OptionenMenu, VerteilenMenu } from './plan-menus';
import {
  assign,
  coverAll,
  budgetMonthsQuery,
  budgetQuery,
  budgetUncategorizedQuery,
  type BudgetMonthView,
} from './budget-api';
import { CategoryIcon } from './category-icon';
import { IncomeButton } from '../expected/income-panel';
import { PlanInspector } from './plan-inspector';
import { QuickAssignActions } from './quick-assign-actions';
import { patchCategory } from './api';
import {
  availableInEnvelopes,
  barFor,
  spendingBar,
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
import { categoriesQuery, useBudgetWrite } from './use-category-writes';
import { CategoryPanel, type PanelState } from './category-panel';

/** `05.10.` of `2026-10-05`. */
const dayMonth = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;

const RAIL_LABEL = {
  stage: 'Wasserfall-Stufen',
  time: 'Fälligkeiten',
  group: 'Gruppen',
  class: 'Klassen',
  triage: 'Triage',
};

declare module '@tanstack/history' {
  interface HistoryState {
    planActivityReturn?: {
      month: string;
      view: PlanView;
      selectedIds: string[];
      collapsedKeys: string[];
      inspector: { id: string; month: string } | null;
      phoneSelection: boolean;
    };
  }
}

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
  // One month is the single-month call; several months are ONE batch call (the server derives the
  // facts and the history once, not once per month column).
  const first = useQuery({ ...budgetQuery(months[0]!), enabled: months.length === 1 });
  const batch = useQuery({ ...budgetMonthsQuery(months), enabled: months.length > 1 });
  const budget = months.length === 1 ? first : batch;
  const data = months.length === 1 ? first.data : batch.data?.months[months[0]!];
  const columns = months.map((m) => (months.length === 1 ? first.data : batch.data?.months[m]));
  const views = columns.every((v) => v) ? columns.map((v) => v!) : null;
  // The month's income (title block and chain term) opens received against expected.
  const navigate = useNavigate();
  const openIncome = () =>
    void navigate({
      to: '/plan/monat/einnahmen',
      search: { monat: month },
      state: { planDetailOpenedInApp: true },
    });
  const income = data ? (
    <IncomeButton value={eur(data.summary.incomeCents)} onOpen={openIncome} />
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
            onIncome={openIncome}
          />
        )}
      </div>
    </PageFrame>
  );
}

function PlanBody({
  month,
  months,
  data,
  views,
  onIncome,
}: {
  month: string;
  /** The visible months, leftmost first (`month` is the first). */
  months: string[];
  data: BudgetMonthView;
  /** All visible months once loaded. */
  views: BudgetMonthView[] | null;
  onIncome: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [categoryForm, setCategoryForm] = useState<PanelState>(null);
  const accounts = useQuery(accountsQuery()).data?.accounts ?? [];
  const expected = useQuery(expectedQuery()).data;
  const search = useSearch({ strict: false }) as PlanFilterSearch & {
    ansicht?: 'triage';
    kategorie?: string;
  };
  const navigate = useNavigate();
  const filter = search.filter ?? (search.ansicht === 'triage' ? 'overspent' : 'all');
  const nameQuery = search.q ?? '';
  const filterTuple = JSON.stringify([filter, nameQuery]);
  const [capturedFilter, setCapturedFilter] = useState(filterTuple);
  const uncategorized = useInfiniteQuery({
    ...budgetUncategorizedQuery(month),
    enabled: filter === 'uncategorized',
  });
  const changeFilter = (next: PlanFilter, query = nameQuery) => {
    clearSelection();
    setCollapsed(new Set());
    void navigate({
      to: '/plan/monat',
      resetScroll: false,
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        ansicht: undefined,
        filter: next === 'all' ? undefined : next,
        q: query || undefined,
      }),
    });
  };
  const savedPlan = useLocation({ select: (location) => location.state.planActivityReturn });
  const restoredPlan = savedPlan?.month === month ? savedPlan : null;
  const liveIds = new Set(data.categories.map((category) => category.id));
  const [view, setView] = useState<PlanView>(
    restoredPlan?.view === 'triage' ? 'group' : (restoredPlan?.view ?? 'group'),
  );
  const phone = useIsPhone();
  const [distribute, setDistribute] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    const keys = new Set(
      planGroups(months.length > 1 ? 'group' : view, planRows(data), data, {
        month,
        today: todayInVienna(),
        cardName: () => 'Kreditkarte',
        ...(expected && { expected: expectedDues(expected) }),
      }).map((group) => group.key),
    );
    return new Set(restoredPlan?.collapsedKeys.filter((key) => keys.has(key)) ?? []);
  });
  const groupFocusAfterToggle = useRef<string | null>(null);
  useLayoutEffect(() => {
    const key = groupFocusAfterToggle.current;
    groupFocusAfterToggle.current = null;
    if (key !== null) {
      document
        .getElementById(`grp-${key}`)
        ?.querySelector<HTMLButtonElement>('.grp-toggle')
        ?.focus();
    }
  }, [collapsed]);
  const [editing, setEditing] = useState<string | null>(null);
  const savedInspector = useLocation({ select: (location) => location.state.planInspector });
  const candidateInspector = restoredPlan ? restoredPlan.inspector : savedInspector;
  const restored =
    candidateInspector &&
    months.includes(candidateInspector.month) &&
    liveIds.has(candidateInspector.id)
      ? candidateInspector
      : null;
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    new Set(
      restoredPlan
        ? restoredPlan.selectedIds.filter((id) => liveIds.has(id))
        : restored
          ? [restored.id]
          : [],
    ),
  );
  const [open, setOpen] = useState<{ id: string; month: string } | null>(restored);
  const [phoneSelection, setPhoneSelection] = useState(
    phone && Boolean(restoredPlan?.phoneSelection),
  );
  // Back/Forward changes URL state without going through changeFilter. Drop only this
  // component's stale selection before committing the new filtered list.
  if (capturedFilter !== filterTuple) {
    setCapturedFilter(filterTuple);
    setSelected(new Set());
    setOpen(null);
    setPhoneSelection(false);
    setEditing(null);
    setCollapsed(new Set());
  }
  const historyFilter = useRef(filterTuple);
  useEffect(() => {
    if (historyFilter.current === filterTuple) return;
    historyFilter.current = filterTuple;
    if (!window.history.state?.planInspector && !window.history.state?.planActivityReturn) return;
    const state = { ...window.history.state };
    delete state.planInspector;
    delete state.planActivityReturn;
    window.history.replaceState(state, '');
  }, [filterTuple]);
  const selectionReturn = useRef<string | null>(null);
  const selectionBar = useRef<HTMLElement>(null);
  const [selectionHeight, setSelectionHeight] = useState(0);
  const [selectionTopbarHeight, setSelectionTopbarHeight] = useState(44);
  useLayoutEffect(() => {
    const bar = selectionBar.current;
    if (!phoneSelection || !bar) return;
    const topbar = bar.closest('.plan-grid')?.querySelector<HTMLElement>('.plan-topbar');
    const measure = () => {
      setSelectionHeight(bar.getBoundingClientRect().height);
      setSelectionTopbarHeight(topbar?.getBoundingClientRect().height ?? 44);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    if (topbar) observer.observe(topbar);
    return () => observer.disconnect();
  }, [phoneSelection]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const resetPhoneSelection = () => {
      if (phoneSelection && !window.matchMedia(query.media).matches) {
        setPhoneSelection(false);
        setSelected(new Set());
        setOpen(null);
      }
    };
    query.addEventListener('change', resetPhoneSelection);
    return () => query.removeEventListener('change', resetPhoneSelection);
  }, [phoneSelection]);
  const inspect = (id: string, selectedMonth = month) => {
    selectionReturn.current = id;
    setPhoneSelection(false);
    setSelected(new Set([id]));
    setOpen({ id, month: selectedMonth });
  };
  const clearSelection = (focus = false) => {
    if (window.history.state?.planInspector || window.history.state?.planActivityReturn) {
      const state = { ...window.history.state };
      delete state.planInspector;
      delete state.planActivityReturn;
      window.history.replaceState(state, '');
    }
    if (focus) {
      const id =
        open?.id ?? (phone && phoneSelection ? selectionReturn.current : null) ?? [...selected][0];
      const target =
        document.querySelector<HTMLButtonElement>(`.pname[data-category-id="${id}"]`) ??
        (phone ? document.querySelector<HTMLElement>('.plan-menu-optionen summary') : null);
      target?.focus();
    }
    setPhoneSelection(false);
    setSelected(new Set());
    setOpen(null);
  };
  const categoryTree = useQuery({
    ...categoriesQuery(),
    enabled: categoryForm !== null || selected.size > 0 || open !== null,
  });
  useEffect(() => {
    if (!selected.size && !open && !phoneSelection) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !categoryForm &&
        !editing &&
        !document.querySelector('dialog[open], .plan-popover[open]')
      ) {
        event.preventDefault();
        clearSelection(true);
      }
    };
    const outside = (event: MouseEvent) => {
      if (
        phone &&
        (phoneSelection ||
          (event.target instanceof Element && event.target.closest('.plan-menu-optionen')))
      )
        return;
      // A control that was removed while handling this very click (e.g. the inspector's own
      // overview list swapping to the selection) is not an outside click.
      if (
        event.target instanceof Element &&
        event.target.isConnected &&
        !event.target.closest(
          '.plan-inspector, .prow, .pgroup, .plan-select, dialog, .toast, .quick-assign-actions, .plan-menu-verteilen',
        )
      )
        clearSelection();
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('click', outside);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('click', outside);
    };
  });
  const [bulkSource, setBulkSource] = useState('suggested');
  const [covering, setCovering] = useState(false);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || categoryForm || open)
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable], [role="textbox"], dialog[open]')
      )
        return;
      const key = event.key.toLowerCase();
      if (key === 'g') {
        event.preventDefault();
        setCategoryForm({ mode: 'group' });
      } else if (key === 'c' && data.groups[0]) {
        event.preventDefault();
        setCategoryForm({ mode: 'edit', groupId: data.groups[0].id });
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [categoryForm, open, data.groups]);

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
  const unfilteredGroups = planGroups(shownView, rows, data, ctx);
  const multiGroups = views ? planMulti(views) : [];
  // Multi-month rows match once when any visible month matches; their cells stay unchanged.
  const entries = multi
    ? multiGroups.flatMap((group) => group.rows)
    : unfilteredGroups.flatMap((group) => group.rows.map((row) => ({ ...row, cells: [row] })));
  const namedEntries = entries.filter((row) => categoryNameMatches(row.name, nameQuery));
  const idsFor = (value: PlanFilter) =>
    new Set(
      namedEntries
        .filter((row) => row.cells.some((cell) => cell && filterPlanRows([cell], value).length > 0))
        .map((row) => row.id),
    );
  const uncategorizedLoading = uncategorized.isFetching && !uncategorized.isFetchingNextPage;
  const uncategorizedPages =
    uncategorizedLoading || uncategorized.isError ? [] : (uncategorized.data?.pages ?? []);
  const counts = {
    all: idsFor('all').size,
    underfunded: idsFor('underfunded').size,
    overspent: idsFor('overspent').size,
    available: idsFor('available').size,
    uncategorized:
      filter === 'uncategorized' && !uncategorizedLoading && !uncategorized.isError
        ? (uncategorizedPages[0]?.total ?? data.summary.uncategorizedCount ?? null)
        : (data.summary.uncategorizedCount ?? null),
  };
  const matchingIds = idsFor(filter);
  const narrowed = filter !== 'all' || Boolean(nameQuery.trim());
  const groups = unfilteredGroups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => matchingIds.has(row.id)) }))
    .filter((group) => !narrowed || group.rows.length > 0);
  const visibleMultiGroups = multiGroups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => matchingIds.has(row.id)) }))
    .filter((group) => !narrowed || group.rows.length > 0);
  const collapsibleKeys = groups
    .filter((g) => multi || shownView !== 'group' || g.rows.length !== 1)
    .map((g) => g.key);
  const shownRows = groups.flatMap((g) => g.rows);
  const shownIds = new Set(shownRows.map((r) => r.id));
  const orderedRows = [...shownRows, ...rows.filter((r) => !shownIds.has(r.id))];
  const toggleSelected = (id: string) => {
    selectionReturn.current = id;
    setOpen(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectRows = (items: PlanRow[]) => {
    setOpen(null);
    setSelected((prev) => {
      const next = new Set(prev);
      const all = items.every((r) => prev.has(r.id));
      for (const r of items) {
        if (all) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  };
  const startPhoneSelection = (id?: string) => {
    if (!phone) return;
    setOpen(null);
    if (!phoneSelection) setSelected(new Set(id ? [id] : []));
    else if (id) setSelected((previous) => new Set([...previous, id]));
    if (id) selectionReturn.current = id;
    setPhoneSelection(true);
  };
  const selectedIds = shownRows.filter((row) => selected.has(row.id)).map((row) => row.id);
  const tba = s.toBeAssignedCents;
  // The disabled "Geld verteilen" / "Wasserfall-Assistent" say why, in words next to them.
  const distributeBlock =
    tba < 0
      ? 'Zu viel zugewiesen'
      : tba === 0
        ? 'Nichts zu verteilen'
        : distribute
          ? 'Verteilung läuft'
          : null;
  const startDistribute = () => {
    setDistribute(true);
    setView('stage');
  };
  const sug = distribute ? suggestions(rows, tba) : {};
  const urgent = overspentEnvelopes({ envelopes: rows });

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
    await write(
      () => coverAll(month, source === 'suggested' ? undefined : source === '' ? null : source),
      (res) =>
        `${res.coveredCount} gedeckt, ${res.openCount} offen · ${eur(res.missingCents)} fehlen${res.openCount > 0 ? ' · auf freies Geld begrenzt' : ''}`,
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

  const coverControls = (urgent.length > 0 || tba < 0) && (
    <section className="triage" aria-labelledby="triage-title">
      <div className="head">
        <h2 id="triage-title">
          {urgent.length} Envelopes überzogen ·{' '}
          {eur(rows.reduce((sum, r) => sum + r.overspentCents, 0))} zu decken
        </h2>
      </div>
      <p className="panel-sub">
        Decken verschiebt freies Geld zwischen Envelopes; die Summe auf deinen Konten bleibt gleich.
      </p>
      {missing > 0 && (
        <div className="cover-missing" role="note">
          <p>
            Es fehlen {eur(missing)} – Geld kommt nur durch Einnahmen oder Umbuchungen auf ein
            Budget-Konto (z. B. aus Tagesgeld oder Depot).
          </p>
          <p>
            Überziehungen werden im laufenden Monat gedeckt: Einnahme buchen oder Geld aus
            Tagesgeld/Depot auf ein Budget-Konto umbuchen. Ungedeckte Barüberziehungen mindern sonst
            im Folgemonat „Zu verteilen“; ungedeckte Kartenausgaben bleiben Kartenschuld.
          </p>
        </div>
      )}
      {urgent.length > 0 && (
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
            variant="ghost"
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
  );
  return (
    <div
      onClickCapture={(event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
          return;
        const anchor = event.target instanceof Element ? event.target.closest('a') : null;
        if (!anchor) return;
        const target = new URL(anchor.href);
        if (
          target.origin !== window.location.origin ||
          !target.pathname.startsWith('/plan/monat/envelope/')
        )
          return;
        window.history.replaceState(
          {
            ...window.history.state,
            planActivityReturn: {
              month,
              view,
              selectedIds: [...selected],
              collapsedKeys: [...collapsed],
              inspector: open,
              phoneSelection,
            },
          },
          '',
        );
      }}
      className={cx(
        'plan-grid',
        multi && 'is-wide',
        phone && phoneSelection && 'has-phone-selection',
      )}
      style={
        phone && phoneSelection
          ? ({
              '--plan-selection-clearance': `${selectionHeight}px`,
              '--plan-selection-topbar-height': `${selectionTopbarHeight}px`,
            } as CSSProperties)
          : undefined
      }
    >
      <div className="plan-main">
        <PlanTopBar
          data={data}
          month={month}
          unfunded={groupStatus(rows).need}
          distributeBlock={distributeBlock}
          onIncome={onIncome}
          onDistribute={startDistribute}
          coverControls={filter === 'overspent' ? null : coverControls}
        />
        <section className="ptable-wrap card" aria-labelledby="table-title">
          <h2 className="sr-only" id="table-title">
            Envelopes im Monat
          </h2>
          <div className="plan-filterbar" aria-label="Kategorien filtern">
            <label className="plan-category-search">
              <span className="sr-only">Kategorie suchen</span>
              <TextInput
                type="search"
                placeholder="Kategorie suchen"
                value={nameQuery}
                disabled={filter === 'uncategorized'}
                aria-describedby={filter === 'uncategorized' ? 'plan-filter-scope' : undefined}
                maxLength={100}
                onChange={(event) => changeFilter(filter, event.target.value)}
              />
            </label>
            <div className="seg plan-filter-segments" role="group" aria-label="Kategoriefilter">
              {(
                [
                  ['all', 'Alle', counts.all],
                  ['underfunded', 'Unterfinanziert', counts.underfunded],
                  ['overspent', 'Überzogen', counts.overspent],
                  ['available', 'Verfügbar', counts.available],
                  ['uncategorized', 'Ohne Kategorie', counts.uncategorized],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  className={cx(value === 'overspent' && (count ?? 0) > 0 && 'has-overspending')}
                  onClick={() => changeFilter(value)}
                >
                  {label} ({count ?? '…'})
                </button>
              ))}
            </div>
            <OptionenMenu
              month={month}
              view={shownView}
              multi={multi}
              phone={phone}
              selectionMode={phoneSelection}
              onSelectionMode={() =>
                phoneSelection ? clearSelection(true) : startPhoneSelection()
              }
              collapsed={collapsed.size > 0}
              onView={setView}
              onToggleAll={() =>
                setCollapsed(collapsed.size ? new Set() : new Set(collapsibleKeys))
              }
            />
          </div>
          {filter === 'overspent' && (
            <div className="plan-filter-cover">{coverControls || <p>Nichts ist überzogen.</p>}</div>
          )}
          <p className="sr-only" role="status">
            {filter === 'uncategorized'
              ? uncategorized.isError
                ? 'Buchungen ohne Kategorie konnten nicht aktuell geladen werden.'
                : uncategorized.isPending || uncategorizedLoading
                  ? 'Buchungen ohne Kategorie werden geladen.'
                  : `${uncategorizedPages.reduce((sum, page) => sum + page.items.length, 0)} von ${counts.uncategorized ?? '…'} Buchungen ohne Kategorie geladen.`
              : `${matchingIds.size} passende ${matchingIds.size === 1 ? 'Kategorie' : 'Kategorien'}.`}
          </p>
          {(multi || filter === 'uncategorized') && (
            <p id="plan-filter-scope" className="plan-filter-scope">
              {filter === 'uncategorized'
                ? `Buchungen ohne Kategorie im ${monthLabel(month)}. Die Kategoriesuche gilt für die anderen Filter.`
                : `Jede Kategorie zählt einmal, wenn sie in einem sichtbaren Monat zutrifft. Decken bezieht sich auf ${monthLabel(month)}.`}
            </p>
          )}
          {narrowed && filter !== 'uncategorized' && matchingIds.size === 0 && (
            <p className="plan-filter-empty">Keine passende Kategorie.</p>
          )}
          <div className="ptoolbar">
            <VerteilenMenu
              month={month}
              multi={multi}
              emptyIds={shownRows
                .filter((r) => r.assignedCents === 0 && (r.quickAssign?.ghostCents ?? 0) > 0)
                .map((r) => r.id)}
              selectedIds={selectedIds}
              distributeBlock={distributeBlock}
              onDistribute={startDistribute}
              cover={
                urgent.length > 0
                  ? {
                      count: urgent.length,
                      reason:
                        !coverPool.length && tba <= 0 ? 'Kein freies Geld zum Decken' : undefined,
                      covering,
                      sourceLabel: coverLabel,
                      onCover: () => void coverMonth(),
                    }
                  : null
              }
            />
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
            <AppLink
              className="btn btn-ghost btn-sm plan-close"
              to={`/monatsabschluss/${month}`}
              search={{}}
            >
              Monat abschließen
            </AppLink>
          </div>
          {multi && filter !== 'uncategorized' && (
            <div className="plan-grid-head">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(collapsibleKeys))}
              >
                {collapsed.size ? 'Alle ausklappen' : 'Alle einklappen'}
              </Button>
              <Button
                variant="ghost"
                className="plan-add"
                onClick={() => setCategoryForm({ mode: 'group' })}
              >
                + Gruppe
              </Button>
            </div>
          )}
          {filter === 'uncategorized' ? (
            <PlanUncategorizedRows
              month={month}
              pages={uncategorizedPages}
              pending={uncategorized.isPending || uncategorizedLoading}
              error={uncategorized.error}
              hasMore={uncategorized.hasNextPage}
              loadingMore={uncategorized.isFetchingNextPage}
              onMore={() => void uncategorized.fetchNextPage()}
              onReload={() => void uncategorized.refetch()}
            />
          ) : multi ? (
            views ? (
              <MultiTable
                months={months}
                views={views}
                groups={visibleMultiGroups}
                collapsed={collapsed}
                onToggle={toggleGroup}
                onAdd={(groupId) => setCategoryForm({ mode: 'edit', groupId })}
                onOpen={inspect}
              />
            ) : (
              <LoadingNote what="Folgemonate" />
            )
          ) : (
            <div className="pmulti-scroll">
              <table className={cx('ptable ptable-zero', distribute && 'is-distributing')}>
                <caption className="sr-only">
                  Envelopes mit Zugewiesen, Aktivität und Verfügbar
                </caption>
                <thead>
                  <tr>
                    <th className="tech col-name" scope="col">
                      <div className="group-heading">
                        <PlanSelection
                          phone={phone}
                          mode={phoneSelection}
                          label="Alle Kategorien auswählen"
                          rows={shownRows}
                          selected={selected}
                          onChange={() => selectRows(shownRows)}
                        />
                        <button
                          type="button"
                          className="grp-toggle"
                          aria-label={collapsed.size ? 'Alle ausklappen' : 'Alle einklappen'}
                          onClick={() =>
                            setCollapsed(collapsed.size ? new Set() : new Set(collapsibleKeys))
                          }
                        >
                          <ChevronDown size={16} aria-hidden="true" />
                        </button>
                        <span>Kategoriegruppe</span>
                        <Button
                          variant="ghost"
                          className="plan-add"
                          aria-label="Gruppe anlegen"
                          onClick={() => setCategoryForm({ mode: 'group' })}
                        >
                          +
                        </Button>
                      </div>
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
                  {groups.map((g, index) => {
                    const st = groupStatus(g.rows);
                    const singleBand = shownView === 'group' && g.rows.length === 1;
                    const isCollapsed = !singleBand && collapsed.has(g.key);
                    const band = singleBand;
                    const sugSum = g.rows.reduce((a, r) => a + (sug[r.id] ?? 0), 0);
                    const toggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
                      // The shared category row and collapsed parent have different React keys.
                      // Keep keyboard focus on the equivalent native control after that remount.
                      if (event.currentTarget === document.activeElement)
                        groupFocusAfterToggle.current = g.key;
                      toggleGroup(g.key);
                    };
                    const groupHeading = (
                      <div className="group-heading">
                        <PlanSelection
                          phone={phone}
                          mode={phoneSelection}
                          label={`${shownView === 'group' && g.rows.length > 1 ? 'Gruppe ' : ''}${g.title} auswählen`}
                          rows={g.rows}
                          selected={selected}
                          onChange={() => selectRows(g.rows)}
                        />
                        <button
                          type="button"
                          className="grp-toggle"
                          aria-label={
                            shownView === 'group' && g.rows.length > 1
                              ? `Gruppe ${g.title}`
                              : undefined
                          }
                          aria-expanded={!isCollapsed}
                          title={`${g.sub ?? g.title} · ${statusText(g, st)}`}
                          onClick={toggle}
                        >
                          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                          <span className="grp-text">
                            <span className="grp-title">{g.title}</span>
                          </span>
                        </button>
                        {shownView === 'group' && (
                          <Button
                            variant="ghost"
                            className="plan-add"
                            aria-label={`Kategorie in ${g.title} anlegen`}
                            onClick={() => setCategoryForm({ mode: 'edit', groupId: g.key })}
                          >
                            +
                          </Button>
                        )}
                        {distribute && sugSum > 0 && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => take(g.rows.map((r) => r.id))}
                          >
                            {g.stage ? 'Stufe füllen' : 'Übernehmen'} · {eur(sugSum)}
                          </Button>
                        )}
                      </div>
                    );
                    return [
                      ...(index
                        ? [
                            <tr key={`${g.key}-gap`} className="pgroup-gap" aria-hidden="true">
                              <td colSpan={4} />
                            </tr>,
                          ]
                        : []),
                      !band && (
                        <tr
                          key={g.key}
                          className={cx('pgroup', isCollapsed && 'is-collapsed')}
                          id={`grp-${g.key}`}
                        >
                          <td className="col-name">{groupHeading}</td>
                          <td className="col-num col-assign" data-label="Zugewiesen">
                            {eur(st.assigned)}
                          </td>
                          <td className="col-num col-act" data-label="Aktivität">
                            {eur(st.activity)}
                          </td>
                          <td className="col-num col-avail" data-label="Verfügbar">
                            {eur(st.available)}
                          </td>
                        </tr>
                      ),
                      ...(g.rows.length === 0 && !isCollapsed && (g.emptyNote ?? g.emptyText)
                        ? [
                            <tr key={`${g.key}-empty`} className="prow is-empty">
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
                        : g.rows.map((r, rowIndex) => (
                            <EnvelopeRow
                              key={r.id}
                              row={r}
                              band={band && rowIndex === 0 ? g : undefined}
                              bandHeading={
                                band && rowIndex === 0 && !singleBand ? groupHeading : undefined
                              }
                              bandSummary={band && rowIndex === 0 && !singleBand ? st : undefined}
                              onAdd={() => setCategoryForm({ mode: 'edit', groupId: g.key })}
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
                              selected={selected.has(r.id)}
                              phoneSelection={phoneSelection}
                              onHold={() => startPhoneSelection(r.id)}
                              onSelect={() => toggleSelected(r.id)}
                              onCover={() => inspect(r.id)}
                              onInspect={() => inspect(r.id)}
                            />
                          ))),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {phone && phoneSelection && (
        <section ref={selectionBar} className="plan-selection-bar" aria-label="Kategorienauswahl">
          <div className="plan-selection-head">
            <p aria-live="polite">
              {selected.size} {selected.size === 1 ? 'Kategorie' : 'Kategorien'} ausgewählt
            </p>
            <Button variant="ghost" onClick={() => clearSelection(true)}>
              Auswahl beenden
            </Button>
          </div>
          <QuickAssignActions month={month} emptyIds={[]} selectedIds={selectedIds} inline />
        </section>
      )}
      <PlanInspector
        month={open?.month ?? month}
        rows={panelRows}
        selected={(open
          ? panelRows.filter((r) => r.id === open.id)
          : orderedRows.filter((r) => selected.has(r.id))
        ).map((r) => planGroups('time', [r], panelView, ctx).flatMap((g) => g.rows)[0] ?? r)}
        tba={panelView.summary.toBeAssignedCents}
        category={categoryTree.data?.categories.find(
          (c) => c.id === (open?.id ?? [...selected][0]),
        )}
        onClear={() => clearSelection(true)}
        onCategory={setCategoryForm}
        onHide={(category) =>
          void write(
            () => patchCategory(category.id, { hidden: !category.hiddenAt }),
            () => `„${category.name}“ ${category.hiddenAt ? 'eingeblendet' : 'ausgeblendet'}.`,
          )
        }
        overview={
          <MonthOverview data={data} rows={rows} month={months.length > 1 ? month : undefined} />
        }
        split={<SplitBand data={data} rows={rows} />}
        income={
          data.incomeTargets ? (
            <IncomeTargetsCard data={data.incomeTargets} rows={allRows} onOpen={inspect} />
          ) : (
            <p>Keine Planungswerte verfügbar.</p>
          )
        }
        money={
          data.budgetMoney && (
            <details className="plan-budget-money inspector-section">
              <summary
                title={data.budgetMoney.accounts
                  .map(
                    (a) =>
                      `${a.name}: ${eur(a.balanceCents)}${a.usedCreditCents > 0 ? ` · Kredit genutzt ${eur(-a.usedCreditCents)}${a.creditLineCents !== null ? ` · Rahmen ${eur(a.creditLineCents)}` : ' · Rahmen nicht hinterlegt'}` : ''}`,
                  )
                  .join(' · ')}
              >
                <ChevronDown
                  className="insp-chev"
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
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
          )
        }
        rail={
          <Rail
            view="stage"
            groups={planGroups('stage', rows, data, ctx)}
            data={data}
            onJump={(key) => {
              if (multi) setMonthSpan(1);
              setView('stage');
              setCollapsed((c) => new Set([...c].filter((k) => k !== key)));
              window.requestAnimationFrame(() => jump(key));
            }}
          />
        }
      />
      {categoryForm && categoryTree.isPending && <LoadingNote what="Kategorien" />}
      {categoryForm && categoryTree.isError && (
        <ErrorNote
          what="Kategorien"
          error={categoryTree.error}
          onRetry={() => void categoryTree.refetch()}
        />
      )}
      {categoryTree.data && (
        <CategoryPanel
          state={categoryForm}
          tree={categoryTree.data}
          onClose={() => setCategoryForm(null)}
          onSwitch={setCategoryForm}
        />
      )}
    </div>
  );
}

/** Sticky month controls; native disclosures keep the derivation and cover actions nearby. */
function PlanTopBar({
  data,
  month,
  unfunded,
  distributeBlock,
  onIncome,
  onDistribute,
  coverControls,
}: {
  data: BudgetMonthView;
  month: string;
  unfunded: number;
  distributeBlock: string | null;
  onIncome: () => void;
  onDistribute: () => void;
  coverControls: React.ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const disclosureToggle = (element: HTMLDetailsElement, key: string) => {
    if (element.open) {
      document
        .querySelectorAll<HTMLDetailsElement>('.plan-topbar details[open]')
        .forEach((other) => {
          if (other !== element) other.open = false;
        });
      setActive(key);
    } else setActive((current) => (current === key ? null : current));
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !(event.target instanceof Element)) return;
      const panel = event.target.closest('.plan-topbar .plan-popover-content');
      const disclosure =
        event.target.closest<HTMLDetailsElement>('.plan-popover[open]') ??
        (panel
          ? document.querySelector<HTMLDetailsElement>(
              `.plan-topbar details[open]:has(summary[aria-controls="${panel.id}"])`,
            )
          : null);
      if (disclosure) {
        disclosure.open = false;
        disclosure.querySelector('summary')?.focus();
      }
    };
    const outside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (event.target instanceof Element && event.target.closest('.plan-popover-content')) return;
      document.querySelectorAll<HTMLDetailsElement>('.plan-popover[open]').forEach((disclosure) => {
        if (!disclosure.contains(event.target as Node)) disclosure.open = false;
      });
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('click', outside);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('click', outside);
    };
  }, []);
  useAmountPrivacy();
  const s = data.summary;
  const tba = s.toBeAssignedCents;
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
  return (
    <section className="plan-topbar" aria-label="Monat planen">
      <div className="plan-chip-scroll">
        <details
          className="plan-popover"
          onToggle={(event) => disclosureToggle(event.currentTarget, 'plan-chip-panel-0')}
        >
          <summary
            aria-controls="plan-chip-panel-0"
            className={cx('plan-tba', tba > 0 && 'is-positive', tba < 0 && 'is-negative')}
          >
            <span className="plan-tba-label">Zu verteilen</span>
            <strong data-testid="to-be-assigned" aria-live="polite">
              {eur(tba)}
            </strong>
          </summary>
        </details>
        <button
          type="button"
          className="plan-chip"
          title="Summe der fehlenden Zielbeträge"
          onClick={() => {
            // Outside dismissal first restores the month sections when a category is selected.
            window.requestAnimationFrame(() => {
              document
                .querySelector<HTMLDetailsElement>('.inspector-fold')
                ?.setAttribute('open', '');
              const section = document.querySelector<HTMLDetailsElement>('#inspector-income');
              section?.setAttribute('open', '');
              section?.querySelector('summary')?.focus();
            });
          }}
        >
          Unterfinanziert {eur(unfunded)}
        </button>
        <details
          className="plan-popover"
          onToggle={(event) => disclosureToggle(event.currentTarget, 'plan-chip-panel-2')}
        >
          <summary aria-controls="plan-chip-panel-2" className="plan-chip">
            {s.unclassified?.count ?? 0} ohne Kategorie
          </summary>
        </details>
        <Button
          size="sm"
          disabled={Boolean(distributeBlock)}
          aria-describedby={distributeBlock ? 'plan-distribute-hint' : undefined}
          onClick={onDistribute}
        >
          Geld verteilen
        </Button>
        {distributeBlock && (
          <span
            id="plan-distribute-hint"
            className={cx('plan-hint', tba < 0 && 'is-negative')}
            data-testid="distribute-hint"
          >
            {distributeBlock}
          </span>
        )}
      </div>
      <div
        className="plan-popover-content"
        id="plan-chip-panel-0"
        hidden={active !== 'plan-chip-panel-0'}
        aria-label="Herleitung Zu verteilen"
      >
        <DimensionChain terms={terms} precision="cent" label="Maßkette Zu verteilen" />
        {/* Owner decision 18.10.2026: no overspending chip in the head; the cover actions live
            here and in "Verteilen ▾" ("Überzogene decken"), the overspent rows stay marked in the list. */}
        {coverControls}
      </div>
      <div
        className="plan-popover-content"
        id="plan-chip-panel-2"
        hidden={active !== 'plan-chip-panel-2'}
      >
        <p>
          Eingang {eur(s.unclassified?.inflowCents ?? 0)} · Ausgang{' '}
          {eur(-(s.unclassified?.outflowCents ?? 0))} · Saldo {eur(s.unclassified?.netCents ?? 0)}
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
      </div>
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
  const available = availableInEnvelopes(rows);
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
export function SplitBand({ data, rows }: { data: BudgetMonthView; rows: PlanRow[] }) {
  useAmountPrivacy();
  const state = splitState(data.summary, rows);
  const current = todayInVienna().slice(0, 7);
  const provisional = data.summary.month >= current;
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
          {provisional ? (
            <span className="muted">Eingeschränkte Vergleichsbasis</span>
          ) : shares === null ? (
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
      <p className="sb-note">
        Ist-Einnahmen im Planmonat {monthLabel(data.summary.month)}: {eur(data.summary.incomeCents)}
        . Erwartete Einnahmen sind nicht enthalten.
      </p>
      {provisional && (
        <p className="sb-note sb-comparison">
          Der Monat ist noch nicht abgeschlossen. Kleine bisherige Einnahmen können die Anteile
          stark erhöhen; daraus folgt noch keine Monatsbewertung.{' '}
          <AppLink to="/reports/onepager" search={{ monat: shiftMonth(current, -1) }}>
            Abgeschlossenen Monat {monthLabel(shiftMonth(current, -1))} vergleichen
          </AppLink>
        </p>
      )}
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

function PlanSelection({
  phone,
  mode,
  label,
  rows,
  selected,
  onChange,
}: {
  phone: boolean;
  mode: boolean;
  label: string;
  rows: PlanRow[];
  selected: ReadonlySet<string>;
  onChange: () => void;
}) {
  const count = rows.filter((r) => selected.has(r.id)).length;
  if (phone)
    return mode ? (
      <button
        type="button"
        className="plan-select-toggle"
        aria-label={label}
        title={label}
        aria-pressed={
          count > 0 && count < rows.length ? 'mixed' : rows.length > 0 && count === rows.length
        }
        disabled={!rows.length}
        onClick={onChange}
      >
        <span aria-hidden="true">
          {count}/{rows.length}
        </span>
      </button>
    ) : null;
  return (
    <label className="plan-select">
      <input
        type="checkbox"
        aria-label={label}
        checked={rows.length > 0 && count === rows.length}
        disabled={!rows.length}
        ref={(input) => {
          if (input) input.indeterminate = count > 0 && count < rows.length;
        }}
        onChange={onChange}
      />
    </label>
  );
}

function BandValue({
  combined,
  kind,
  children,
}: {
  combined: boolean;
  kind: 'assigned' | 'activity' | 'available';
  children: ReactNode;
}) {
  return combined ? <div className={`band-category-${kind}`}>{children}</div> : children;
}

function BandTotal({ group, metric, value }: { group: string; metric: string; value: number }) {
  return (
    <span
      className="band-total"
      data-label={metric}
      title={`Gruppe ${group} · ${metric}: ${eur(value)}`}
    >
      <span className="band-total-kind">Gruppe </span>
      <span className="sr-only">
        {group} · {metric}:{' '}
      </span>
      {eur(value)}
    </span>
  );
}

/** Only category-name touch input can enter phone mode; pending holds never block scrolling. */
function usePhoneSelectionHold(phone: boolean, month: string, onHold: () => void) {
  const callback = useRef(onHold);
  useLayoutEffect(() => {
    callback.current = onHold;
  });
  const cleanup = useRef<(() => void) | null>(null);
  const accepted = useRef(false);
  const clearCompatibilityClick = useRef<(() => void) | null>(null);
  const cancelPending = () => {
    cleanup.current?.();
    cleanup.current = null;
  };
  useEffect(
    () => () => {
      cleanup.current?.();
      cleanup.current = null;
      clearCompatibilityClick.current?.();
      accepted.current = false;
    },
    [phone, month],
  );
  const start = (event: ReactPointerEvent<HTMLButtonElement>) => {
    cancelPending();
    clearCompatibilityClick.current?.();
    accepted.current = false;
    if (!phone || event.pointerType !== 'touch' || !event.isPrimary) return;
    const id = event.pointerId;
    const button = event.currentTarget;
    const x = event.clientX;
    const y = event.clientY;
    // Aborting the hold timer never releases an already accepted gesture's click shield.
    const cancel = () => cancelPending();
    const move = (next: PointerEvent) => {
      if (next.pointerId === id && Math.hypot(next.clientX - x, next.clientY - y) > 10) cancel();
    };
    const another = (next: PointerEvent) => {
      if (next.pointerId !== id) cancel();
    };
    const release = (next: PointerEvent) => {
      if (next.pointerId === id) cancelPending();
    };
    cleanup.current = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', another);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('scroll', cancel, true);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', another, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', cancel, { passive: true });
    window.addEventListener('scroll', cancel, { passive: true, capture: true });
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    const timer = window.setTimeout(() => {
      // Capture only an accepted hold before the bar mounts; pending touch scrolling stays native.
      try {
        button.setPointerCapture?.(id);
      } catch {
        cancelPending();
        return;
      }
      accepted.current = true;
      // The bar can appear under the held finger. Consume only this gesture's compatibility
      // click at capture time, including when its target is now a bulk action. A fresh down or
      // keyboard/switch activation clears the guard without consuming that new action.
      const clear = () => {
        accepted.current = false;
        window.removeEventListener('click', followClick, true);
        window.removeEventListener('pointerdown', clear, true);
        clearCompatibilityClick.current = null;
      };
      const followClick = (click: MouseEvent) => {
        const suppress = accepted.current && click.detail > 0;
        clear();
        if (suppress) {
          click.preventDefault();
          click.stopImmediatePropagation();
        }
      };
      clearCompatibilityClick.current = clear;
      window.addEventListener('click', followClick, true);
      window.addEventListener('pointerdown', clear, { capture: true, passive: true });
      callback.current();
    }, 500);
  };
  return {
    start,
    cancelPending,
    accepted: () => accepted.current,
    consume: (event: ReactMouseEvent<HTMLButtonElement>) => {
      const suppress = accepted.current && event.detail > 0;
      accepted.current = false;
      if (suppress) {
        event.preventDefault();
        event.stopPropagation();
      }
      return suppress;
    },
  };
}

function EnvelopeRow({
  row: r,
  band,
  bandHeading,
  bandSummary,
  onAdd,
  ctx,
  suggestion,
  tba,
  editing,
  onEdit,
  onCommit,
  onTake,
  selected,
  phoneSelection,
  onHold,
  onSelect,
  onCover,
  onInspect,
}: {
  row: PlanRow;
  band: PlanGroup | undefined;
  bandHeading: ReactNode | undefined;
  bandSummary: ReturnType<typeof groupStatus> | undefined;
  onAdd: () => void;
  ctx: PlanContext;
  suggestion: number | undefined;
  /** "Zu verteilen": the guard refuses raising the assignment beyond it. */
  tba: number;
  editing: boolean;
  onEdit: (on: boolean) => void;
  onCommit: (value: number) => void;
  onTake: () => void;
  selected: boolean;
  phoneSelection: boolean;
  onHold: () => void;
  onSelect: () => void;
  onCover: () => void;
  onInspect: () => void;
}) {
  useAmountPrivacy();
  const cash = isCashOver(r);
  const credit = !cash && r.creditOverspentCents > 0;
  const over = r.overspentCents > 0;
  const bar = barFor(r, ctx);
  const spending = spendingBar(r);
  const assignment = assignGhost(r);
  const phone = useIsPhone();
  const hold = usePhoneSelectionHold(phone, ctx.month, onHold);
  const openRow = () => (phone && phoneSelection ? onSelect() : onInspect());
  const ghost = suggestion !== undefined && (
    <button
      type="button"
      className="ghost"
      aria-label={`Vorschlag ${eur(suggestion)} für ${r.name} übernehmen`}
      onClick={onTake}
    >
      +{eur(suggestion).replace(/\s?€$/, '')}
    </button>
  );
  return (
    <tr
      className={cx(
        'prow',
        band && 'pgroup psingle',
        !!bandHeading && 'pmulti',
        over && 'is-over',
        credit && 'is-credit',
        selected && 'is-selected',
      )}
      id={band ? `grp-${band.key}` : undefined}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          (band || event.target.closest('.col-name')) &&
          !event.target.closest(
            'a, button, input, label, .band-parent, .band-total, .band-parent-totals',
          )
        )
          openRow();
      }}
    >
      <td className="col-name">
        {bandHeading && <div className="band-parent">{bandHeading}</div>}
        {bandSummary && (
          <div className="band-parent-totals">
            <BandTotal group={band!.title} metric="Zugewiesen" value={bandSummary.assigned} />
            <BandTotal group={band!.title} metric="Aktivität" value={bandSummary.activity} />
            <BandTotal group={band!.title} metric="Verfügbar" value={bandSummary.available} />
          </div>
        )}
        {!phone && (
          <label className="plan-select">
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelect}
              aria-label={`${r.name} auswählen`}
            />
          </label>
        )}
        <button
          type="button"
          className="pname"
          title={[
            r.cls && CLASS_TEXT[r.cls],
            bar.meta,
            bar.pace !== null && 'Markierung: heute',
            r.due?.source === 'expected' &&
              `erwartet ${dayMonth(r.due.date)} · ${r.due.name ?? ''} ${r.due.amountCents ? eur(r.due.amountCents) : ''}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          data-category-id={r.id}
          aria-pressed={selected}
          onPointerDown={hold.start}
          onBlur={hold.cancelPending}
          onContextMenu={(event) => {
            if (hold.accepted()) event.preventDefault();
          }}
          onClick={(event) => {
            if (hold.consume(event)) return;
            openRow();
          }}
        >
          {band && !bandHeading ? (
            <span className="band-number" aria-hidden="true">
              {band.no.padStart(2, '0')}
            </span>
          ) : (
            <CategoryIcon icon={r.icon} name={r.name} />
          )}
          <span className="category-name">{band && !bandHeading ? band.title : r.name}</span>
          {band && !bandHeading && band.title !== r.name && (
            <span className="sr-only"> · {r.name}</span>
          )}
        </button>
        {band && !bandHeading && (
          <Button
            variant="ghost"
            className="plan-add"
            aria-label={`Kategorie in ${band.title} anlegen`}
            onClick={onAdd}
          >
            +
          </Button>
        )}
        <span
          className={cx('spending-status', spending.over && 'neg-alert')}
          title={spending.status}
        >
          {spending.status}
        </span>
        <span className={cx('pbar spending-bar', spending.over && 'is-over')} aria-hidden="true">
          <i className="pbar-fill" style={{ width: `${spending.spentShare * 100}%` }} />
          {bar.fill !== null && bar.pace !== null && (
            <i className="pbar-tick" style={{ left: `${bar.pace * 100}%` }}></i>
          )}
        </span>
      </td>
      <td className="col-num col-assign" data-label="Zugewiesen">
        {bandSummary && (
          <BandTotal group={band!.title} metric="Zugewiesen" value={bandSummary.assigned} />
        )}
        <BandValue combined={!!bandHeading} kind="assigned">
          {phone ? (
            <span
              className="phone-assigned"
              title={assignment ? ghostSource(assignment) : undefined}
            >
              Zugewiesen {assignment ? `≈ ${eur(assignment.ghostCents)}` : eur(r.assignedCents)}
            </span>
          ) : (
            <>
              <AssignCell
                row={r}
                tba={tba}
                editing={editing}
                monthKey={ctx.month}
                onEdit={onEdit}
                onCommit={onCommit}
              />
            </>
          )}
          {!phone && ghost}
        </BandValue>
      </td>
      <td className="col-num col-act" data-label="Aktivität">
        {bandSummary && (
          <BandTotal group={band!.title} metric="Aktivität" value={bandSummary.activity} />
        )}
        <BandValue combined={!!bandHeading} kind="activity">
          <ActivityLink month={ctx.month} id={r.id} name={r.name} cents={r.activityCents} />
        </BandValue>
      </td>
      <td className="col-num col-avail" data-label="Verfügbar">
        {bandSummary && (
          <BandTotal group={band!.title} metric="Verfügbar" value={bandSummary.available} />
        )}
        <BandValue combined={!!bandHeading} kind="available">
          {phone && ghost}
          {phone ? (
            <button
              type="button"
              onClick={over ? onCover : onInspect}
              aria-label={over ? `${r.name} decken` : `Zugewiesen für ${r.name} ändern`}
              className={cx(
                'plan-available pill',
                over ? 'is-bad' : r.availableCents > 0 && 'is-good',
              )}
            >
              {eur(r.availableCents)}
              {over && <ArrowRightLeft size={16} aria-hidden="true" />}
            </button>
          ) : (
            <>
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
                  onClick={onCover}
                >
                  <ArrowRightLeft size={16} aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </BandValue>
      </td>
    </tr>
  );
}
