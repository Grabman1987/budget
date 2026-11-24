import { maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { lastDayOfMonth } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { eur, shortDay } from '../ledger/format';
import { bookingsQuery } from '../ledger/queries';
import type { BookingFilter } from '../ledger/types';
import { AppLink } from '../shell/app-link';

const LIMIT = 200;

/** The bookings behind one category figure of a month, same basis as the report (net spending). */
export const categoryMonthFilter = (categoryId: string, month: string): BookingFilter => ({
  basis: 'category-spending',
  categoryId,
  from: `${month}-01`,
  to: lastDayOfMonth(month),
  sort: 'date',
  direction: 'asc',
});

/** Search params of "Alle Buchungen" for the same category and month. */
export const categoryMonthSearch = (categoryId: string, month: string) => ({
  kategorie: categoryId,
  basis: 'category-spending' as const,
  von: `${month}-01`,
  bis: lastDayOfMonth(month),
});

const shortMemo = (memo: string | null) =>
  memo && memo.length > 40 ? `${memo.slice(0, 39)}…` : (memo ?? '');

/** Category name as a disclosure button plus, when open, the booking list in the next row. */
export function CategoryDrilldownRow({
  id,
  name,
  month,
  cells,
  columns,
}: {
  id: string;
  name: string;
  month: string;
  cells: readonly string[];
  columns: number;
}) {
  useAmountPrivacy();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <tr>
        <th scope="row">
          <button
            type="button"
            className="period-drill-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden="true" className="period-drill-chevron">
              {open ? '▾' : '▸'}
            </span>
            {maskMoneyText(name)}
          </button>
        </th>
        {cells.map((cell, i) => (
          <td key={i}>{cell}</td>
        ))}
      </tr>
      <tr id={panelId} hidden={!open} className="period-drill-row">
        <td colSpan={columns}>{open && <CategoryBookings id={id} month={month} />}</td>
      </tr>
    </>
  );
}

function CategoryBookings({ id, month }: { id: string; month: string }) {
  const query = useQuery(bookingsQuery(categoryMonthFilter(id, month), undefined, LIMIT));
  if (query.isPending) return <p className="period-drill-note">Lädt Buchungen …</p>;
  if (query.isError)
    return (
      <p className="period-drill-note" role="alert">
        Buchungen konnten nicht geladen werden.
      </p>
    );
  const page = query.data;
  return (
    <div className="period-drill">
      {page.items.length === 0 ? (
        <p className="period-drill-note">Keine Buchungen in diesem Monat.</p>
      ) : (
        <ul>
          {page.items.map((b) => (
            <li key={b.id}>
              <span className="period-drill-date">{shortDay(b.date)}</span>
              <span className="period-drill-text">
                {maskMoneyText(b.payeeName ?? '—')}
                {b.memo ? <small>{maskMoneyText(shortMemo(b.memo))}</small> : null}
              </span>
              <span className="period-drill-amount">
                {eur(b.categorySpendingCents ?? -b.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="period-drill-total">
        <span>Summe{page.nextCursor ? ` (erste ${page.items.length})` : ''}</span>
        <b>{eur(page.categorySpendingCents ?? 0)}</b>
      </p>
      <AppLink to="/konten/buchungen" search={categoryMonthSearch(id, month)}>
        Alle in Buchungen öffnen
      </AppLink>
    </div>
  );
}
