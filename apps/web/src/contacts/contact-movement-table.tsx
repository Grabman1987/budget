import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import type { ContactMovement, OpenContactOutlay } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { request } from '../api/http';
import { BookingPanel } from '../ledger/booking-panel';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { ListedBooking } from '../ledger/types';
import { contactBalanceLine, receivableDelta } from './contact-balance';
import type { Statement } from './contacts-page';

const movementKind = (movement: ContactMovement) =>
  movement.memo?.startsWith('Ausgleich Kontakt')
    ? 'Ausgleich'
    : movement.amountCents < 0
      ? 'Auslage'
      : 'Rückzahlung';
const description = (movement: ContactMovement) =>
  maskMoneyText(movement.memo?.trim() || movementKind(movement));
const lineText = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Presentation of the existing statement rows; no allocation or balance calculation. */
export function ContactMovementTable({
  statement,
  movements,
  title,
  caption,
  heading,
  headingId,
  onOpen,
  onGift,
  onAllocate,
}: {
  statement: Statement;
  movements: ContactMovement[];
  title: string;
  caption: string;
  heading?: string | false;
  headingId?: string;
  onOpen: (movement: ContactMovement) => void;
  onGift?: ((outlay: OpenContactOutlay) => void) | undefined;
  onAllocate?: ((receiptSplitId: string) => void) | undefined;
}) {
  useAmountPrivacy();
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'manual'>('idle');
  const fallbackId = useId();
  // Rebuilt from current rows/privacy on every render and again at the explicit click.
  // An earlier unmasked copy is never retained as fallback state.
  const text = () =>
    [
      lineText(maskMoneyText(statement.contact.name)),
      title,
      ...movements.map((movement) => {
        const outlay = statement.outlays.find((row) => row.splitId === movement.splitId);
        return [
          longDay(movement.date),
          lineText(description(movement)),
          movementKind(movement),
          eur(receivableDelta(movement.amountCents), { sign: true }),
          ...(outlay && outlay.remainingCents > 0 ? [`offen ${eur(outlay.remainingCents)}`] : []),
        ].join(' · ');
      }),
      `Gesamtsaldo bis ${longDay(statement.asOf)}: ${contactBalanceLine(statement.balanceCents)}`,
    ].join('\n');
  const copy = async () => {
    setCopyState('copying');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text());
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  };
  return (
    <div className="contact-statement-section">
      <div className="contact-section-tools">
        {heading !== false && <h3 id={headingId}>{heading ?? title}</h3>}
        <Button
          variant="ghost"
          disabled={copyState === 'copying'}
          aria-label={`Abschnitt kopieren: ${title}`}
          onClick={() => void copy()}
        >
          Abschnitt kopieren
        </Button>
        {copyState !== 'idle' && (
          <span role="status">
            {copyState === 'copying'
              ? 'Wird kopiert …'
              : copyState === 'copied'
                ? 'Abschnitt kopiert.'
                : 'Kopieren nicht möglich. Text bitte manuell kopieren.'}
          </span>
        )}
      </div>
      {copyState === 'manual' && (
        <div className="contact-copy-fallback">
          <label htmlFor={fallbackId}>Text zum Kopieren</label>
          <textarea
            id={fallbackId}
            readOnly
            rows={Math.min(movements.length + 3, 10)}
            value={text()}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      <table className="contacts-table contact-movements">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Datum / Buchung</th>
            <th scope="col">Betrag</th>
            <th scope="col">Offen</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => {
            const outlay = statement.outlays.find((row) => row.splitId === movement.splitId);
            const repayment = statement.receipts.find(
              (row) => row.receiptSplitId === movement.splitId,
            );
            const bookingNote =
              movement.bookingMemo?.trim() && movement.bookingMemo.trim() !== movement.memo?.trim()
                ? movement.bookingMemo
                : undefined;
            const sourceLabel = [
              `${description(movement)} ${longDay(movement.date)} · ${movementKind(movement)}`,
              movement.payeeName && maskMoneyText(movement.payeeName),
              bookingNote && maskMoneyText(bookingNote),
              movement.categoryName && `Kategorie: ${maskMoneyText(movement.categoryName)}`,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr key={movement.splitId}>
                <td>
                  <button
                    type="button"
                    className="contact-source"
                    data-contact-source={movement.splitId}
                    aria-label={`Ursprungsbuchung öffnen · ${sourceLabel} · Kontaktanteil ${eur(receivableDelta(movement.amountCents), { sign: true })}`}
                    onClick={() => onOpen(movement)}
                  >
                    <span className="contact-movement-note" title={description(movement)}>
                      {description(movement)}
                    </span>{' '}
                    <span className="contact-movement-meta">
                      {longDay(movement.date)} · {movementKind(movement)}
                    </span>
                    {movement.payeeName && (
                      <span className="contact-movement-context">
                        {' '}
                        {maskMoneyText(movement.payeeName)}
                      </span>
                    )}
                    {bookingNote && (
                      <span className="contact-movement-note" title={maskMoneyText(bookingNote)}>
                        {' '}
                        {maskMoneyText(bookingNote)}
                      </span>
                    )}
                    {movement.categoryName && (
                      <span className="contact-movement-context">
                        {' '}
                        Kategorie: {maskMoneyText(movement.categoryName)}
                      </span>
                    )}
                  </button>
                  {onGift && outlay && outlay.remainingCents > 0 && (
                    <Button
                      variant="ghost"
                      onClick={() => onGift(outlay)}
                      aria-label={`${description(movement)} als Geschenk übernehmen`}
                    >
                      Als Geschenk übernehmen
                    </Button>
                  )}
                  {repayment && (
                    <details className="contact-allocation-details">
                      <summary>Zuordnung</summary>
                      <p>
                        {repayment.recorded ? (
                          <>
                            {repayment.allocations
                              .map((allocation) => {
                                const source = statement.outlays.find(
                                  (row) => row.splitId === allocation.outlaySplitId,
                                );
                                return `${source ? longDay(source.date) : 'Auslage'} · ${source?.categoryName ?? 'Kategorie unbekannt'}: ${eur(allocation.amountCents)}`;
                              })
                              .join(' · ')}
                            {repayment.creditCents > 0 &&
                              ` · Guthaben: ${eur(repayment.creditCents)}`}
                          </>
                        ) : (
                          'Zuordnung nicht protokolliert'
                        )}
                      </p>
                      {repayment.allocatable !== false && onAllocate && (
                        <Button variant="ghost" onClick={() => onAllocate(movement.splitId)}>
                          Zuordnung ändern
                        </Button>
                      )}
                    </details>
                  )}
                </td>
                <td className="num">
                  {eur(receivableDelta(movement.amountCents), { sign: true })}
                </td>
                <td className="contact-open-amount">{outlay ? eur(outlay.remainingCents) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface ContactSourceOpening {
  movement: ContactMovement;
  generation: number;
}

/** Fresh whole-booking GET per explicit opening; standard editor owns Save and audited Undo. */
export function ContactBookingSource({
  opening,
  onClose,
}: {
  opening: ContactSourceOpening | null;
  onClose: () => void;
}) {
  useAmountPrivacy();
  const sourceId = opening?.movement.bookingId ?? null;
  const source = useQuery({
    queryKey: [...LEDGER_KEY, 'contact-source', sourceId, opening?.generation],
    gcTime: 0,
    enabled: sourceId !== null,
    queryFn: () =>
      request<{ booking: ListedBooking }>('GET', `/api/bookings/${encodeURIComponent(sourceId!)}`),
  });
  return (
    <>
      {opening && (
        <div className="contact-source-status">
          <p className="contacts-note">
            Im Auszug steht der Kontaktanteil. Der Buchungsdialog zeigt die gesamte Zahlung mit
            allen Zeilen.
          </p>
          {source.isPending && <LoadingNote what="Ursprungsbuchungen" />}
          {source.isError && (
            <ErrorNote
              what="Ursprungsbuchungen"
              error={source.error}
              onRetry={() => void source.refetch()}
            />
          )}
          {!source.data && (
            <Button variant="ghost" onClick={onClose}>
              Öffnen abbrechen
            </Button>
          )}
        </div>
      )}
      <BookingPanel
        state={opening && source.data ? { mode: 'edit', booking: source.data.booking } : null}
        onClose={onClose}
      />
    </>
  );
}
