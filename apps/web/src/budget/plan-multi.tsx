import { useAmountPrivacy, ClassSwatch, cx } from '@budget/ui';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { currentMonth } from '../shell/use-month';
import { eur } from '../ledger/format';
import { AssignCell } from './assign-cell';
import { assign, type BudgetMonthView } from './budget-api';
import { CategoryIcon } from './category-icon';
import { AppLink } from '../shell/app-link';
import {
  CLASS_TEXT,
  groupStatus,
  isCashOver,
  monthCells,
  type MultiGroup,
  type PlanRow,
} from './plan-model';
import { useBudgetWrite } from './use-category-writes';

const monthName = new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('de-AT', { month: 'short' });
const dateOf = (month: string) =>
  new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);

/**
 * The parts list for two or three months side by side (Actual Budget style): one shared category
 * column, then Zugewiesen, Aktivität and Verfügbar per month. Each month head carries that month's
 * "Zu verteilen"; assigning works in every month and the assignment guard checks the figure of
 * the month being edited. Layout is the "Gruppen" view; the other orderings show one month.
 */
export function MultiTable({
  months,
  views,
  groups,
  collapsed,
  onToggle,
  onOpen,
}: {
  months: string[];
  views: BudgetMonthView[];
  groups: MultiGroup[];
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onOpen: (id: string, month: string) => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  /** The cell being edited: month and envelope. */
  const [editing, setEditing] = useState<{ month: string; id: string } | null>(null);
  const now = currentMonth();
  const setAssigned = (month: string, r: PlanRow, value: number) =>
    value !== r.assignedCents &&
    void write(
      () => assign(month, [{ categoryId: r.id, assignedCents: value }]),
      () =>
        `${r.name} (${monthShort.format(dateOf(month))}): ${eur(r.assignedCents)} → ${eur(value)} zugewiesen`,
    );
  return (
    <div className="pmulti-scroll">
      <table className={cx('ptable ptable-multi', `has-${months.length}`)}>
        <caption className="sr-only">
          Envelopes mit Zugewiesen, Aktivität und Verfügbar für {months.length} Monate
        </caption>
        <thead>
          <tr>
            <th className="tech col-pos" scope="col" rowSpan={2}>
              Pos.
            </th>
            <th className="tech col-name" scope="col" rowSpan={2}>
              Kategorie
            </th>
            {months.map((m, i) => {
              const tba = views[i]!.summary.toBeAssignedCents;
              return (
                <th
                  key={m}
                  scope="colgroup"
                  colSpan={3}
                  className={cx('pm-head', i === 0 && 'is-first', m === now && 'is-now')}
                >
                  <span className="pm-month">{monthName.format(dateOf(m))}</span>
                  <span className={cx('pm-tba', tba < 0 && 'is-over', tba === 0 && 'is-zero')}>
                    Zu verteilen <b data-testid={`tba-${m}`}>{eur(tba)}</b>
                  </span>
                </th>
              );
            })}
          </tr>
          <tr className="pm-cols">
            {months.map((m, i) =>
              ['Zugewiesen', 'Aktivität', 'Verfügbar'].map((label, c) => (
                <th
                  key={`${m}-${label}`}
                  scope="col"
                  className={cx('tech col-num', c === 0 && 'pm-first', i === 0 && 'is-first')}
                >
                  {label}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
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
                    onClick={() => onToggle(g.key)}
                  >
                    <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="grp-text">
                      <span className="grp-title">{g.title}</span>
                    </span>
                  </button>
                </td>
                {months.map((m, i) => {
                  const st = groupStatus(monthCells(g.rows, i));
                  return [
                    <td key={`${m}-a`} className="col-num pm-first">
                      {eur(st.assigned)}
                    </td>,
                    <td key={`${m}-b`} className="col-num">
                      {eur(st.activity)}
                    </td>,
                    <td key={`${m}-c`} className="col-num">
                      {eur(st.available)}
                    </td>,
                  ];
                })}
              </tr>,
              ...(isCollapsed
                ? []
                : g.rows.map((r, n) => (
                    <tr key={r.id} className="prow">
                      <td className="col-pos">
                        <span className="pos">{`${g.no}.${n + 1}`}</span>
                      </td>
                      <td className="col-name">
                        <AppLink
                          className="pname"
                          to={`/plan/monat/envelope/${encodeURIComponent(r.id)}`}
                          search={{ monat: months[0] }}
                          state={{ planDetailOpenedInApp: true }}
                        >
                          {r.cls ? <ClassSwatch kind={r.cls} /> : <ClassSwatch kind="bound" />}
                          <CategoryIcon icon={r.icon} />
                          {r.name}
                          {r.cls && <span className="env-class">{CLASS_TEXT[r.cls]}</span>}
                        </AppLink>
                      </td>
                      {months.map((m, i) => {
                        const cell = r.cells[i];
                        if (!cell)
                          return [
                            <td key={`${m}-a`} className="col-num pm-first pm-none" colSpan={3}>
                              <span className="muted">ausgeblendet</span>
                            </td>,
                          ];
                        const cash = isCashOver(cell);
                        const credit = !cash && cell.creditOverspentCents > 0;
                        return [
                          <td
                            key={`${m}-a`}
                            className="col-num col-assign pm-first"
                            data-label="Zugewiesen"
                          >
                            <AssignCell
                              row={cell}
                              tba={views[i]!.summary.toBeAssignedCents}
                              monthKey={m}
                              editing={editing?.month === m && editing.id === r.id}
                              onEdit={(on) => setEditing(on ? { month: m, id: r.id } : null)}
                              onCommit={(v) => {
                                setEditing(null);
                                setAssigned(m, cell, v);
                              }}
                            />
                          </td>,
                          <td key={`${m}-b`} className="col-num col-act" data-label="Aktivität">
                            {cell.activityCents ? (
                              eur(cell.activityCents)
                            ) : (
                              <span className="muted">{eur(0)}</span>
                            )}
                          </td>,
                          <td key={`${m}-c`} className="col-num col-avail" data-label="Verfügbar">
                            <span
                              className={cx(
                                'pill',
                                cash
                                  ? 'is-bad'
                                  : credit
                                    ? 'is-debt'
                                    : cell.availableCents > 0 && 'is-good',
                              )}
                              title={credit ? 'neue Kartenschuld' : undefined}
                            >
                              {eur(cell.availableCents)}
                            </span>
                            {cell.overspentCents > 0 && (
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                aria-label={`${r.name}: Decken im ${monthName.format(dateOf(m))}`}
                                onClick={() => onOpen(r.id, m)}
                              >
                                Decken
                              </button>
                            )}
                          </td>,
                        ];
                      })}
                    </tr>
                  ))),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
