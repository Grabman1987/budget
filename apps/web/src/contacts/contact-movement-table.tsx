import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import type { ContactMovement, OpenContactOutlay } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
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

/** Purpose of an advance (recorded), else the category the share stayed in; empty if none. */
const purposeOf = (movement: ContactMovement) =>
  lineText(
    maskMoneyText(
      movement.purposeName?.trim() || (movement.categoryId ? movement.categoryName : '') || '',
    ),
  );
const noteOf = (movement: ContactMovement) =>
  lineText(maskMoneyText(movement.memo?.trim() || movement.bookingMemo?.trim() || ''));

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
  const balances = runningBalances(statement.movements);
  const { monthEnd } = balances;
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
            ...(purposeOf(movement) ? [`Zweck ${purposeOf(movement)}`] : []),
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
    const kind = movementKind(movement);
    const purpose = purposeOf(movement);
    const note = noteOf(movement);
    const outlayCents = movement.amountCents < 0 ? -movement.amountCents : 0;
    const backCents = movement.amountCents > 0 ? movement.amountCents : 0;
    const balance = balances.after.get(movement.splitId);
    const allocated = repayment?.recorded ? repayment.allocations.length : 0;
    const status = waived
      ? 'Geschenk'
      : outlay
        ? outlay.remainingCents === 0
          ? settledBy
            ? null
            : 'ausgeglichen'
          : rest !== undefined
            ? `offen, Rest ${eur(rest)}`
            : 'offen'
        : repayment?.recorded && (allocated > 0 || repayment.creditCents > 0)
          ? [
              allocated > 0 ? `deckt ${allocated} ${allocated === 1 ? 'Auslage' : 'Auslagen'}` : '',
              repayment.creditCents > 0 ? `+ Guthaben ${eur(repayment.creditCents)}` : '',
            ]
              .filter(Boolean)
              .join(' ')
          : '–';
    const openRow = (event: React.MouseEvent) => {
      // Controls inside the row keep their own action.
      if ((event.target as HTMLElement).closest('button, input, label, a')) return;
      onOpen(movement);
    };
    return (
      // The Empfänger cell holds the keyboard-accessible button; the row click is a pointer shortcut.
      <tr
        key={movement.splitId}
        className={`contact-row${waived ? ' contact-row-waived' : ''}`}
        onClick={openRow}
      >
        <td className="contact-date c-date">{longDay(movement.date)}</td>
        <td className="c-art">
          <span className="contact-art">{kind}</span>
        </td>
        <td className="c-payee">
          <button
            type="button"
            className="contact-source"
            data-contact-source={movement.splitId}
            data-kind={kind}
            aria-label={`Ursprungsbuchung öffnen · ${sourceLabel} · Kontaktanteil ${eur(movement.amountCents, { sign: true })}${sourceLabel.toLowerCase().includes(visible.toLowerCase()) ? '' : ` · ${visible}`}`}
            onClick={() => onOpen(movement)}
          >
            {visible}
          </button>
        </td>
        <td className="c-purpose" title={purpose || undefined}>
          {purpose}
        </td>
        <td className="c-note" title={note || undefined}>
          {note}
        </td>
        <td className="n contact-amount c-out">{outlayCents ? eur(outlayCents) : ''}</td>
        <td className="n contact-amount c-back">
          {backCents ? (
            eur(backCents)
          ) : giftedCents > 0 ? (
            <span className="contact-gift-tag">Geschenk {eur(giftedCents)}</span>
          ) : (
            ''
          )}
        </td>
        <td className="n c-bal">{balance === undefined ? '' : eur(balance)}</td>
        <td className="c-status">
          {status === null && settledBy ? (
            <button
              type="button"
              className="contact-settled-link"
              data-contact-settled={movement.splitId}
              // The accessible name starts with the visible text (axe label-content-name-mismatch).
              aria-label={`ausgeglichen ${settledBy.date.slice(8, 10)}.${settledBy.date.slice(5, 7)}. – Rückzahlung vom ${longDay(settledBy.date)} öffnen`}
              onClick={() => onOpen(settledBy)}
            >
              ausgeglichen {settledBy.date.slice(8, 10)}.{settledBy.date.slice(5, 7)}.
            </button>
          ) : (
            status
          )}
          {repayment && repayment.allocatable !== false && onAllocate && (
            <Button
              variant="ghost"
              className="contact-allocate"
              aria-label="Zuordnung ändern"
              title="Zuordnung ändern"
              onClick={() => onAllocate(movement.splitId)}
            >
              <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
            </Button>
          )}
        </td>
        <td className="contact-settle c-settle">
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
  const monthSums = (group: { rows: ContactMovement[] }) => ({
    out: group.rows.reduce((sum, m) => (m.amountCents < 0 ? sum - m.amountCents : sum), 0),
    back: group.rows.reduce((sum, m) => (m.amountCents > 0 ? sum + m.amountCents : sum), 0),
  });
  const rows = (
    <>
      <thead>
        <tr>
          <th scope="col" className="c-date">
            Datum
          </th>
          <th scope="col" className="c-art">
            Art
          </th>
          <th scope="col" className="c-payee">
            Empfänger
          </th>
          <th scope="col" className="c-purpose">
            Zweck
          </th>
          <th scope="col" className="c-note">
            Notiz
          </th>
          <th scope="col" className="n c-out">
            Ausgelegt
          </th>
          <th scope="col" className="n c-back">
            Zurück
          </th>
          <th scope="col" className="n c-bal">
            Stand
          </th>
          <th scope="col" className="c-status">
            Status
          </th>
          <th
            scope="col"
            className="contact-settle-head c-settle"
            title="Haken: wird mit Rückzahlungen verrechnet. Ohne Haken: als Geschenk übernehmen. Rückzahlungen, Geschenke und bereits ausgeglichene Auslagen haben keinen änderbaren Haken."
          >
            Verrechnen
          </th>
        </tr>
      </thead>
      {groups.map((group) => {
        const sums = monthSums(group);
        return (
          <tbody key={group.key}>
            {register && group.rows.length > 0 && (
              <tr className="contact-month-head">
                <td className="c-date">{group.title}</td>
                <td className="c-art" />
                <td className="c-payee" />
                <td className="c-purpose" />
                <td className="c-note" />
                <td className="n c-out">{sums.out ? eur(sums.out) : ''}</td>
                <td className="n c-back">{sums.back ? eur(sums.back) : ''}</td>
                <td className="n c-bal">{eur(group.endBalanceCents)}</td>
                <td className="c-status" />
                <td className="c-settle" />
              </tr>
            )}
            {group.rows.map(renderRow)}
          </tbody>
        );
      })}
      {totalCents !== undefined && (
        <tfoot>
          {[
            { label: 'Offen:', cents: totalCents, key: 'open' },
            ...(creditCents ? [{ label: 'Guthaben:', cents: creditCents, key: 'credit' }] : []),
          ].map((line) => (
            <tr className="contact-foot" key={line.key}>
              <th scope="row" className="c-date">
                {line.label}
                {line.key === 'open' && <span className="sr-only"> von {maskMoneyText(name)}</span>}
              </th>
              <td className="c-art" />
              <td className="c-payee" />
              <td className="c-purpose" />
              <td className="c-note" />
              <td className="c-out" />
              <td className="c-back" />
              <td className="n c-bal">{eur(line.cents)}</td>
              <td className="c-status">
                {line.key === 'credit' && creditHref && (
                  <AppLink to={creditHref}>Guthaben ändern</AppLink>
                )}
              </td>
              <td className="c-settle" />
            </tr>
          ))}
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
        <ReportTable
          caption={caption}
          regionLabel={caption}
          className="contact-ledger contact-report-register"
        >
          {rows}
        </ReportTable>
      ) : (
        <table className="contacts-table contact-ledger contact-movements">
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
