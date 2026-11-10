import { useAmountPrivacy, cx, type SwatchKind } from '@budget/ui';
import { InlineBookingCell } from './inline-booking-cell';
import type { BookingPatch } from './api';
import { keepSplit } from './booking-model';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, Info, Pencil } from 'lucide-react';
import { Fragment, useId, useState, type ReactNode } from 'react';
import { CategoryCell, PayeeCell, StatusCell, useCategoryClasses } from './booking-cells';
import { BookingLegend } from './booking-legend';
import {
  dayHeading,
  nativeCurrency,
  valuedCurrency,
  shortDay,
  upcomingDate,
  monthName,
} from './format';
import { ScheduledRegisterRow } from './scheduled-register-row';
import {
  upcomingEntries,
  upcomingSummary,
  type UpcomingEntry,
  type UpcomingModel,
} from './upcoming-register';
import { flashRows, useFlashing } from './flash';
import { useLedgerWrites } from './mutations';
import { lookupsQuery } from './queries';
import type { BookingSort, ListedBooking } from './types';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import './register-redesign.css';
import { BookingInspector } from './booking-inspector';
import type { RegisterMonth, RegisterMonthsKind } from '@budget/domain';
import { categoryNetLabel, registerAmount } from './register-summary';

export interface Selection {
  selected: ReadonlySet<string>;
  disabled?: boolean;
  /** Explicit phone selection mode; metadata stays read-only while choosing rows. */
  mode?: boolean;
  toggle: (id: string) => void;
  toggleAll: (ids: string[]) => void;
}

export interface BookingTableProps {
  monthlyTotals?: readonly RegisterMonth[] | undefined;
  monthlyTotalsPending?: boolean | undefined;
  monthlyKind?: RegisterMonthsKind | undefined;
  items: ReadonlyArray<ListedBooking>;
  caption: string;
  /** Alle Buchungen: account column, day groups with day sums. Einzelkonto: running balance. */
  variant: 'account' | 'all';
  onOpen: (booking: ListedBooking) => void;
  selection?: Selection;
  sort?: { key: BookingSort; direction: 'asc' | 'desc'; onSort: (key: BookingSort) => void };
  /** The "Kommend" section: future captures and next occurrences above the history, same columns. */
  upcoming?: UpcomingModel | null;
  showTodayBalance?: boolean;
  /** Alle Buchungen may show a Saldo column only for an explicit single account. */
  showRunningBalance?: boolean;
  /** Overdraft limit of a single checking account; shown in brackets behind the balance. */
  overdraftLimitCents?: number | null;
}

const canEditCategory = (b: ListedBooking) =>
  !b.transferId && b.splits.length === 1 && b.status !== 'reconciled';

/**
 * Booking table shared by Einzelkonto and Alle Buchungen: the payee opens the booking, the
 * category is changed in place, new and changed rows flash once. Account history uses compact
 * two-line phone rows; Alle Buchungen retains its existing layout.
 */
export function BookingTable({
  items,
  caption,
  variant,
  onOpen,
  selection,
  sort,
  upcoming,
  showTodayBalance = true,
  showRunningBalance = false,
  overdraftLimitCents = null,
  monthlyTotals,
  monthlyTotalsPending,
  monthlyKind,
}: BookingTableProps) {
  useAmountPrivacy();
  // Mount the responsive overlay on first use, then retain it for native close/focus return.
  const [inspected, setInspected] = useState<ListedBooking | null>();
  const classes = useCategoryClasses();
  const writes = useLedgerWrites();
  const lookups = useQuery(lookupsQuery());
  const setCategory = (b: ListedBooking, categoryId: string | null) => {
    if (selection?.disabled || selection?.mode) return;
    if ((b.splits[0]?.categoryId ?? null) === categoryId) return;
    writes.patch.mutate({
      id: b.id,
      patch: { splits: [keepSplit(b.splits[0], categoryId, b.amountCents)] },
    });
  };
  const all = variant === 'all';
  const sectionId = useId();
  const showUpcoming = upcoming?.open === true && upcoming.count > 0;
  // Retain the projected-row balance marker when Kommend is open. Historical All rows
  // show a balance value only for an explicit single account.
  const runColumn = !all || showRunningBalance || showUpcoming;
  const dispo = REDESIGN_ENABLED && overdraftLimitCents ? overdraftLimitCents : null;
  const columns =
    (selection ? 1 : 0) + 6 + (runColumn ? 1 : 0) + (REDESIGN_ENABLED ? (all ? 2 : 1) : 0);
  const head = (label: string, key?: BookingSort, numeric = false): ReactNode => (
    <th
      className={cx('tech', numeric && 'kc-num', key === 'date' && 'kc-date')}
      scope="col"
      aria-sort={
        sort && key && sort.key === key
          ? sort.direction === 'asc'
            ? 'ascending'
            : 'descending'
          : undefined
      }
    >
      {sort && key ? (
        <button type="button" className="ksort" onClick={() => sort.onSort(key)}>
          {label}
          {sort.key === key &&
            (sort.direction === 'asc' ? (
              <ArrowUp size={16} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ArrowDown size={16} strokeWidth={1.75} aria-hidden="true" />
            ))}
        </button>
      ) : (
        label
      )}
    </th>
  );

  const entries = upcoming ? upcomingEntries(upcoming) : [];
  const groups = groupByDay(items);
  // Same native-currency day sums as the OFF day headings, retained in the ON legend.
  const dayTotal = (group: (typeof groups)[number]) =>
    [...new Set(group.items.map((b) => b.currency))]
      .map((currency) =>
        nativeCurrency(
          group.items
            .filter((b) => b.currency === currency)
            .reduce((sum, b) => sum + b.amountCents, 0),
          currency,
          true,
        ),
      )
      .join(' · ');
  const groupRows = (group: (typeof groups)[number]) => (
    <>
      {REDESIGN_ENABLED &&
        (groups.indexOf(group) === 0 ||
          groups[groups.indexOf(group) - 1]?.day.slice(0, 7) !== group.day.slice(0, 7)) && (
          <tr className={`kmonth${all ? ' kmonth-totals' : ''}`}>
            <th scope="rowgroup" colSpan={columns}>
              <span>
                {monthName(group.day)} {group.day.slice(0, 4)}
              </span>
              {all && (
                <span className="kmonth-sums">
                  {monthlyTotalsPending ? (
                    'Summen werden aktualisiert …'
                  ) : (
                    <MonthSums
                      row={monthlyTotals?.find((row) => row.month === group.day.slice(0, 7))}
                      kind={monthlyKind}
                    />
                  )}
                </span>
              )}
            </th>
          </tr>
        )}
      {all && !REDESIGN_ENABLED && (
        <tr className="kday">
          <td colSpan={columns}>
            <span className="tech">{dayHeading(group.day)}</span>
            <span className="kday-sum">{dayTotal(group)}</span>
          </td>
        </tr>
      )}
      {!all && !REDESIGN_ENABLED && (
        <tr className="kaccount-day" data-day={group.day}>
          <th scope="rowgroup" colSpan={columns}>
            <span>{dayHeading(group.day)}</span>
            <span>
              Saldo{' '}
              {group.items[0]?.balanceAfterCents == null
                ? '–'
                : valuedCurrency(
                    group.items[0].balanceAfterCents,
                    group.items[0].currency,
                    group.items[0].balanceValuation,
                  )}
            </span>
          </th>
        </tr>
      )}
      {REDESIGN_ENABLED && (
        <tr className="kregister-day" data-day={group.day}>
          <th scope="rowgroup" colSpan={columns}>
            {dayHeading(group.day)}
          </th>
        </tr>
      )}
      {group.items.map((b) => (
        <Row
          key={b.id}
          booking={b}
          variant={variant}
          classes={classes}
          runColumn={runColumn}
          dispoCents={dispo}
          showRunningBalance={showRunningBalance}
          {...(selection ? { selection } : {})}
          onOpen={onOpen}
          onInspect={setInspected}
          categories={lookups.data?.categories ?? []}
          groups={lookups.data?.groups ?? []}
          onCategory={setCategory}
          onPatch={(patch) =>
            selection?.disabled || selection?.mode
              ? Promise.reject(new Error('Bitte die laufende Auswahl zuerst beenden.'))
              : writes.patch.mutateAsync({ id: b.id, patch })
          }
          busy={writes.patch.isPending}
        />
      ))}
    </>
  );
  return (
    <>
      {REDESIGN_ENABLED && (
        <div className="redesign-register-toolbar">
          {upcoming && upcoming.count > 0 && (
            <button
              type="button"
              className="kupcoming-toggle"
              aria-expanded={upcoming.open}
              aria-controls={sectionId}
              onClick={upcoming.toggle}
            >
              <ChevronDown size={16} aria-hidden="true" />
              <strong>Kommend</strong>
              <span>{upcomingSummary(upcoming.count, entries[0])}</span>
            </button>
          )}
          <BookingLegend
            compact
            context={
              <>
                {upcoming && showTodayBalance && (
                  <p data-testid="register-today">Heute · Saldo {upcoming.balanceLabel}</p>
                )}
                {all && (
                  <details className="register-day-totals">
                    <summary>Tagessummen</summary>
                    <dl>
                      {groups.map((group) => (
                        <div key={group.day}>
                          <dt>{dayHeading(group.day)}</dt>
                          <dd>{dayTotal(group)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </>
            }
          />
        </div>
      )}
      <div className="kbooking-tools" data-selection-mode={selection?.mode ? '1' : undefined}>
        {!REDESIGN_ENABLED && <BookingLegend />}
        {selection && (
          // The table head is hidden on the phone, so select-all is offered here as well.
          <label className="kselect-all">
            <input
              type="checkbox"
              checked={items.length > 0 && items.every((b) => selection.selected.has(b.id))}
              disabled={selection.disabled}
              onChange={() => selection.toggleAll(items.map((b) => b.id))}
            />
            Alle sichtbaren auswählen
          </label>
        )}
      </div>
      <table
        className={cx(
          'ktable ktx',
          all ? 'ktx-all' : 'ktx-account',
          REDESIGN_ENABLED && 'ktx-redesign',
          runColumn && 'has-running-balance',
        )}
      >
        <caption className="sr-only">{caption}</caption>
        {(!all || REDESIGN_ENABLED) && (
          <colgroup>
            {selection && <col className="kcol-select" />}
            <col className="kcol-date" />
            <col />
            {all && <col className="kcol-account" />}
            {!REDESIGN_ENABLED && <col className="kcol-note" />}
            <col className="kcol-category" />
            {REDESIGN_ENABLED && <col className="kcol-note" />}
            {REDESIGN_ENABLED && <col className="kcol-money" />}
            <col className="kcol-money" />
            {runColumn && (
              <col className={cx('kcol-money', 'kcol-run', dispo !== null && 'has-dispo')} />
            )}
            <col className="kcol-status" />
          </colgroup>
        )}
        <thead>
          <tr>
            {selection && (
              <th className="kc-check" scope="col">
                <input
                  type="checkbox"
                  aria-label="Alle sichtbaren Buchungen auswählen"
                  checked={items.length > 0 && items.every((b) => selection.selected.has(b.id))}
                  disabled={selection.disabled}
                  onChange={() => selection.toggleAll(items.map((b) => b.id))}
                />
              </th>
            )}
            {head('Datum', 'date')}
            {head('Empfänger', 'payee')}
            {all && head('Konto', 'account')}
            {!all && !REDESIGN_ENABLED && (
              <th className="tech kx-note" scope="col">
                Notiz
              </th>
            )}
            {head('Kategorie')}
            {REDESIGN_ENABLED && (
              <th className="tech kx-note" scope="col">
                Notiz
              </th>
            )}
            {head(REDESIGN_ENABLED ? 'Ausgang' : 'Betrag', 'amount', true)}
            {REDESIGN_ENABLED && head('Eingang', undefined, true)}
            {runColumn && head('Saldo', undefined, true)}
            <th scope="col" className="kc-status">
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        {upcoming && (
          <>
            <tbody className="kupcoming" id={sectionId}>
              {!REDESIGN_ENABLED && (
                <tr className="kupcoming-head">
                  <th scope="colgroup" colSpan={columns}>
                    <button
                      type="button"
                      className="kupcoming-toggle"
                      aria-expanded={upcoming.open}
                      aria-controls={sectionId}
                      onClick={upcoming.toggle}
                    >
                      <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                      {upcomingSummary(upcoming.count, entries[0])}
                    </button>
                  </th>
                </tr>
              )}
              {upcoming.open && entries.length > 0 && (
                <tr className="kupcoming-sum" data-testid="register-planned-sum">
                  <td colSpan={columns}>
                    Geplant (nicht in den Monatssummen): {registerAmount(plannedCents(entries))}
                  </td>
                </tr>
              )}
              {upcoming.open &&
                entries.map((entry) =>
                  entry.schedule ? (
                    <ScheduledRegisterRow
                      key={entry.id}
                      occurrence={entry.schedule}
                      today={upcoming.today}
                      all={all}
                      blankCheck={!!selection}
                      balance={upcoming.balances.get(entry.id) ?? null}
                      showBalance={runColumn}
                    />
                  ) : (
                    <Row
                      key={entry.id}
                      booking={entry.booking}
                      variant={variant}
                      classes={classes}
                      upcomingToday={upcoming.today}
                      projectedBalance={upcoming.balances.get(entry.id) ?? null}
                      blankCheck={!!selection}
                      runColumn={runColumn}
                      dispoCents={dispo}
                      onOpen={onOpen}
                      onInspect={setInspected}
                      categories={lookups.data?.categories ?? []}
                      groups={lookups.data?.groups ?? []}
                      onCategory={setCategory}
                      onPatch={(patch) => writes.patch.mutateAsync({ id: entry.id, patch })}
                      busy={writes.patch.isPending}
                    />
                  ),
                )}
            </tbody>
            {showTodayBalance && !REDESIGN_ENABLED && (
              <tbody className="kregister-today">
                <tr data-testid="register-today">
                  <td colSpan={columns}>Heute · Saldo {upcoming.balanceLabel}</td>
                </tr>
              </tbody>
            )}
          </>
        )}
        {all && !REDESIGN_ENABLED ? (
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.day || 'all'}>{groupRows(group)}</Fragment>
            ))}
          </tbody>
        ) : (
          // One body per day: the rowgroup heading below then owns exactly its day's rows.
          groups.map((group) => <tbody key={group.day}>{groupRows(group)}</tbody>)
        )}
      </table>
      {REDESIGN_ENABLED && inspected !== undefined && (
        <BookingInspector booking={inspected} onClose={() => setInspected(null)} />
      )}
    </>
  );
}

function groupByDay(items: ReadonlyArray<ListedBooking>) {
  const groups: { day: string; items: ListedBooking[] }[] = [];
  for (const b of items) {
    let group = groups[groups.length - 1];
    if (!group || group.day !== b.date) {
      group = { day: b.date, items: [] };
      groups.push(group);
    }
    group.items.push(b);
  }
  return groups;
}

function Row({
  booking: b,
  variant,
  classes,
  selection,
  onOpen,
  onInspect,
  categories,
  groups,
  onCategory,
  onPatch,
  busy,
  upcomingToday,
  projectedBalance,
  blankCheck,
  runColumn,
  dispoCents = null,
  showRunningBalance = false,
}: {
  booking: ListedBooking;
  variant: 'account' | 'all';
  classes: Map<string, SwatchKind>;
  selection?: Selection;
  onOpen: (b: ListedBooking) => void;
  onInspect: (b: ListedBooking) => void;
  categories: { id: string; name: string; groupId: string | null }[];
  groups: { id: string; name: string }[];
  onCategory: (b: ListedBooking, categoryId: string | null) => void;
  onPatch: (patch: BookingPatch) => Promise<unknown>;
  busy: boolean;
  upcomingToday?: string;
  projectedBalance?: number | null;
  /** Upcoming rows cannot be selected but keep the checkbox column aligned. */
  blankCheck?: boolean;
  runColumn: boolean;
  /** Overdraft limit shown behind the balance (redesign, single checking account). */
  dispoCents?: number | null;
  showRunningBalance?: boolean;
}) {
  useAmountPrivacy();
  const flashing = useFlashing(b.id);
  const [editing, setEditing] = useState(false);
  const checked = selection?.selected.has(b.id) ?? false;
  const selectionMode = selection?.mode === true;
  const label = `${b.payeeName ?? 'Buchung'} am ${shortDay(b.date)}`;
  const amountContent = (
    <>
      {selectionMode ? (
        <span className={b.currency === 'EUR' ? undefined : 'kfx-money'}>
          {valuedCurrency(b.amountCents, b.currency, b.amountValuation, true)}
        </span>
      ) : (
        <InlineBookingCell
          booking={b}
          field="amountCents"
          onSave={onPatch}
          onOpen={() => onOpen(b)}
        >
          <span
            className={cx(
              b.currency !== 'EUR' && 'kfx-money',
              upcomingToday && (b.amountCents < 0 ? 'kupcoming-negative' : 'kupcoming-positive'),
            )}
          >
            {valuedCurrency(b.amountCents, b.currency, b.amountValuation, true)}
          </span>
        </InlineBookingCell>
      )}
      {b.categorySpendingCents !== undefined && (
        <small className="kmeta">{categoryNetLabel(false, b.categorySpendingCents)}</small>
      )}
    </>
  );
  return (
    // Individual cell controls handle keyboard access; the rest of the row opens the dialog.
    <tr
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, input, select, .kinline')) onOpen(b);
      }}
      className={cx(
        b.status === 'pending' && 'is-pending',
        REDESIGN_ENABLED && b.status === 'reconciled' && 'is-reconciled',
        flashing && 'tx-flash',
        checked && 'is-selected',
        upcomingToday && 'is-upcoming',
      )}
      data-booking={b.id}
      data-selection-mode={selectionMode ? '1' : undefined}
    >
      {blankCheck && <td className="kc-check kx-check" />}
      {selection && (
        <td className="kc-check kx-check">
          <input
            type="checkbox"
            aria-label={`${label} auswählen`}
            checked={checked}
            disabled={selection.disabled}
            onChange={() => selection.toggle(b.id)}
          />
        </td>
      )}
      <td className="kc-date kx-date">
        {selectionMode ? (
          <span>{upcomingToday ? upcomingDate(b.date, upcomingToday) : shortDay(b.date)}</span>
        ) : (
          <InlineBookingCell booking={b} field="date" onSave={onPatch} onOpen={() => onOpen(b)}>
            {upcomingToday ? upcomingDate(b.date, upcomingToday) : shortDay(b.date)}
          </InlineBookingCell>
        )}
      </td>
      <td className="kx-payee">
        <button
          type="button"
          className="kname-btn"
          disabled={selection?.disabled}
          onClick={() => onOpen(b)}
        >
          <span className="sr-only">
            {label} {selectionMode ? (checked ? 'abwählen' : 'auswählen') : 'bearbeiten'} ·
          </span>{' '}
          <PayeeCell
            booking={b}
            {...(variant === 'account'
              ? upcomingToday
                ? { noteClassName: 'kx-mobile-note' }
                : { hideNote: true }
              : REDESIGN_ENABLED
                ? { hideNote: true }
                : {})}
          />
          {REDESIGN_ENABLED && !selectionMode && (
            <Pencil
              className="icon kbooking-edit-mark"
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          )}
        </button>
        {REDESIGN_ENABLED && !selectionMode && (
          <button
            type="button"
            className="btn btn-ghost booking-inspect-trigger"
            aria-label={`Buchungsdetails: ${label}`}
            aria-haspopup="dialog"
            disabled={selection?.disabled}
            onClick={() => onInspect(b)}
          >
            <Info size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        {(variant === 'account' || REDESIGN_ENABLED) && !upcomingToday && (
          // Outside the labelled button so the row still reads its category and note; the button
          // covers it on the phone, so a tap anywhere in the cell opens the booking.
          <span className="kaccount-mobile-meta">
            <span className="kregister-inline-date">{shortDay(b.date)}</span>
            <span className="kregister-inline-date" aria-hidden="true">
              {' '}
              ·{' '}
            </span>
            {variant === 'all' && (
              <>
                <span className="kmeta-account">{b.accountName}</span>
                <span aria-hidden="true"> · </span>
              </>
            )}
            <CategoryCell booking={b} classes={classes} showClass={false} />
            {b.memo && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="kmeta kx-mobile-note">{b.memo}</span>
              </>
            )}
          </span>
        )}
      </td>
      {variant === 'account' && !REDESIGN_ENABLED && (
        <td className="kx-note">
          <span title={b.memo ?? undefined}>{b.memo}</span>
        </td>
      )}
      {variant === 'all' && <td className="kc-acct kx-acct">{b.accountName}</td>}
      <td className="kx-cat">
        {editing && !selectionMode ? (
          <select
            className="select select-sm"
            aria-label={`Kategorie für ${label}`}
            // Opened by the user's click on the category; focus belongs in the field.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            defaultValue={b.splits[0]?.categoryId ?? ''}
            onBlur={() => setEditing(false)}
            onChange={(e) => {
              setEditing(false);
              flashRows([b.id]);
              onCategory(b, e.target.value || null);
            }}
          >
            <option value="">ohne Kategorie</option>
            {groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {categories
                  .filter((c) => c.groupId === g.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
            {categories
              .filter((c) => !c.groupId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        ) : canEditCategory(b) && !selectionMode ? (
          <button type="button" className="kcat-btn" onClick={() => setEditing(true)}>
            <span className="sr-only">Kategorie ändern: {label} ·</span>{' '}
            <CategoryCell booking={b} classes={classes} showClass={false} />
            <Pencil className="icon kcat-edit" size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : (
          <CategoryCell booking={b} classes={classes} showClass={false} />
        )}
      </td>
      {REDESIGN_ENABLED && (
        <td className="kx-note">
          <span title={b.memo ?? undefined}>{b.memo}</span>
        </td>
      )}
      {REDESIGN_ENABLED ? (
        <>
          <td className="kc-num kx-amount kx-outgoing">
            {b.amountCents < 0 ? amountContent : null}
          </td>
          <td className="kc-num kx-amount kx-incoming">
            {b.amountCents >= 0 ? amountContent : null}
          </td>
        </>
      ) : (
        <td className="kc-num kx-amount">{amountContent}</td>
      )}
      {runColumn && !(variant === 'account' || upcomingToday || showRunningBalance) && (
        <td className="kc-num kc-run kx-run" />
      )}
      {runColumn && (variant === 'account' || upcomingToday || showRunningBalance) && (
        <td className="kc-num kc-run kx-run">
          <span className={b.currency === 'EUR' ? undefined : 'kfx-money'}>
            {upcomingToday
              ? projectedBalance == null
                ? variant === 'account'
                  ? '–'
                  : 'Saldo offen'
                : nativeCurrency(projectedBalance, b.currency)
              : b.balanceAfterCents === null
                ? ''
                : valuedCurrency(b.balanceAfterCents, b.currency, b.balanceValuation)}
          </span>
          {dispoCents !== null &&
            (upcomingToday ? projectedBalance != null : b.balanceAfterCents !== null) && (
              <span className="kdispo" title="Dispo-Rahmen">
                {' '}
                ({nativeCurrency(dispoCents, b.currency)})
              </span>
            )}
        </td>
      )}
      <td className="kc-status kx-status">
        {upcomingToday ? (
          <span
            className="kstatus-btn"
            role="img"
            aria-label="Kommende Buchung"
            title="Kommende Buchung"
          >
            <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
        ) : (
          <StatusCell
            status={b.status}
            iconOnly
            disabled={busy}
            onToggle={
              b.status === 'reconciled' || selectionMode
                ? undefined
                : () => {
                    void onPatch({
                      status: b.status === 'pending' ? 'confirmed' : 'pending',
                    }).catch(() => undefined);
                  }
            }
          />
        )}
      </td>
    </tr>
  );
}

/** Month figures of the register: sum of the shown rows, plus the balance only for a whole account. */
export function MonthSums({
  row,
  kind,
}: {
  row: RegisterMonth | undefined;
  kind: RegisterMonthsKind | undefined;
}) {
  useAmountPrivacy();
  const count = row ? ` · ${row.count} ${row.count === 1 ? 'Buchung' : 'Buchungen'}` : '';
  if (row?.beforeStart) return <>Vor Start{count}</>;
  return (
    <>
      {kind === 'filtered' ? 'Monat gefiltert' : kind === 'rows' ? 'Monat (angezeigt)' : 'Monat'}{' '}
      {registerAmount(row?.cents)}
      {kind === 'balance' && row?.cumulativeCents != null && (
        <>
          {' · '}Saldo Monatsende {registerAmount(row.cumulativeCents)}
        </>
      )}
      {count}
    </>
  );
}

/** Signed EUR total of the planned rows; unknown conversions make it unavailable, never 0. */
export function plannedCents(entries: readonly UpcomingEntry[]): number | null {
  let total = 0n;
  for (const entry of entries) {
    const cents = entry.booking
      ? (entry.booking.amountValuation?.eurCents ?? null)
      : entry.schedule.currency === 'EUR'
        ? entry.schedule.amountCents
        : null;
    if (cents === null || !Number.isSafeInteger(cents)) return null;
    total += BigInt(cents);
  }
  return total > BigInt(Number.MAX_SAFE_INTEGER) || total < -BigInt(Number.MAX_SAFE_INTEGER)
    ? null
    : Number(total);
}
