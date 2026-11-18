/* Keep explicit table roles because the phone layout changes native table display values. */
/* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */
import { maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { eur, longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import type { ProjectsData } from './payroll-projects-api';
import './payroll-projects.css';

export function ProjectBookings({
  name,
  bookings,
}: {
  name: string;
  bookings: ProjectsData['projects'][number]['bookings'];
}) {
  useAmountPrivacy();
  const sorted = [...bookings].sort(
    (a, b) => b.date.localeCompare(a.date) || a.bookingId.localeCompare(b.bookingId),
  );
  return (
    <details>
      <summary>Buchungen ({bookings.length})</summary>
      {sorted.length > 0 && (
        <table
          className="pp-bookings"
          role="table"
          aria-label={`Buchungen · ${maskMoneyText(name)}`}
        >
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                Datum
              </th>
              <th scope="col" role="columnheader">
                Empfänger
              </th>
              <th scope="col" role="columnheader">
                Kategorie / Einnahmenart
              </th>
              <th scope="col" role="columnheader" className="pp-booking-amount">
                Betrag
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {sorted.map((row) => {
              const label = maskMoneyText(row.payee?.trim() || row.memo?.trim() || '–');
              const date = longDay(row.date);
              return (
                <tr key={row.bookingId} role="row">
                  <td role="cell">
                    <time dateTime={row.date}>{date}</time>
                  </td>
                  <td role="cell">
                    <AppLink
                      to="/konten/buchungen"
                      search={{ buchung: row.bookingId }}
                      aria-label={`Buchung am ${date} öffnen · ${label}`}
                    >
                      {label}
                    </AppLink>
                  </td>
                  <td role="cell">{maskMoneyText(row.classifications.join(' · ') || '–')}</td>
                  <td role="cell" className="pp-booking-amount">
                    {eur(row.amountCents, { sign: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </details>
  );
}
