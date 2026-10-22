import { useAmountPrivacy, cx, type SwatchKind } from '@budget/ui';
import { InlineBookingCell } from './inline-booking-cell';
import type { BookingPatch } from './api';
import { keepSplit } from './booking-model';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, Pencil } from 'lucide-react';
import { Fragment, useId, useState, type ReactNode } from 'react';
import { CategoryCell, FlagCell, PayeeCell, StatusCell, useCategoryClasses } from './booking-cells';
import { BookingLegend } from './booking-legend';
import { FlagGlyph } from './flag-picker';
import { FLAG_LABEL } from './labels';
import { dayHeading, nativeCurrency, valuedCurrency, shortDay, upcomingDate, eur } from './format';
import { ScheduledRegisterRow } from './scheduled-register-row';
import { upcomingEntries, upcomingSummary, type UpcomingModel } from './upcoming-register';
import { flashRows, useFlashing } from './flash';
import { useLedgerWrites } from './mutations';
import { lookupsQuery } from './queries';
import type { BookingFlag, BookingSort, ListedBooking } from './types';

export interface Selection {
  selected: ReadonlySet<string>;
  disabled?: boolean;
  /** Explicit phone selection mode; metadata stays read-only while choosing rows. */
  mode?: boolean;
  toggle: (id: string) => void;
  toggleAll: (ids: string[]) => void;
}

export interface BookingTableProps {
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
  /** Alle Buchungen exposes canonical balances only with exactly one account filter. */
  singleAccountBalance?: boolean;
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
  singleAccountBalance = false,
}: BookingTableProps) {
  useAmountPrivacy();
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
  // A flag is saved at once, with the usual undo toast.
  const setFlag = (b: ListedBooking, flag: BookingFlag | null) => {
    if (selection?.disabled || selection?.mode) return;
    if ((b.flag ?? null) === flag) return;
    writes.patch.mutate({ id: b.id, patch: { flag } });
  };
  const all = variant === 'all';
  const sectionId = useId();
  const runColumn = !all || singleAccountBalance;
  const columns = (selection ? 1 : 0) + 7 + (runColumn ? 1 : 0);
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
              <ArrowUp size={12} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ArrowDown size={12} strokeWidth={1.75} aria-hidden="true" />
            ))}
        </button>
      ) : (
        label
      )}
    </th>
  );

  const entries = upcoming ? upcomingEntries(upcoming) : [];
  const groups = groupByDay(items);
  const groupRows = (group: (typeof groups)[number]) => (
    <>
      {all && (
        <tr className="kday">
          <td colSpan={columns}>
            <span className="tech">{dayHeading(group.day)}</span>
            <span className="kday-sum">
              {[...new Set(group.items.map((b) => b.currency))]
                .map((currency) =>
                  nativeCurrency(
                    group.items
                      .filter((b) => b.currency === currency)
                      .reduce((sum, b) => sum + b.amountCents, 0),
                    currency,
                    true,
                  ),
                )
                .join(' · ')}
            </span>
          </td>
        </tr>
      )}
      {!all && (
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
      {group.items.map((b) => (
        <Row
          key={b.id}
          booking={b}
          variant={variant}
          classes={classes}
          runColumn={runColumn}
          {...(selection ? { selection } : {})}
          onOpen={onOpen}
          categories={lookups.data?.categories ?? []}
          groups={lookups.data?.groups ?? []}
          onCategory={setCategory}
          onFlag={setFlag}
          onPatch={(patch) => selection?.disabled || selection?.mode
            ? Promise.reject(new Error('Bitte die laufende Auswahl zuerst beenden.'))
            : writes.patch.mutateAsync({ id: b.id, patch })}
          busy={writes.patch.isPending}
        />
      ))}
    </>
  );
  return (
    <>
      <div className="kbooking-tools">
        <BookingLegend />
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
      <table className={cx('ktable ktx', all ? 'ktx-all' : 'ktx-account')}>
        <caption className="sr-only">{caption}</caption>
        {!all && (
          <colgroup>
            {selection && <col className="kcol-select" />}
            <col className="kcol-flag" />
            <col className="kcol-date" />
            <col />
            <col className="kcol-note" />
            <col className="kcol-category" />
            <col className="kcol-money" />
            <col className="kcol-money" />
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
            <th className="kc-flag" scope="col">
              <span className="sr-only">Markierung</span>
            </th>
            {head('Datum', 'date')}
            {head('Empfänger', 'payee')}
            {all && head('Konto', 'account')}
            {!all && (
              <th className="tech kx-note" scope="col">
                Notiz
              </th>
            )}
            {head('Kategorie')}
            {head('Betrag', 'amount', true)}
            {runColumn && head('Saldo', undefined, true)}
            <th scope="col" className="kc-status">
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        {upcoming && (
          <>
            <tbody className="kupcoming" id={sectionId}>
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
                      onOpen={onOpen}
                      categories={lookups.data?.categories ?? []}
                      groups={lookups.data?.groups ?? []}
                      onCategory={setCategory}
                      onFlag={setFlag}
                      onPatch={(patch) => writes.patch.mutateAsync({ id: entry.id, patch })}
                      busy={writes.patch.isPending}
                    />
                  ),
                )}
            </tbody>
            {showTodayBalance && (
              <tbody className="kregister-today">
                <tr data-testid="register-today">
                  <td colSpan={columns}>Heute · Saldo {upcoming.balanceLabel}</td>
                </tr>
              </tbody>
            )}
          </>
        )}
        {all ? (
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
  categories,
  groups,
  onCategory,
  onFlag,
  onPatch,
  busy,
  upcomingToday,
  projectedBalance,
  blankCheck,
  runColumn,
}: {
  booking: ListedBooking;
  variant: 'account' | 'all';
  classes: Map<string, SwatchKind>;
  selection?: Selection;
  onOpen: (b: ListedBooking) => void;
  categories: { id: string; name: string; groupId: string | null }[];
  groups: { id: string; name: string }[];
  onCategory: (b: ListedBooking, categoryId: string | null) => void;
  onFlag: (b: ListedBooking, flag: BookingFlag | null) => void;
  onPatch: (patch: BookingPatch) => Promise<unknown>;
  busy: boolean;
  upcomingToday?: string;
  projectedBalance?: number | null;
  /** Upcoming rows cannot be selected but keep the checkbox column aligned. */
  blankCheck?: boolean;
  runColumn: boolean;
}) {
  useAmountPrivacy();
  const flashing = useFlashing(b.id);
  const [editing, setEditing] = useState(false);
  const checked = selection?.selected.has(b.id) ?? false;
  const selectionMode = selection?.mode === true;
  const label = `${b.payeeName ?? 'Buchung'} am ${shortDay(b.date)}`;
  return (
    // Individual cell controls handle keyboard access; the rest of the row opens the dialog.
    <tr
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, input, select, .kflagmenu, .kinline'))
          onOpen(b);
      }}
      className={cx(
        b.status === 'pending' && 'is-pending',
        flashing && 'tx-flash',
        checked && 'is-selected',
        upcomingToday && 'is-upcoming',
      )}
      data-booking={b.id}
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
      <td className="kc-flag kx-flag">
        {selectionMode ? <span className="kflag" role="img" aria-label={b.flag ? `Markierung ${FLAG_LABEL[b.flag]}` : 'Keine Markierung'}>
          <FlagGlyph flag={b.flag} size={16} />
        </span> : <FlagCell
          booking={b}
          label={label}
          onChange={(flag) => { if (!selection?.disabled) onFlag(b, flag === '' ? null : flag); }}
        />}
      </td>
      <td className="kc-date kx-date">
        {selectionMode ? <span>{upcomingToday ? upcomingDate(b.date, upcomingToday) : shortDay(b.date)}</span> :
          <InlineBookingCell booking={b} field="date" onSave={onPatch} onOpen={() => onOpen(b)}>
            {upcomingToday ? upcomingDate(b.date, upcomingToday) : shortDay(b.date)}
          </InlineBookingCell>}
      </td>
      <td className="kx-payee">
        <button
          type="button"
          className="kname-btn"
          aria-label={selectionMode ? `${label} ${checked ? 'abwählen' : 'auswählen'}` : `${label} bearbeiten`}
          disabled={selection?.disabled}
          onClick={() => onOpen(b)}
        >
          <PayeeCell
            booking={b}
            {...(variant === 'account'
              ? upcomingToday
                ? { noteClassName: 'kx-mobile-note' }
                : { hideNote: true }
              : {})}
          />
        </button>
        {variant === 'account' && !upcomingToday && (
          // Outside the labelled button so the row still reads its category and note; the button
          // covers it on the phone, so a tap anywhere in the cell opens the booking.
          <span className="kaccount-mobile-meta">
            <span>{shortDay(b.date)}</span>
            <span aria-hidden="true"> · </span>
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
      {variant === 'account' && (
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
          <button
            type="button"
            className="kcat-btn"
            aria-label={`Kategorie ändern: ${label}`}
            onClick={() => setEditing(true)}
          >
            <CategoryCell booking={b} classes={classes} showClass={false} />
            <Pencil className="icon kcat-edit" size={12} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : (
          <CategoryCell booking={b} classes={classes} showClass={false} />
        )}
      </td>
      <td className="kc-num kx-amount">
        {selectionMode ? <span>{valuedCurrency(b.amountCents, b.currency, b.amountValuation, true)}</span> : (
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
          <small className="kmeta">Kategorie netto {b.categorySpendingCents === null ? 'nicht darstellbar' : eur(b.categorySpendingCents)}</small>
        )}
      </td>
      {runColumn && (
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
            <CalendarDays size={16} aria-hidden="true" />
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
