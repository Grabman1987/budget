import type { ExplorerTemplateContribution } from '@budget/domain';
import { Button } from '@budget/ui';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { eur, longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import { ReportTable } from './report-table';

export interface CellBookingRow {
  key: string;
  bookingId: string;
  date: string;
  payee: string;
  account: string;
  memo: string;
  /** Classified share of this cell; the same cents the cell sums. */
  cents: number;
  /** Absolute whole amount of the booking when this row is only a share of it. */
  partOf: number | null;
}

/** Display mapping only: shares stay exactly as the domain classified them. */
export function cellBookingRows(sources: ExplorerTemplateContribution[]): CellBookingRow[] {
  return sources.map((source, index) => ({
    key: `${source.bookingId}:${index}`,
    bookingId: source.bookingId,
    date: source.date,
    payee: source.payeeName ?? '–',
    account: source.accountName ?? '–',
    memo: source.memo?.trim() || '–',
    cents: source.cents,
    partOf:
      source.bookingCents !== null && Math.abs(source.bookingCents) !== Math.abs(source.cents)
        ? Math.abs(source.bookingCents)
        : null,
  }));
}

/** Shared drill-down panel under a report matrix: the bookings behind one chosen cell. */
export function ReportCellBookings({
  headingId,
  heading,
  value,
  sources,
  onClose,
}: {
  headingId: string;
  heading: string;
  value: number;
  sources: ExplorerTemplateContribution[];
  onClose: () => void;
}) {
  const section = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rows = cellBookingRows(sources);
  const sum = rows.reduce((total, row) => total + row.cents, 0);
  useEffect(() => {
    section.current?.scrollIntoView?.({ block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }, [heading]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Esc closes the drill-down from anywhere inside it.
    <section
      ref={section}
      className="ex-template-sources"
      aria-labelledby={headingId}
      data-testid="template-sources"
      onKeyDown={onKeyDown}
    >
      <div className="ex-template-source-heading">
        <h3 id={headingId} ref={headingRef} tabIndex={-1}>
          {heading}
        </h3>
        <Button variant="ghost" onClick={onClose}>
          Buchungen schließen
        </Button>
      </div>
      <p>
        Gewählte Zelle: <strong>{eur(value)}</strong> · Summe der zugeordneten Anteile:{' '}
        <strong>{eur(sum)}</strong>
      </p>
      {sum !== value && (
        <p role="alert">
          Die Buchungsanteile stimmen nicht mit der Zelle überein. Bitte lade die Auswertung neu.
        </p>
      )}
      {rows.length === 0 ? (
        <p>Keine Buchungen in dieser Zelle.</p>
      ) : (
        <ReportTable
          caption={`${heading}: Datum, Empfänger, Konto, Notiz und zugeordneter Anteil in Euro`}
          regionLabel={`${heading}, bei Bedarf horizontal verschiebbar`}
          className="ex-cell-bookings"
        >
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col">Empfänger</th>
              <th scope="col">Konto</th>
              <th scope="col">Notiz</th>
              <th scope="col" className="n">
                Anteil
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <AppLink
                    className="report-source-link"
                    to="/konten/buchungen"
                    search={{ buchung: row.bookingId }}
                  >
                    {longDay(row.date)}
                  </AppLink>
                </td>
                <td>{row.payee}</td>
                <td>{row.account}</td>
                <td>{row.memo}</td>
                <td className="n">
                  {eur(row.cents)}
                  {row.partOf !== null && <small>Teil von {eur(row.partOf)}</small>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4}>
                Summe
              </th>
              <td className="n">
                <strong>{eur(sum)}</strong>
              </td>
            </tr>
          </tfoot>
        </ReportTable>
      )}
      <p className="ov-note">
        Bei geteilten Buchungen steht hier nur der klassifizierte Anteil dieser Zelle, nicht der
        gesamte Kontobetrag. Erstattungen und Umbuchungen behalten ihre bestehende Zuordnung.
      </p>
    </section>
  );
}
