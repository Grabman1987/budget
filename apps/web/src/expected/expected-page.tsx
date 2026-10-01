import { addDays, todayInVienna } from '@budget/domain';
import { Button, CircleNumber, ClassSwatch, Segmented, SectionHead, cx } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { ChevronDown, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { eur, dayHeading, longDay } from '../ledger/format';
import { lookupsQuery } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { PLAN_ERWARTET } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { useMonth } from '../shell/use-month';
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
  contractGroups,
  isContract,
  money,
  needsAction,
  weekGroups,
  type ContractGroup,
  type WeekGroup,
} from './expected-model';
import { IncomeButton, IncomePanel } from './income-panel';
import { draftFromBooking } from './payment-draft';
import { PaymentPanel, type PaymentPanelState } from './payment-panel';
import { StatusStamp } from './status-stamp';

type View = 'next' | 'contracts' | 'all';
type KindFilter = 'all' | 'inflow' | 'outflow';

const VIEWS = [
  { value: 'next', label: 'Nächste 90 Tage' },
  { value: 'contracts', label: 'Verträge und Abos' },
  { value: 'all', label: 'Alle' },
] as const;
const KINDS = [
  { value: 'all', label: 'Alle' },
  { value: 'inflow', label: 'Einnahmen' },
  { value: 'outflow', label: 'Ausgaben' },
] as const;
const HORIZON_DAYS = 90;

/**
 * Plan › Erwartet: what is about to be paid or received. The next 90 days by week, the parts list
 * of contracts and subscriptions (monthly equivalent and yearly sum), and one side panel per
 * payment with its versions, occurrences and fields. Figures come from `/api/expected`.
 */
export function ExpectedPage() {
  const [month] = useMonth();
  const today = todayInVienna();
  const [view, setView] = useState<View>('next');
  const [kind, setKind] = useState<KindFilter>('all');
  const [panel, setPanel] = useState<PaymentPanelState>(null);
  const [incomeOpen, setIncomeOpen] = useState(false);

  // Plan the occurrences and match bookings once when the page opens (idempotent; the P4 worker
  // does the same later). The lists wait for it, so they never flash empty.
  const refresh = useQuery({
    queryKey: ['expected-refresh'],
    queryFn: refreshExpected,
    staleTime: 300_000,
    retry: false,
  });
  const ready = !refresh.isPending;

  const from = addDays(today, -31);
  const to = addDays(today, HORIZON_DAYS);
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

  // "Als erwartete Zahlung anlegen" on a booking brings the booking along in the history state.
  const fromBooking = useLocation({ select: (l) => l.state.expectedFrom });
  const navigate = useNavigate();
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
    <PageFrame
      meta={PLAN_ERWARTET}
      income={
        <IncomeButton
          value={income.data ? `${eur(income.data.expectedCents)} erwartet` : '–'}
          onOpen={() => setIncomeOpen(true)}
        />
      }
    >
      <div className="xp">
        <div className="xp-toolbar">
          <Segmented label="Ansicht" options={VIEWS} value={view} onChange={setView} />
          {view !== 'contracts' && (
            <Segmented
              label="Einnahmen oder Ausgaben"
              options={KINDS}
              value={kind}
              onChange={setKind}
            />
          )}
          <span className="xp-spacer" />
          <Button size="sm" variant="ghost" onClick={() => setPanel({ mode: 'create' })}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Erwartete Zahlung
          </Button>
        </div>
        {pending && <LoadingNote what="Erwartete Zahlungen" />}
        {error && (
          <ErrorNote
            what="Erwartete Zahlungen"
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
            rates={rates}
            onOpen={(id) => setPanel({ mode: 'view', id })}
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
            onOpen={(id) => setPanel({ mode: 'view', id })}
            onCreate={() => setPanel({ mode: 'create' })}
          />
        )}
      </div>
      <PaymentPanel state={panel} onClose={() => setPanel(null)} />
      <IncomePanel month={month} open={incomeOpen} onClose={() => setIncomeOpen(false)} />
    </PageFrame>
  );
}

// ---------- Nächste 90 Tage ----------

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
  rates,
  onOpen,
  onCreate,
}: {
  rows: Occurrence[];
  today: string;
  kind: KindFilter;
  rates: Record<string, number>;
  onOpen: (paymentId: string) => void;
  onCreate: () => void;
}) {
  const [collapsed, toggle] = useCollapsed();
  const groups = useMemo(
    () =>
      weekGroups(
        rows.filter((r) => kind === 'all' || r.kind === kind),
        today,
        rates,
      ),
    [rows, today, kind, rates],
  );
  if (groups.length === 0)
    return (
      <EmptyNote
        action={
          <Button size="sm" variant="ghost" onClick={onCreate}>
            Erwartete Zahlung anlegen
          </Button>
        }
      >
        In den nächsten 90 Tagen ist nichts fällig.
      </EmptyNote>
    );
  const sum = groups.reduce((a, g) => a + g.sumCents, 0);
  return (
    <section aria-labelledby="xp-next">
      <SectionHead
        id="xp-next"
        title="Nächste 90 Tage"
        aside={
          <span className="xp-aside">
            {groups.reduce((a, g) => a + g.rows.length, 0)} Fälligkeiten ·{' '}
            {eur(sum, { sign: true })}
          </span>
        }
      />
      <table className="ptable xp-table xp-next">
        <caption className="sr-only">
          Fällige und erwartete Zahlungen der nächsten 90 Tage, nach Woche
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
              Fällig
            </th>
            <th className="tech col-cat" scope="col">
              Kategorie
            </th>
            <th className="tech col-num" scope="col">
              Betrag
            </th>
            <th className="tech col-state" scope="col">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <WeekRows
              key={g.key}
              group={g}
              no={gi + 1}
              today={today}
              rates={rates}
              collapsed={collapsed.has(g.key)}
              onToggle={() => toggle(g.key)}
              onOpen={onOpen}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function WeekRows({
  group: g,
  no,
  today,
  rates,
  collapsed,
  onToggle,
  onOpen,
}: {
  group: WeekGroup;
  no: number;
  today: string;
  rates: Record<string, number>;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (paymentId: string) => void;
}) {
  return (
    <>
      <tr className={cx('pgroup', collapsed && 'is-collapsed')} data-testid={`week-${g.key}`}>
        <td className="col-pos">
          <CircleNumber n={no} size="sm" />
        </td>
        <td className="col-name" colSpan={3}>
          <button
            type="button"
            className="grp-toggle"
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="grp-title">{g.title}</span>
            <span className="grp-sub">{g.sub}</span>
          </button>
        </td>
        <td className="col-num" data-label="Summe">
          {eur(g.sumCents, { sign: true })}
          {g.leftOut > 0 && <span className="xp-sub"> ohne Fremdwährung</span>}
        </td>
        <td className="col-state" />
      </tr>
      {!collapsed &&
        g.rows.map((o, i) => {
          const alert = needsAction(o, today);
          const eurValue = o.currency === 'EUR' ? null : eurOf(o.amountCents, o.currency, rates);
          const counterparty = o.payeeName ?? o.contactName;
          return (
            <tr key={o.occurrenceId} className={cx('prow is-clickable', alert && 'is-alert')}>
              <td className="col-pos pos">
                {no}.{i + 1}
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
            Erwartete Zahlung anlegen
          </Button>
        }
      >
        Noch keine erwartete Zahlung.
      </EmptyNote>
    );
  const monthly = groups.reduce((a, g) => a + g.monthlyCents, 0);
  const yearly = groups.reduce((a, g) => a + g.yearlyCents, 0);
  const title = outflowsOnly ? 'Verträge und Abos' : 'Alle erwarteten Zahlungen';
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
