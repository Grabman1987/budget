import { useAmountPrivacy } from '@budget/ui';
import { CircleCheck, Clock, Ellipsis } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { useIsPhone } from '../budget/month-span';
import { skipOccurrence } from '../expected/api';
import { eur, shortDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import { readLiquiditySelection } from '../reports/liquidity-selection';
import type { Heute, HeuteOccurrence } from './api';
import { StrikeButton, statusText } from './upcoming-payments';

/** Phone: the "strike this month" action hides behind a ⋯ menu instead of a multi-line button (#1381). */
function StrikeMenu({ item }: { item: HeuteOccurrence }) {
  const write = useBudgetWrite();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  const label = `Diesen Monat streichen: ${item.name}, ${shortDay(item.dueDate)}`;
  return (
    <span className="hv-due-menu" ref={wrap}>
      <button
        type="button"
        className="icon-btn hv-due-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Weitere Aktionen: ${item.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <span id={menuId} className="hv-due-menu-list" role="menu">
          <button
            type="button"
            role="menuitem"
            className="hv-due-menu-item"
            aria-label={label}
            onClick={() => {
              setOpen(false);
              void write(
                () => skipOccurrence(item.paymentId, item.dueDate),
                () => `${item.name}: ${shortDay(item.dueDate)} gestrichen`,
              );
            }}
          >
            Diesen Monat streichen
          </button>
        </span>
      )}
    </span>
  );
}

/** "Fällig · alle Zahlungen": one compact table, Datum · Zahlung · Konto · Betrag · Deckung. */
export function DueDetail({
  data,
  until,
  onOpenOccurrence,
}: {
  data: Heute;
  /** Last day (inclusive) of the planned one-off events that belong to the window. */
  until: string;
  onOpenOccurrence: (item: HeuteOccurrence) => void;
}) {
  useAmountPrivacy();
  const phone = useIsPhone();
  const selection = readLiquiditySelection();
  const rows = [
    ...data.upcoming14.map((item) => ({ date: item.dueDate, item })),
    ...data.upcomingEvents
      .filter((event) => event.date <= until)
      .map((event) => ({ date: event.date, event })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  // Explicit roles keep the table semantics where the phone CSS turns the table into a grid.
  /* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */
  return (
    <section className="card hv-due-card" aria-label="Fällige Zahlungen">
      <table className="hv-due-table" role="table">
        <caption className="sr-only">Fällige Zahlungen der nächsten 14 Tage</caption>
        <thead role="rowgroup">
          <tr role="row">
            {['Datum', 'Zahlung', 'Konto', 'Betrag', 'Deckung'].map((label) => (
              <th key={label} scope="col" role="columnheader">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) =>
            'event' in row ? (
              <tr key={row.event.eventId} role="row">
                <td role="cell" className="hv-due-date">
                  <time dateTime={row.event.date}>{shortDay(row.event.date)}</time>
                </td>
                <td role="cell" className="hv-due-name">
                  {row.event.name}
                </td>
                <td role="cell" className="hv-due-account">
                  Einmalereignis
                </td>
                <td role="cell" className="hv-due-amount">
                  <AppLink
                    to="/plan/jahr"
                    search={{ ereignis: row.event.eventId }}
                    className="heute-account-preview"
                  >
                    {eur(row.event.amountCents, { sign: true })}
                  </AppLink>
                </td>
                <td role="cell" className="hv-due-cover">
                  Nur geplant
                </td>
              </tr>
            ) : (
              <tr key={`${row.item.paymentId}-${row.item.dueDate}`} role="row">
                <td role="cell" className="hv-due-date">
                  <time dateTime={row.item.dueDate}>{shortDay(row.item.dueDate)}</time>
                </td>
                <td role="cell" className="hv-due-name">
                  <button
                    type="button"
                    className="heute-row-open"
                    aria-label={`${row.item.name} · fällig ${shortDay(row.item.dueDate)} · öffnen`}
                    onClick={() => onOpenOccurrence(row.item)}
                  >
                    {row.item.name}
                  </button>
                </td>
                <td role="cell" className="hv-due-account">
                  {row.item.accountId && row.item.accountName ? (
                    <AppLink
                      className="heute-account-preview"
                      to={`/konten/${encodeURIComponent(row.item.accountId)}`}
                      search={{
                        faellig: row.item.dueDate,
                        vorschau: 'liquiditaet',
                        horizon: selection.horizon,
                        levers: selection.levers.join(','),
                      }}
                    >
                      {row.item.accountName}
                    </AppLink>
                  ) : (
                    (row.item.accountName ?? '–')
                  )}
                </td>
                <td role="cell" className="hv-due-amount">
                  <AppLink to="/plan/erwartet" search={{ zahlung: row.item.paymentId }}>
                    {eur(row.item.amountCents, { sign: true })}
                  </AppLink>
                </td>
                <td
                  role="cell"
                  className={`hv-due-cover${row.item.covered === false ? ' heute-note' : row.item.covered ? ' heute-good' : ''}`}
                >
                  {row.item.covered === true ? (
                    <>
                      <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" /> Reicht
                    </>
                  ) : row.item.covered === false ? (
                    <>
                      <Clock size={16} strokeWidth={1.75} aria-hidden="true" /> Reicht nicht
                    </>
                  ) : (
                    statusText(row.item.status)
                  )}
                  {row.item.kind === 'inflow' &&
                    row.item.status === 'expected' &&
                    (phone ? <StrikeMenu item={row.item} /> : <StrikeButton item={row.item} />)}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}
/* eslint-enable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */
