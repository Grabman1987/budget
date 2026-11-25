import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import type { ContactMovement, OpenContactOutlay } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { ReportTable } from '../reports/report-table';
import { request } from '../api/http';
import { BookingPanel } from '../ledger/booking-panel';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { ListedBooking } from '../ledger/types';
import { AppLink } from '../shell/app-link';
import { contactBalanceLine, contactBalanceWords } from './contact-balance';
import { giftInfo, groupByMonth, runningBalances } from './contact-statement-rows';
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

/** Payee only; a repayment without payee shows the contact. No kind words, memo or category. */
const recipient = (movement: ContactMovement, contactName: string) =>
  lineText(
    maskMoneyText(
      movement.payeeName?.trim() ||
        (movement.amountCents > 0 ? contactName : '') ||
        movement.memo?.trim() ||
        'Ohne Empfänger',
    ),
  );

const monthSummary = (name: string, balanceCents: number, current: boolean, title: string) => {
  const words = contactBalanceWords(balanceCents);
  const result =
    words.tone === 'plus'
      ? `${maskMoneyText(name)} schuldet dir ${words.amount}`
      : words.tone === 'minus'
        ? `Guthaben ${words.amount}`
        : 'ausgeglichen';
  return `${current ? 'Stand aktuell' : `Stand Ende ${title}`}: ${result}`;
};

/** One statement table: Datum, Empfänger, signed Betrag, Verrechnen. Presentation only. */
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
  register = false,
  totalCents,
  creditCents,
  creditHref,
}: {
  register?: boolean;
  totalCents?: number;
  creditCents?: number;
  creditHref?: string;
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
  // A tick only marks a row; the gift dialog opens from its own explicit button.
  const [skippedIds, setSkippedIds] = useState<ReadonlySet<string>>(new Set());
  const { giftReceiptIds, giftedByOutlay } = giftInfo(statement);
  const { monthEnd } = runningBalances(statement.movements);
  const shown = movements.filter((movement) => !giftReceiptIds.has(movement.splitId));
  // Month grouping with a running balance belongs to the report; the detail page is already
  // split into month sections.
  const groups = register
    ? groupByMonth(shown, monthEnd)
    : [{ key: 'all', title: '', rows: shown, endBalanceCents: 0 }];
  const asOfMonth = statement.asOf.slice(0, 7);
  const name = statement.contact.name;
  const rowInfo = (movement: ContactMovement) => {
    const outlay = statement.outlays.find((row) => row.splitId === movement.splitId);
    const giftedCents = giftedByOutlay.get(movement.splitId) ?? 0;
    const waived = !!outlay && giftedCents > 0 && outlay.remainingCents === 0;
    const rest =
      outlay && outlay.remainingCents > 0 && outlay.remainingCents < -movement.amountCents
        ? outlay.remainingCents
        : undefined;
    // Repayments (not gifts) that were allocated to this outlay: when did the contact settle it?
    const settlements = statement.receipts
      .filter(
        (row) =>
          !giftReceiptIds.has(row.receiptSplitId) &&
          row.allocations.some((a) => a.outlaySplitId === movement.splitId && a.amountCents > 0),
      )
      .flatMap((row) => {
        const receipt = statement.movements.find((m) => m.splitId === row.receiptSplitId);
        return receipt ? [receipt] : [];
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    return { outlay, giftedCents, waived, rest, settlements };
  };
  // Rebuilt from current rows/privacy on every render and again at the explicit click.
  // An earlier unmasked copy is never retained as fallback state.
  const text = () =>
    [
      lineText(maskMoneyText(name)),
      title,
      ...groups.flatMap((group) => [
        ...(register ? [group.title] : []),
        ...group.rows.map((movement) => {
          const { giftedCents, rest } = rowInfo(movement);
          return [
            longDay(movement.date),
            recipient(movement, name),
            eur(movement.amountCents, { sign: true }),
            ...(rest !== undefined ? [`Rest ${eur(rest)}`] : []),
            ...(giftedCents > 0 ? ['Geschenk'] : []),
          ].join(' · ');
        }),
        ...(register
          ? [monthSummary(name, group.endBalanceCents, group.key === asOfMonth, group.title)]
          : []),
      ]),
      ...(totalCents !== undefined ? [`Offen: ${eur(totalCents)}`] : []),
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
  // Report amounts stay in quiet ink: neither direction signals action or success.
  const renderRow = (movement: ContactMovement) => {
    const { outlay, giftedCents, waived, rest, settlements } = rowInfo(movement);
    const settledBy = settlements[settlements.length - 1];
    const repayment = statement.receipts.find((row) => row.receiptSplitId === movement.splitId);
    const bookingNote = movement.bookingMemo?.trim();
    const visible = recipient(movement, name);
    const sourceLabel = [
      `${description(movement)} ${longDay(movement.date)} · ${movementKind(movement)}`,
      movement.payeeName && maskMoneyText(movement.payeeName),
      bookingNote && bookingNote !== movement.memo?.trim() && maskMoneyText(bookingNote),
      movement.categoryName && `Kategorie: ${maskMoneyText(movement.categoryName)}`,
    ]
      .filter(Boolean)
      .join(' ');
    const canGift =
      !!onGift && !!outlay && outlay.remainingCents > 0 && !outlay.creditSourceSplitId;
    const skipped = canGift && skippedIds.has(movement.splitId);
    const checkTitle = waived
      ? 'Als Geschenk übernommen, wird nicht mehr verrechnet'
      : canGift
        ? skipped
          ? 'Nicht ausgewählt: Mit „Als Geschenk“ kannst du die Auslage übernehmen'
          : 'Ausgewählt zum Verrechnen. Abwählen, um sie als Geschenk zu übernehmen'
        : outlay && outlay.creditSourceSplitId
          ? 'Aus Kontaktguthaben entstanden, hier nicht änderbar'
          : outlay && outlay.remainingCents === 0
            ? 'Bereits ausgeglichen, nichts mehr zu verrechnen'
            : !onGift
              ? 'In dieser Ansicht nicht änderbar'
              : 'Hier nicht änderbar';
    return (
      <tr key={movement.splitId} className={waived ? 'contact-row-waived' : undefined}>
        <td className="contact-date">{longDay(movement.date)}</td>
        <td>
          <button
            type="button"
            className="contact-source"
            data-contact-source={movement.splitId}
            aria-label={`Ursprungsbuchung öffnen · ${sourceLabel} · Kontaktanteil ${eur(movement.amountCents, { sign: true })}${sourceLabel.toLowerCase().includes(visible.toLowerCase()) ? '' : ` · ${visible}`}`}
            onClick={() => onOpen(movement)}
          >
            {recipient(movement, name)}
          </button>
          {giftedCents > 0 && <span className="contact-gift-tag">Geschenk</span>}
          {outlay && settledBy && !waived && (
            <small className="contact-settled-note" data-contact-settled={movement.splitId}>
              {outlay.remainingCents === 0 ? 'Ausgeglichen' : 'Teilweise ausgeglichen'} am{' '}
              {longDay(settledBy.date)} ·{' '}
              <button
                type="button"
                className="contact-settled-link"
                onClick={() => onOpen(settledBy)}
              >
                Rückzahlung öffnen
              </button>
            </small>
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
                    {repayment.creditCents > 0 && ` · Guthaben: ${eur(repayment.creditCents)}`}
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
        <td className="n contact-amount">
          {eur(movement.amountCents, { sign: true })}
          {rest !== undefined && <small className="contact-rest">Rest {eur(rest)}</small>}
        </td>
        <td className="contact-settle">
          {outlay ? (
            <>
              <label className="contact-settle-box" title={checkTitle}>
                <input
                  type="checkbox"
                  checked={!waived && !skipped}
                  disabled={!canGift}
                  aria-label={`${description(movement)} verrechnen`}
                  onChange={() =>
                    setSkippedIds((previous) => {
                      const next = new Set(previous);
                      if (!next.delete(movement.splitId)) next.add(movement.splitId);
                      return next;
                    })
                  }
                />
              </label>
              {skipped && onGift && (
                <Button
                  variant="ghost"
                  className="contact-gift-action"
                  onClick={() => onGift(outlay)}
                >
                  Als Geschenk …
                </Button>
              )}
            </>
          ) : (
            <span
              className="contact-settle-none"
              title="Rückzahlungen werden nicht verrechnet, sie gleichen Auslagen aus"
              aria-label="Nicht verrechenbar"
            >
              –
            </span>
          )}
        </td>
      </tr>
    );
  };
  const rows = (
    <>
      <thead>
        <tr>
          <th scope="col">Datum</th>
          <th scope="col">Empfänger</th>
          <th scope="col" className="n">
            Betrag
          </th>
          <th
            scope="col"
            className="contact-settle-head"
            title="Haken: wird mit Rückzahlungen verrechnet. Ohne Haken: als Geschenk übernehmen. Rückzahlungen, Geschenke und bereits ausgeglichene Auslagen haben keinen änderbaren Haken."
          >
            Verrechnen
          </th>
        </tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.key}>
          {register && group.rows.length > 0 && (
            <tr className="contact-month-head">
              <td colSpan={4}>{group.title}</td>
            </tr>
          )}
          {group.rows.map(renderRow)}
          {register && group.rows.length > 0 && (
            <tr className="contact-month-summary">
              <td colSpan={4}>
                {monthSummary(name, group.endBalanceCents, group.key === asOfMonth, group.title)}
              </td>
            </tr>
          )}
        </tbody>
      ))}
      {totalCents !== undefined && (
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Offen: <span className="sr-only">von {maskMoneyText(name)}</span>
            </th>
            <td className="n">{eur(totalCents)}</td>
            <td />
          </tr>
          {!!creditCents && (
            <tr>
              <th scope="row" colSpan={2}>
                Guthaben:
              </th>
              <td className="n">{eur(creditCents)}</td>
              <td>{creditHref && <AppLink to={creditHref}>Guthaben ändern</AppLink>}</td>
            </tr>
          )}
        </tfoot>
      )}
    </>
  );
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
      {register ? (
        <ReportTable caption={caption} regionLabel={caption} className="contact-report-register">
          {rows}
        </ReportTable>
      ) : (
        <table className="contacts-table contact-movements">
          <caption className="sr-only">{caption}</caption>
          {rows}
        </table>
      )}
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
