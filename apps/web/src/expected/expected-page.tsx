import {
  useAmountPrivacy,
  Button,
  CircleNumber,
  ClassSwatch,
  Segmented,
  SectionHead,
  Select,
  cx,
} from '@budget/ui';
import { addDays, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { ChevronDown, Plus, RefreshCw, Repeat, Ellipsis } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { eur, dayHeading, longDay } from '../ledger/format';
import { lookupsQuery } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { PLAN_ERWARTET } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { useMonth } from '../shell/use-month';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { PaymentsCalendar } from '../pages/payments-preview-report';
import { validateExpectedSearch, type PaymentView } from './search';
import './expected-redesign.css';
import {
  eurOf,
  expectedQuery,
  incomeQuery,
  occurrencesQuery,
  refreshExpected,
  useFxRates,
  type ExpectedPayment,
  type Occurrence,
} from './api';
import {
  cadenceText,
  RHYTHM_LABEL,
  contractGroups,
  isContract,
  money,
  needsAction,
  paymentGroups,
  HORIZONS,
  type ContractGroup,
  type Horizon,
  type PaymentGroup,
  type PaymentWeek,
} from './expected-model';
import { IncomeButton } from './income-panel';
import { draftFromBooking } from './payment-draft';
import { PaymentPanel, type PaymentPanelState } from './payment-panel';
import { StatusStamp } from './status-stamp';
import { PlanPageFrame } from '../budget/plan-page-frame';

const PaymentSources = createContext<readonly ExpectedPayment[]>([]);
const SelectedPayment = createContext<string | undefined>(undefined);

type View = PaymentView;
type KindFilter = 'all' | 'inflow' | 'outflow';

const VIEWS = [
  { value: 'next', label: 'Anstehend' },
  { value: 'contracts', label: 'Verträge und Abos' },
  { value: 'all', label: 'Alle' },
] as const;
const KINDS = [
  { value: 'all', label: 'Alle' },
  { value: 'inflow', label: 'Einnahmen' },
  { value: 'outflow', label: 'Ausgaben' },
] as const;
const HORIZON_OPTIONS = [
  { value: '35', label: '35 Tage' },
  { value: '90', label: '90 Tage' },
] as const;
/** The list always loads the longer horizon, so the switch only filters and never refetches. */
const LOAD_DAYS = HORIZONS[1];

/**
 * Plan › Erwartet (nav: Zahlungen): what is about to be paid or received. The next 35 days (90 on
 * request) in four groups with their sums, the parts list
 * of contracts and subscriptions (monthly equivalent and yearly sum). Payment details have
 * their own URL; only input opens a dialog. Figures come from `/api/expected`.
 */
export function ExpectedPage({
  detail,
  selectedId,
}: { detail?: ReactNode; selectedId?: string } = {}) {
  useAmountPrivacy();
  const [month] = useMonth();
  const today = todayInVienna();
  const saved = useLocation({ select: (location) => location.state });
  const route = validateExpectedSearch(
    (useLocation({ select: (location) => location.search }) as unknown as Record<
      string,
      unknown
    >) ?? {},
  );
  const [localView, setView] = useState<View>(saved.expectedView ?? 'next');
  const [localKind, setKind] = useState<KindFilter>(saved.expectedKind ?? 'all');
  const [localHorizon, setHorizon] = useState<Horizon>(saved.expectedHorizon ?? HORIZONS[0]);
  // URL defaults also apply when Back returns to the initial, query-free list.
  const view = REDESIGN_ENABLED ? (route.ansicht ?? 'next') : localView;
  const kind = REDESIGN_ENABLED ? (route.art ?? 'all') : localKind;
  const horizon = REDESIGN_ENABLED ? (route.tage ?? HORIZONS[0]) : localHorizon;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const [panel, setPanel] = useState<PaymentPanelState>(null);

  // Plan the occurrences and match bookings once when the page opens (idempotent; the P4 worker
  // does the same later). The lists wait for it, so they never flash empty.
  const refresh = useQuery({
    queryKey: ['expected-refresh'],
    queryFn: refreshExpected,
    staleTime: 300_000,
    retry: false,
    enabled: !REDESIGN_ENABLED,
  });
  const ready = REDESIGN_ENABLED || !refresh.isPending;

  const from = addDays(today, -31);
  const to = addDays(today, LOAD_DAYS);
  const payments = useQuery({ ...expectedQuery(), enabled: ready });
  const occurrences = useQuery({
    ...occurrencesQuery(from, to),
    enabled: ready && view === 'next',
  });
  const lookups = useQuery(lookupsQuery());
  const income = useQuery(incomeQuery(month));
  const currencies = [
    ...(payments.data ?? []).map((p) => p.version?.currency ?? 'EUR'),
    ...(occurrences.data ?? []).map((o) => o.currency),
  ];
  const rates = useFxRates(currencies);

  // "Als wiederkehrende Zahlung anlegen" on a booking brings the booking along in the history state.
  const fromBooking = useLocation({ select: (l) => l.state.expectedFrom });
  const navigate = useNavigate();
  const remember = (nextView: View, nextKind: KindFilter, nextHorizon: Horizon = horizon) => {
    setView(nextView);
    setKind(nextKind);
    setHorizon(nextHorizon);
    void navigate({
      to: '.',
      search: ((previous: object) =>
        REDESIGN_ENABLED
          ? { ...previous, ansicht: nextView, art: nextKind, tage: nextHorizon }
          : previous) as never,
      replace: !REDESIGN_ENABLED,
      state: { expectedView: nextView, expectedKind: nextKind, expectedHorizon: nextHorizon },
    });
  };
  const manualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshExpected();
      await Promise.all([payments.refetch(), occurrences.refetch(), income.refetch()]);
    } catch (error) {
      setRefreshError(error);
    } finally {
      setRefreshing(false);
    }
  };
  const detailSearch = {
    monat: month,
    ansicht: view,
    art: kind,
    ...(REDESIGN_ENABLED ? { tage: horizon } : {}),
  };
  const openPayment = (id: string) =>
    void navigate({ to: '/plan/erwartet/$id', params: { id }, search: detailSearch });
  const consumed = useRef(false);
  useEffect(() => {
    if (!fromBooking || consumed.current) return;
    consumed.current = true;
    setPanel({ mode: 'create', draft: draftFromBooking(fromBooking, todayInVienna()) });
    void navigate({
      to: '.',
      search: ((prev: object) => prev) as never,
      replace: true,
      state: {} as never,
    });
  }, [fromBooking, navigate]);

  const pending = !ready || payments.isPending || (view === 'next' && occurrences.isPending);
  const error = payments.error ?? (view === 'next' ? occurrences.error : null);

  return (
    <PaymentSources.Provider value={payments.data ?? []}>
      <SelectedPayment.Provider value={selectedId}>
        <ExpectedFrame
          controls={
            <>
              <Select
                aria-label="Ansicht"
                value={view}
                onChange={(event) => remember(event.target.value as View, kind)}
              >
                {[...VIEWS, { value: 'kalender', label: 'Kalender' }].map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
              {view !== 'contracts' && view !== 'kalender' && (
                <Select
                  aria-label="Einnahmen oder Ausgaben"
                  value={kind}
                  onChange={(event) => remember(view, event.target.value as KindFilter)}
                >
                  {KINDS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              )}
              {view === 'next' && (
                <Select
                  aria-label="Zeitraum"
                  value={String(horizon)}
                  onChange={(event) => remember(view, kind, event.target.value === '90' ? 90 : 35)}
                >
                  {HORIZON_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              )}
              {view !== 'kalender' && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={refreshing ? 'Wird aktualisiert …' : 'Fälligkeiten aktualisieren'}
                  disabled={refreshing}
                  onClick={() => void manualRefresh()}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                </button>
              )}
              <Button
                size="sm"
                aria-label="Wiederkehrende Zahlung"
                onClick={() => setPanel({ mode: 'create' })}
              >
                <Plus size={16} aria-hidden="true" />
                Zahlung
              </Button>
            </>
          }
          income={
            <IncomeButton
              value={income.data ? `${eur(income.data.expectedCents)} erwartet` : '–'}
              onOpen={() => void navigate({ to: '/plan/erwartet/einnahmen', search: detailSearch })}
            />
          }
        >
          <PaymentLayout detail={detail}>
            <div className={cx('xp', REDESIGN_ENABLED && 'payments-v2')}>
              {!REDESIGN_ENABLED && (
                <div className="xp-toolbar">
                  <Segmented
                    label="Ansicht"
                    options={
                      REDESIGN_ENABLED
                        ? [...VIEWS, { value: 'kalender', label: 'Kalender' }]
                        : VIEWS
                    }
                    value={view}
                    onChange={(next) => remember(next, kind)}
                  />
                  {view !== 'contracts' && view !== 'kalender' && (
                    <Segmented
                      label="Einnahmen oder Ausgaben"
                      options={KINDS}
                      value={kind}
                      onChange={(next) => remember(view, next)}
                    />
                  )}
                  {view === 'next' && (
                    <Segmented
                      label="Zeitraum"
                      options={HORIZON_OPTIONS}
                      value={String(horizon) as '35' | '90'}
                      onChange={(next) => remember(view, kind, next === '90' ? 90 : 35)}
                    />
                  )}
                  <span className="xp-spacer" />
                  {REDESIGN_ENABLED && view !== 'kalender' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={refreshing}
                      onClick={() => void manualRefresh()}
                    >
                      {refreshing ? 'Wird aktualisiert …' : 'Fälligkeiten aktualisieren'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setPanel({ mode: 'create' })}>
                    <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                    Wiederkehrende Zahlung
                  </Button>
                </div>
              )}
              {view === 'kalender' && REDESIGN_ENABLED ? (
                <PaymentsCalendar />
              ) : (
                <>
                  {refreshError && (
                    <ErrorNote
                      what="Fälligkeiten"
                      error={refreshError}
                      onRetry={() => void manualRefresh()}
                    />
                  )}
                  {pending && <LoadingNote what="Wiederkehrende Zahlungen" />}
                  {error && (
                    <ErrorNote
                      what="Wiederkehrende Zahlungen"
                      error={error}
                      onRetry={() => {
                        void payments.refetch();
                        void occurrences.refetch();
                      }}
                    />
                  )}
                  {!pending && !error && view === 'next' && occurrences.data && (
                    <NextDays
                      rows={occurrences.data}
                      today={today}
                      kind={kind}
                      horizon={horizon}
                      rates={rates}
                      onOpen={openPayment}
                      onCreate={() => setPanel({ mode: 'create' })}
                    />
                  )}
                  {!pending && !error && view !== 'next' && payments.data && (
                    <Contracts
                      payments={payments.data}
                      outflowsOnly={view === 'contracts'}
                      kind={kind}
                      rates={rates}
                      groupOf={(categoryId) => {
                        const category = lookups.data?.categories.find((c) => c.id === categoryId);
                        const group = lookups.data?.groups.find((g) => g.id === category?.groupId);
                        return group ?? null;
                      }}
                      categoryOf={(categoryId) =>
                        lookups.data?.categories.find((c) => c.id === categoryId) ?? null
                      }
                      onOpen={openPayment}
                      onCreate={() => setPanel({ mode: 'create' })}
                    />
                  )}
                </>
              )}
            </div>
          </PaymentLayout>
          <PaymentPanel state={panel} onClose={() => setPanel(null)} />
        </ExpectedFrame>
      </SelectedPayment.Provider>
    </PaymentSources.Provider>
  );
}

function PaymentLayout({ detail, children }: { detail?: ReactNode; children: ReactNode }) {
  return REDESIGN_ENABLED ? (
    <div className={cx('payments-reference-layout', !!detail && 'has-detail')}>
      {children}
      {detail}
    </div>
  ) : (
    <>{children}</>
  );
}

function ExpectedFrame({
  income,
  controls,
  children,
}: {
  income: ReactNode;
  controls: ReactNode;
  children: ReactNode;
}) {
  const [month, , setMonth] = useMonth();
  if (!REDESIGN_ENABLED)
    return (
      <PageFrame meta={PLAN_ERWARTET} income={income}>
        {children}
      </PageFrame>
    );
  return (
    <PlanPageFrame
      page="erwartet"
      title="Zahlungen"
      className="payments-reference"
      actions={controls}
    >
      {children}
      <details className="payments-reference-source">
        <summary>Einnahmen und Stand</summary>
        {income}
        <label className="payments-reference-month">
          Monat{' '}
          <input
            type="month"
            value={month}
            onChange={(event) => {
              if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value);
            }}
          />
        </label>
        <p className="plan-v2-source">
          Stand {longDay(todayInVienna())} · gespeicherte Fälligkeiten · Beträge in Originalwährung
        </p>
      </details>
    </PlanPageFrame>
  );
}

// ---------- Anstehend (35 / 90 Tage) ----------

function useCollapsed() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return [collapsed, toggle] as const;
}

function NextDays({
  rows,
  today,
  kind,
  horizon,
  rates,
  onOpen,
  onCreate,
}: {
  rows: Occurrence[];
  today: string;
  kind: KindFilter;
  horizon: Horizon;
  rates: Record<string, number>;
  onOpen: (paymentId: string) => void;
  onCreate: () => void;
}) {
  useAmountPrivacy();
  const [collapsed, toggle] = useCollapsed();
  const groups = useMemo(
    () =>
      paymentGroups(
        rows.filter((r) => kind === 'all' || r.kind === kind),
        today,
        rates,
        horizon,
      ),
    [rows, today, kind, rates, horizon],
  );
  if (groups.length === 0)
    return (
      <EmptyNote
        action={
          <Button size="sm" variant="ghost" onClick={onCreate}>
            Wiederkehrende Zahlung anlegen
          </Button>
        }
      >
        In den nächsten {horizon} Tagen ist nichts fällig.
      </EmptyNote>
    );
  const sum = groups.reduce((a, g) => a + g.sumCents, 0);
  return (
    <section aria-labelledby="xp-next">
      {REDESIGN_ENABLED ? (
        <h2 className="sr-only" id="xp-next">
          Wiederkehrende Zahlungen
        </h2>
      ) : (
        <SectionHead
          id="xp-next"
          title="Wiederkehrende Zahlungen"
          aside={
            <span className="xp-aside">
              {groups.reduce((a, g) => a + g.rows.length, 0)} Fälligkeiten ·{' '}
              {eur(sum, { sign: true })}
            </span>
          }
        />
      )}
      <table className="ptable xp-table xp-next">
        <caption className="sr-only">
          Fällige und wiederkehrende Zahlungen der nächsten {horizon} Tage in Gruppen mit Summe
        </caption>
        <thead>
          <tr>
            {!REDESIGN_ENABLED && (
              <th className="tech col-pos" scope="col">
                Pos.
              </th>
            )}
            <th className="tech col-name" scope="col">
              Zahlung
            </th>
            {REDESIGN_ENABLED && (
              <>
                <th className="tech col-interval" scope="col">
                  Intervall
                </th>
                <th className="tech col-account" scope="col">
                  Konto
                </th>
              </>
            )}
            {!REDESIGN_ENABLED && (
              <th className="tech col-due" scope="col">
                Fällig
              </th>
            )}
            {!REDESIGN_ENABLED && (
              <th className="tech col-cat" scope="col">
                Kategorie
              </th>
            )}
            <th className="tech col-num" scope="col">
              Betrag
            </th>
            {REDESIGN_ENABLED && (
              <th className="tech col-due" scope="col">
                Fällig
              </th>
            )}
            <th className="tech col-state" scope="col">
              <span className={REDESIGN_ENABLED ? 'sr-only' : undefined}>Status</span>
            </th>
            {REDESIGN_ENABLED && (
              <th className="col-action" scope="col">
                <span className="sr-only">Aktion</span>
              </th>
            )}
          </tr>
        </thead>
        {groups.map((g, gi) => (
          <GroupRows
            key={g.key}
            group={g}
            no={gi + 1}
            today={today}
            rates={rates}
            collapsed={collapsed}
            onToggle={toggle}
            onOpen={onOpen}
          />
        ))}
      </table>
    </section>
  );
}

interface HeadProps {
  no?: number;
  title: string;
  sub: string;
  sumCents: number;
  leftOut: number;
  collapsed: boolean;
  onToggle: () => void;
  testId: string;
  /** A week inside "Später": its own sticky head, no circle number. */
  week?: boolean;
}

function HeadRow({
  no,
  title,
  sub,
  sumCents,
  leftOut,
  collapsed,
  onToggle,
  testId,
  week,
}: HeadProps) {
  useAmountPrivacy();
  return (
    <tr
      className={cx('pgroup', week && 'is-week', collapsed && 'is-collapsed')}
      data-testid={testId}
    >
      {!REDESIGN_ENABLED && (
        <td className="col-pos">{no !== undefined && <CircleNumber n={no} size="sm" />}</td>
      )}
      <td className="col-name" colSpan={3}>
        <button type="button" className="grp-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="grp-title">{title}</span>
          <span className="grp-sub">{sub}</span>
        </button>
      </td>
      <td className="col-num" data-label="Summe">
        {eur(sumCents, { sign: true })}
        {leftOut > 0 && <span className="xp-sub"> ohne Fremdwährung</span>}
      </td>
      {REDESIGN_ENABLED && <td className="col-due" />}
      <td className="col-state" />
      {REDESIGN_ENABLED && <td className="col-action" />}
    </tr>
  );
}

/** One group is one `tbody`, so its head sticks only while the group is in view. */
function GroupRows({
  group: g,
  no,
  today,
  rates,
  collapsed,
  onToggle,
  onOpen,
}: {
  group: PaymentGroup;
  no: number;
  today: string;
  rates: Record<string, number>;
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onOpen: (paymentId: string) => void;
}) {
  const closed = collapsed.has(g.key);
  const head = (
    <HeadRow
      no={no}
      title={g.title}
      sub={g.sub}
      sumCents={g.sumCents}
      leftOut={g.leftOut}
      collapsed={closed}
      onToggle={() => onToggle(g.key)}
      testId={`group-${g.key}`}
    />
  );
  if (g.key !== 'later')
    return (
      <tbody data-group={g.key}>
        {head}
        {!closed && (
          <Rows rows={g.rows} no={no} start={0} today={today} rates={rates} onOpen={onOpen} />
        )}
      </tbody>
    );
  let start = 0;
  return (
    <>
      <tbody data-group={g.key}>{head}</tbody>
      {!closed &&
        g.weeks.map((w: PaymentWeek) => {
          const offset = start;
          start += w.rows.length;
          const weekClosed = collapsed.has(w.key);
          return (
            <tbody key={w.key} data-group="later-week">
              <HeadRow
                week
                title={w.title}
                sub={w.sub}
                sumCents={w.sumCents}
                leftOut={w.leftOut}
                collapsed={weekClosed}
                onToggle={() => onToggle(w.key)}
                testId={`week-${w.key}`}
              />
              {!weekClosed && (
                <Rows
                  rows={w.rows}
                  no={no}
                  start={offset}
                  today={today}
                  rates={rates}
                  onOpen={onOpen}
                />
              )}
            </tbody>
          );
        })}
    </>
  );
}

function Rows({
  rows,
  no,
  start,
  today,
  rates,
  onOpen,
}: {
  rows: Occurrence[];
  no: number;
  start: number;
  today: string;
  rates: Record<string, number>;
  onOpen: (paymentId: string) => void;
}) {
  useAmountPrivacy();
  const sources = useContext(PaymentSources);
  const selectedId = useContext(SelectedPayment);
  const byId = new Map(sources.map((payment) => [payment.id, payment]));
  return (
    <>
      {rows.map((o, i) => {
        const alert = needsAction(o, today);
        const eurValue = o.currency === 'EUR' ? null : eurOf(o.amountCents, o.currency, rates);
        const counterparty = o.payeeName ?? o.contactName;
        if (REDESIGN_ENABLED) {
          const payment = byId.get(o.paymentId);
          const interval = payment
            ? payment.rhythm === 'weekly'
              ? cadenceText(payment)
              : RHYTHM_LABEL[payment.rhythm]
            : '–';
          return (
            <tr
              key={o.occurrenceId}
              className={cx(
                'prow is-clickable',
                alert && 'is-alert',
                REDESIGN_ENABLED && o.paymentId === selectedId && 'is-selected',
              )}
            >
              <td className="col-name">
                <button
                  type="button"
                  className="prow-btn xp-name"
                  aria-pressed={selectedId ? o.paymentId === selectedId : undefined}
                  title={[counterparty, o.categoryName].filter(Boolean).join(' · ')}
                  onClick={() => onOpen(o.paymentId)}
                >
                  <strong>{o.name}</strong>
                  <Repeat size={14} aria-hidden="true" />
                </button>
              </td>
              <td className="col-interval" title={payment ? cadenceText(payment) : undefined}>
                {interval.charAt(0).toLocaleUpperCase('de-AT') + interval.slice(1)}
              </td>
              <td className="col-account">{o.accountName ?? 'ohne Konto'}</td>
              <td className="col-num" data-label="Betrag">
                {money(o.amountCents, o.currency, o.kind === 'inflow')}
                {eurValue !== null && (
                  <span className="xp-sub">≈ {eur(eurValue, { sign: o.kind === 'inflow' })}</span>
                )}
              </td>
              <td className="col-due" data-label="Fällig">
                {dayHeading(o.dueDate)}
                <span className="sr-only"> {longDay(o.dueDate)}</span>
              </td>
              <td className="col-state">
                <StatusStamp status={o.status} alert={alert} compact />
              </td>
              <td className="col-action">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={o.name + ' öffnen'}
                  onClick={() => onOpen(o.paymentId)}
                >
                  <Ellipsis size={18} aria-hidden="true" />
                </button>
              </td>
            </tr>
          );
        }
        return (
          <tr
            key={o.occurrenceId}
            className={cx(
              'prow is-clickable',
              alert && 'is-alert',
              REDESIGN_ENABLED && o.paymentId === selectedId && 'is-selected',
            )}
          >
            <td className="col-pos pos">
              {no}.{start + i + 1}
            </td>
            <td className="col-name">
              <button
                type="button"
                className="prow-btn xp-name"
                onClick={() => onOpen(o.paymentId)}
              >
                <strong>{o.name}</strong>
                <span className="xp-sub">
                  {[counterparty, o.accountName].filter(Boolean).join(' · ')}
                </span>
              </button>
            </td>
            <td className="col-due" data-label="Fällig">
              {dayHeading(o.dueDate)}
              <span className="sr-only"> {longDay(o.dueDate)}</span>
            </td>
            <td className="col-cat" data-label="Kategorie">
              <Chip occurrence={o} />
            </td>
            <td className="col-num" data-label="Betrag">
              {money(o.amountCents, o.currency, o.kind === 'inflow')}
              {eurValue !== null && (
                <span className="xp-sub">≈ {eur(eurValue, { sign: o.kind === 'inflow' })}</span>
              )}
            </td>
            <td className="col-state">
              <StatusStamp status={o.status} alert={alert} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

const CLASSES = new Set(['need', 'want', 'future']);

function Chip({ occurrence: o }: { occurrence: Occurrence }) {
  useAmountPrivacy();
  const label = o.kind === 'inflow' ? o.incomeTypeName : o.categoryName;
  if (!label) return <span className="xp-sub">–</span>;
  return (
    <span className="xp-chip">
      {o.kind === 'outflow' && o.categoryClass && CLASSES.has(o.categoryClass) && (
        <ClassSwatch kind={o.categoryClass as 'need' | 'want' | 'future'} />
      )}
      {label}
    </span>
  );
}

// ---------- Verträge und Abos / Alle ----------

function Contracts({
  payments,
  outflowsOnly,
  kind,
  rates,
  groupOf,
  categoryOf,
  onOpen,
  onCreate,
}: {
  payments: ExpectedPayment[];
  outflowsOnly: boolean;
  kind: KindFilter;
  rates: Record<string, number>;
  groupOf: (categoryId: string | null) => { id: string; name: string } | null;
  categoryOf: (categoryId: string | null) => { kind: string; class: string | null } | null;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  useAmountPrivacy();
  const [collapsed, toggle] = useCollapsed();
  const shown = payments.filter((p) =>
    outflowsOnly ? isContract(p.kind, categoryOf(p.categoryId)) : kind === 'all' || p.kind === kind,
  );
  const groups = useMemo(() => contractGroups(shown, groupOf, rates), [shown, groupOf, rates]);
  if (shown.length === 0)
    return (
      <EmptyNote
        action={
          <Button size="sm" variant="ghost" onClick={onCreate}>
            Wiederkehrende Zahlung anlegen
          </Button>
        }
      >
        Noch keine wiederkehrende Zahlung.
      </EmptyNote>
    );
  const monthly = groups.reduce((a, g) => a + g.monthlyCents, 0);
  const yearly = groups.reduce((a, g) => a + g.yearlyCents, 0);
  const title = outflowsOnly ? 'Verträge und Abos' : 'Alle wiederkehrenden Zahlungen';
  return (
    <section aria-labelledby="xp-contracts">
      <SectionHead
        id="xp-contracts"
        title={title}
        aside={
          <span className="xp-aside">
            {shown.length} Positionen · {eur(monthly, { sign: !outflowsOnly })} im Monat ·{' '}
            {eur(yearly, { cents: false, sign: !outflowsOnly })} im Jahr
          </span>
        }
      />
      <table className="ptable xp-table xp-contracts">
        <caption className="sr-only">
          {title} mit Monatsäquivalent und Jahressumme, nach Gruppe
        </caption>
        <thead>
          <tr>
            <th className="tech col-pos" scope="col">
              Pos.
            </th>
            <th className="tech col-name" scope="col">
              Zahlung
            </th>
            <th className="tech col-due" scope="col">
              Nächste Fälligkeit
            </th>
            <th className="tech col-num" scope="col">
              Je Monat
            </th>
            <th className="tech col-num" scope="col">
              Je Jahr
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <ContractRows
              key={g.key}
              group={g}
              no={gi + 1}
              rates={rates}
              collapsed={collapsed.has(g.key)}
              onToggle={() => toggle(g.key)}
              onOpen={onOpen}
            />
          ))}
        </tbody>
      </table>
      {groups.some((g) => g.leftOut > 0) && (
        <p className="xp-note">
          Zahlungen in Fremdwährung ohne bekannten Kurs stehen nicht in den Summen.
        </p>
      )}
    </section>
  );
}

function ContractRows({
  group: g,
  no,
  rates,
  collapsed,
  onToggle,
  onOpen,
}: {
  group: ContractGroup;
  no: number;
  rates: Record<string, number>;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
}) {
  useAmountPrivacy();
  const inflow = g.key === 'income';
  return (
    <>
      <tr className={cx('pgroup', collapsed && 'is-collapsed')}>
        <td className="col-pos">
          <CircleNumber n={no} size="sm" />
        </td>
        <td className="col-name" colSpan={2}>
          <button
            type="button"
            className="grp-toggle"
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="grp-title">{g.title}</span>
            <span className="grp-sub">{g.rows.length} Positionen</span>
          </button>
        </td>
        <td className="col-num col-month" data-label="Je Monat">
          {eur(g.monthlyCents, { sign: inflow })}
        </td>
        <td className="col-num col-year" data-label="Je Jahr">
          {eur(g.yearlyCents, { cents: false, sign: inflow })}
        </td>
      </tr>
      {!collapsed &&
        g.rows.map((p, i) => {
          const currency = p.version?.currency ?? 'EUR';
          const monthly =
            p.monthlyEquivalentCents === null
              ? null
              : eurOf(p.monthlyEquivalentCents, currency, rates);
          const yearly =
            p.yearlyEquivalentCents === null
              ? null
              : eurOf(p.yearlyEquivalentCents, currency, rates);
          const sign = p.kind === 'inflow';
          return (
            <tr key={p.id} className="prow is-clickable">
              <td className="col-pos pos">
                {no}.{i + 1}
              </td>
              <td className="col-name">
                <button type="button" className="prow-btn xp-name" onClick={() => onOpen(p.id)}>
                  <strong>{p.name}</strong>
                  <span className="xp-sub">{cadenceText(p)}</span>
                </button>
              </td>
              <td className="col-due" data-label="Nächste Fälligkeit">
                {p.nextDueDate ? longDay(p.nextDueDate) : <span className="xp-sub">beendet</span>}
              </td>
              <td className="col-num col-month" data-label="Je Monat">
                {monthly === null ? '–' : eur(monthly, { sign })}
                {currency !== 'EUR' && p.amountCents !== null && (
                  <span className="xp-sub">
                    {money(Math.abs(p.amountCents), currency)} je Zahlung
                  </span>
                )}
              </td>
              <td className="col-num col-year" data-label="Je Jahr">
                {yearly === null ? '–' : eur(yearly, { cents: false, sign })}
              </td>
            </tr>
          );
        })}
    </>
  );
}
