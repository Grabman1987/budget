import { cents, lastDayOfMonth } from '@budget/domain';
import { useState, type ReactNode } from 'react';
import type { CategoryClass } from './api';
import {
  BudgetStateMark,
  maskMoneyText,
  useAmountPrivacy,
  type BudgetPresentationState,
  type DimensionChainTerm,
} from '@budget/ui';
import { CircleAlert } from 'lucide-react';
import { planRows, splitState } from './plan-model';
import type { BudgetMonthView } from './budget-api';
import { eur } from '../ledger/format';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import type { EnvelopeSummary, MonthSummary } from './budget-api';

/** The existing Plan derivation, shared by the open lead and the compact disclosure. */
export function planMonthTerms(s: MonthSummary, onIncome: () => void): DimensionChainTerm[] {
  return [
    { label: 'Übertrag', value: cents(s.carryInCents) },
    { label: 'Einnahmen', value: cents(s.incomeCents), op: '+', onSelect: onIncome },
    ...(s.uncoveredCents !== 0
      ? [{ label: 'Ungedeckt', value: cents(s.uncoveredCents), op: '-' as const }]
      : []),
    { label: 'Zugewiesen', value: cents(s.assignedCents), op: '-' },
    ...(s.heldCents !== 0
      ? [{ label: 'Gehalten', value: cents(s.heldCents), op: '-' as const }]
      : []),
    { label: 'Zu verteilen', value: cents(s.toBeAssignedCents), op: '=' },
  ];
}

/** Presentation only: the API already resolves the target's carry/refill/rhythm/month. */
export function planRowState(row: EnvelopeSummary): {
  state: BudgetPresentationState;
  label: string;
} {
  if (row.overspentCents > 0)
    return {
      state: 'overspent',
      label:
        row.creditOverspentCents > 0 && row.cashOverspentCents === 0
          ? 'Neue Kartenschuld'
          : 'Überzogen',
    };
  if (row.needCents > 0) return { state: 'open', label: 'Offen' };
  if (row.target && row.assignedCents > row.goalCents)
    return { state: 'overfunded', label: 'Mehr als Ziel' };
  if (row.target && row.goalCents > 0) return { state: 'met', label: 'Ziel erfüllt' };
  return row.availableCents > 0
    ? { state: 'met', label: 'Verfügbar' }
    : { state: 'neutral', label: 'Kein verfügbares Geld' };
}

export function PlanRowState({ row }: { row: EnvelopeSummary }) {
  const { state, label } = planRowState(row);
  return (
    <span className="plan-row-state">
      {state === 'overspent' && label !== 'Neue Kartenschuld' ? (
        <span className="budget-state budget-state-overspent">
          <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
          {label}
        </span>
      ) : (
        <BudgetStateMark state={state}>{label}</BudgetStateMark>
      )}
    </span>
  );
}

export function PlanMonthLead({
  summary,
  data,
  controls,
}: {
  summary: MonthSummary;
  data: BudgetMonthView;
  controls: ReactNode;
}) {
  useAmountPrivacy();
  return (
    <div className="plan-month-lead">
      <p className="plan-month-scope">Monatszuweisung · {monthLabel(summary.month)}</p>
      <div className="plan-lead-controls plan-chip-scroll">{controls}</div>
      <PlanClassLead data={data} />
    </div>
  );
}

/** The same assignment classes and income denominator as the existing 50/30/20 inspector. */
function PlanClassLead({ data }: { data: BudgetMonthView }) {
  const rows = planRows(data);
  const state = splitState(data.summary, rows);
  const classes = [
    ['need', 'Bedarf', 50],
    ['want', 'Wunsch', 30],
    ['future', 'Zukunft', 20],
  ] as const;
  const amounts = { need: 0, want: 0, future: 0 };
  for (const row of rows) if (row.cls) amounts[row.cls] += Math.max(0, row.assignedCents);
  const total = amounts.need + amounts.want + amounts.future;
  const [open, setOpen] = useState<CategoryClass | null>(null);
  const openClass = classes.find(([key]) => key === open);
  return (
    <div className="plan-class-lead" role="group" aria-label="Zuweisungen nach Klasse">
      {classes.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className="plan-class-cell"
          aria-expanded={open === key}
          aria-controls="plan-class-detail"
          title={`${label}: Kategorien anzeigen`}
          onClick={() => setOpen(open === key ? null : key)}
        >
          <span>{label}</span>
          <strong>{eur(amounts[key])}</strong>
        </button>
      ))}
      <div className="plan-class-strip" aria-hidden="true">
        {classes.map(([key]) => (
          <i
            key={key}
            data-class={key}
            style={{ width: total > 0 ? (amounts[key] / total) * 100 + '%' : '0%' }}
          />
        ))}
      </div>
      {classes.map(([key, , target]) => (
        <small key={key}>
          {state.kind === 'shares'
            ? `${maskMoneyText(state[key] + ' %')} (Ziel ${target} %)`
            : state.kind === 'no-income'
              ? 'Ohne Einnahmen'
              : 'Noch nichts zugewiesen'}
        </small>
      ))}
      {openClass && (
        <PlanClassDetail
          label={openClass[1]}
          target={openClass[2]}
          incomeCents={data.summary.incomeCents}
          rows={rows.filter((r) => r.cls === openClass[0])}
        />
      )}
    </div>
  );
}

/** Which categories make up one class share: assignment, spending and the gap to the income target. */
export function PlanClassDetail({
  label,
  target,
  incomeCents,
  rows,
}: {
  label: string;
  target: number;
  incomeCents: number;
  rows: ReadonlyArray<{ id: string; name: string; assignedCents: number; activityCents: number }>;
}) {
  const shown = rows
    .filter((r) => r.assignedCents !== 0 || r.activityCents !== 0)
    .sort((a, b) => b.assignedCents - a.assignedCents || a.activityCents - b.activityCents);
  const assigned = rows.reduce((sum, r) => sum + Math.max(0, r.assignedCents), 0);
  const goal = incomeCents > 0 ? Math.round((incomeCents * target) / 100) : null;
  const pct = (c: number) =>
    incomeCents > 0 ? maskMoneyText(Math.round((c / incomeCents) * 100) + ' %') : '–';
  return (
    <section id="plan-class-detail" className="plan-class-detail" aria-label={`${label} im Detail`}>
      <p>
        {goal === null
          ? `${label}: ${eur(assigned)} zugewiesen, ohne Einnahmen kein Zielwert.`
          : assigned > goal
            ? `${label}: ${eur(assigned - goal)} über dem Ziel von ${eur(goal)} (${target} % der Einnahmen).`
            : `${label}: noch ${eur(goal - assigned)} bis zum Ziel von ${eur(goal)} (${target} % der Einnahmen).`}
      </p>
      {shown.length === 0 ? (
        <p>Keine Kategorie in dieser Klasse hat diesen Monat Geld.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Kategorie</th>
              <th scope="col">Zugewiesen</th>
              <th scope="col">Anteil</th>
              <th scope="col">Aktivität</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                <td>{eur(r.assignedCents)}</td>
                <td>{pct(Math.max(0, r.assignedCents))}</td>
                <td>{eur(r.activityCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Same read-only amounts and destinations as the legacy head disclosure. */
export function PlanUnclassifiedReadout({
  summary: s,
  month,
  menu = false,
}: {
  summary: MonthSummary;
  month: string;
  menu?: boolean;
}) {
  useAmountPrivacy();
  return (
    <>
      <p>
        Eingang {eur(s.unclassified?.inflowCents ?? 0)} · Ausgang{' '}
        {eur(-(s.unclassified?.outflowCents ?? 0))} · Saldo {eur(s.unclassified?.netCents ?? 0)}
      </p>
      <AppLink
        className={menu ? 'plan-menu-item' : undefined}
        to="/konten/buchungen"
        search={{ kategorie: 'none', von: `${month}-01`, bis: lastDayOfMonth(month) }}
      >
        Ohne Kategorie öffnen
      </AppLink>
      <AppLink
        className={menu ? 'plan-menu-item' : undefined}
        to="/konten/buchungen"
        search={{ status: 'pending', von: `${month}-01`, bis: lastDayOfMonth(month) }}
      >
        Unbestätigte öffnen
      </AppLink>
    </>
  );
}

export function PlanReadUtilities({
  summary,
  month,
  unfunded,
  onUnderfunded,
}: {
  summary: MonthSummary;
  month: string;
  unfunded: number;
  onUnderfunded: () => void;
}) {
  useAmountPrivacy();
  return (
    <div role="group" aria-label="Monatsdetails" className="plan-menu-group plan-read-utilities">
      <button
        type="button"
        className="plan-menu-item"
        onClick={onUnderfunded}
        title="Summe der fehlenden Zielbeträge"
      >
        Unterfinanziert {eur(unfunded)}
      </button>
      <p title="Buchungen mit vorgemerktem Status oder mindestens einem Anteil ohne Kategorie. Jede Buchung wird einmal gezählt.">
        {summary.unclassified?.count ?? 0} vorgemerkt / ohne Kategorie
      </p>
      <PlanUnclassifiedReadout summary={summary} month={month} menu />
    </div>
  );
}
