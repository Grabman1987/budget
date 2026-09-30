import { keepSplit } from './booking-model';
import { cx, type SwatchKind } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { CategoryCell, PayeeCell, StatusCell, useCategoryClasses } from './booking-cells';
import { dayHeading, eur, shortDay } from './format';
import { flashRows, useFlashing } from './flash';
import { useLedgerWrites } from './mutations';
import { lookupsQuery } from './queries';
import type { BookingSort, ListedBooking } from './types';

export interface Selection {
  selected: ReadonlySet<string>;
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
}

const canEditCategory = (b: ListedBooking) =>
  !b.transferId && b.splits.length === 1 && b.status !== 'reconciled';

/**
 * Booking table shared by Einzelkonto and Alle Buchungen: the payee opens the booking, the
 * category is changed in place, new and changed rows flash once. On the phone every row becomes
 * a small card of the same cells.
 */
export function BookingTable({
  items,
  caption,
  variant,
  onOpen,
  selection,
  sort,
}: BookingTableProps) {
  const classes = useCategoryClasses();
  const writes = useLedgerWrites();
  const lookups = useQuery(lookupsQuery());
  const setCategory = (b: ListedBooking, categoryId: string | null) => {
    if ((b.splits[0]?.categoryId ?? null) === categoryId) return;
    writes.patch.mutate({
      id: b.id,
      patch: { splits: [keepSplit(b.splits[0], categoryId, b.amountCents)] },
    });
  };
  const all = variant === 'all';
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

  const groups = all ? groupByDay(items) : [{ day: '', items: [...items], sum: 0 }];
  return (
    <>
      {selection && (
        // The table head is hidden on the phone, so select-all is offered here as well.
        <label className="kselect-all">
          <input
            type="checkbox"
            checked={items.length > 0 && items.every((b) => selection.selected.has(b.id))}
            onChange={() => selection.toggleAll(items.map((b) => b.id))}
          />
          Alle sichtbaren auswählen
        </label>
      )}
      <table className={cx('ktable ktx', all && 'ktx-all')}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {selection && (
              <th className="kc-check" scope="col">
                <input
                  type="checkbox"
                  aria-label="Alle sichtbaren Buchungen auswählen"
                  checked={items.length > 0 && items.every((b) => selection.selected.has(b.id))}
                  onChange={() => selection.toggleAll(items.map((b) => b.id))}
                />
              </th>
            )}
            {head('Datum', 'date')}
            {head('Empfänger', 'payee')}
            {all && head('Konto', 'account')}
            {head('Kategorie')}
            {head('Status')}
            {head('Betrag', 'amount', true)}
            {!all && head('Saldo', undefined, true)}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.day || 'all'}>
              {all && (
                <tr className="kday">
                  <td colSpan={selection ? 7 : 6}>
                    <span className="tech">{dayHeading(group.day)}</span>
                    <span className="kday-sum">{eur(group.sum, { sign: true })}</span>
                  </td>
                </tr>
              )}
              {group.items.map((b) => (
                <Row
                  key={b.id}
                  booking={b}
                  variant={variant}
                  classes={classes}
                  {...(selection ? { selection } : {})}
                  onOpen={onOpen}
                  categories={lookups.data?.categories ?? []}
                  groups={lookups.data?.groups ?? []}
                  onCategory={setCategory}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </>
  );
}

function groupByDay(items: ReadonlyArray<ListedBooking>) {
  const groups: { day: string; items: ListedBooking[]; sum: number }[] = [];
  for (const b of items) {
    let group = groups[groups.length - 1];
    if (!group || group.day !== b.date) {
      group = { day: b.date, items: [], sum: 0 };
      groups.push(group);
    }
    group.items.push(b);
    group.sum += b.amountCents;
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
}: {
  booking: ListedBooking;
  variant: 'account' | 'all';
  classes: Map<string, SwatchKind>;
  selection?: Selection;
  onOpen: (b: ListedBooking) => void;
  categories: { id: string; name: string; groupId: string | null }[];
  groups: { id: string; name: string }[];
  onCategory: (b: ListedBooking, categoryId: string | null) => void;
}) {
  const flashing = useFlashing(b.id);
  const [editing, setEditing] = useState(false);
  const checked = selection?.selected.has(b.id) ?? false;
  const label = `${b.payeeName ?? 'Buchung'} am ${shortDay(b.date)}`;
  return (
    <tr
      className={cx(
        b.status === 'pending' && 'is-pending',
        flashing && 'tx-flash',
        checked && 'is-selected',
      )}
      data-booking={b.id}
    >
      {selection && (
        <td className="kc-check kx-check">
          <input
            type="checkbox"
            aria-label={`${label} auswählen`}
            checked={checked}
            onChange={() => selection.toggle(b.id)}
          />
        </td>
      )}
      <td className="kc-date kx-date">{shortDay(b.date)}</td>
      <td className="kx-payee">
        <button
          type="button"
          className="kname-btn"
          aria-label={`${label} bearbeiten`}
          onClick={() => onOpen(b)}
        >
          <PayeeCell booking={b} />
        </button>
      </td>
      {variant === 'all' && <td className="kc-acct kx-acct">{b.accountName}</td>}
      <td className="kx-cat">
        {editing ? (
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
        ) : canEditCategory(b) ? (
          <button
            type="button"
            className="kcat-btn"
            aria-label={`Kategorie ändern: ${label}`}
            onClick={() => setEditing(true)}
          >
            <CategoryCell booking={b} classes={classes} />
            <Pencil className="icon kcat-edit" size={12} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : (
          <CategoryCell booking={b} classes={classes} />
        )}
      </td>
      <td className="kx-status">
        <StatusCell status={b.status} />
      </td>
      <td className="kc-num kx-amount">{eur(b.amountCents, { sign: true })}</td>
      {variant === 'account' && (
        <td className="kc-num kc-run kx-run">
          {b.balanceAfterCents === null ? '' : eur(b.balanceAfterCents)}
        </td>
      )}
    </tr>
  );
}
