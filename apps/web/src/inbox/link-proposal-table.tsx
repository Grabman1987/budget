import { Button, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { nativeCurrency, shortDay } from '../ledger/format';
import { linkOccurrence } from '../expected/api';
import type { InboxStored } from './api';

type Proposal = InboxStored & { linkProposal: NonNullable<InboxStored['linkProposal']> };
type View = NonNullable<NonNullable<InboxStored['linkProposal']>['view']>;

export const hasLinkProposalView = (item: { type: string }): item is Proposal =>
  item.type === 'stored' && Boolean((item as InboxStored).linkProposal?.view);

/** Several candidate bookings of one occurrence become one row with a choice. */
export function groupLinkProposals(items: Proposal[]): Proposal[][] {
  const byOccurrence = new Map<string, Proposal[]>();
  for (const item of items) {
    const key = item.linkProposal.occurrenceId;
    byOccurrence.set(key, [...(byOccurrence.get(key) ?? []), item]);
  }
  return [...byOccurrence.values()];
}

const hint = (view: View, several: boolean) => {
  const parts: string[] = [];
  if (several) parts.push('mehrere möglich');
  if (view.expectedAmountCents !== view.bookingAmountCents) {
    const diff = view.bookingAmountCents - view.expectedAmountCents;
    parts.push(`Abweichung ${nativeCurrency(diff, view.currency, true)}`);
  }
  if (view.reason && !/mehrere|abweich|betrag/i.test(view.reason)) parts.push(view.reason);
  return parts;
};

const bookingLabel = (view: View) =>
  `${shortDay(view.bookingDate)} · ${nativeCurrency(view.bookingAmountCents, view.currency, true)}`;

function LinkProposalTableRow({
  options,
  busy,
  onOpenBooking,
  onReject,
}: {
  options: Proposal[];
  busy: boolean;
  onOpenBooking: (bookingId: string) => void;
  onReject: (item: InboxStored) => void;
}) {
  const write = useBudgetWrite();
  const [chosen, setChosen] = useState(options[0]!.id);
  const item = options.find((option) => option.id === chosen) ?? options[0]!;
  const proposal = item.linkProposal;
  const view = proposal.view!;
  const several = options.length > 1;
  const differs = view.expectedAmountCents !== view.bookingAmountCents;
  return (
    <tr className="link-proposal-row">
      <th scope="row" className="lp-name">
        <strong>{view.paymentName}</strong>
        {view.payeeName && <small>{view.payeeName}</small>}
      </th>
      <td className="lp-due" data-label="Fällig">
        {shortDay(view.dueDate)}
      </td>
      <td className="lp-expected num" data-label="Erwartet">
        {nativeCurrency(view.expectedAmountCents, view.currency, true)}
      </td>
      <td className="lp-booking" data-label="Buchung">
        {several ? (
          <select
            className="select"
            aria-label={`Buchung wählen · ${view.paymentName}`}
            value={item.id}
            disabled={busy}
            onChange={(event) => setChosen(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {bookingLabel(option.linkProposal.view!)}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            className="lp-booking-link"
            disabled={busy}
            onClick={() => onOpenBooking(proposal.bookingId)}
          >
            <span className={differs ? 'lp-differs' : undefined}>{bookingLabel(view)}</span>
          </button>
        )}
      </td>
      <td className="lp-hint" data-label="Hinweis">
        {hint(view, several).join(' · ')}
      </td>
      <td className="lp-actions">
        <Button
          size="sm"
          variant="ghost"
          className="lp-primary"
          disabled={busy}
          onClick={() =>
            void write(
              () => linkOccurrence(proposal.occurrenceId, proposal.bookingId),
              () => 'Abbuchung zugeordnet.',
            )
          }
        >
          Zuordnen
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onReject(item)}>
          Ablehnen
        </Button>
        {several && (
          <button
            type="button"
            className="lp-booking-link"
            disabled={busy}
            onClick={() => onOpenBooking(proposal.bookingId)}
          >
            Buchung öffnen
          </button>
        )}
      </td>
    </tr>
  );
}

/** Konten › Prüfen › Wiederkehrende Zahlungen: one compact row per occurrence (#1102, owner 26.11.2026). */
export function LinkProposalTable({
  items,
  busyId,
  onOpenBooking,
  onReject,
}: {
  items: Proposal[];
  busyId: string | null;
  onOpenBooking: (bookingId: string) => void;
  onReject: (item: InboxStored) => void;
}) {
  useAmountPrivacy();
  return (
    <table className="link-proposal-table">
      <caption className="sr-only">Wiederkehrende Zahlungen zuordnen</caption>
      <thead>
        <tr>
          <th scope="col">Zahlung</th>
          <th scope="col">Fällig</th>
          <th scope="col">Erwartet</th>
          <th scope="col">Buchung</th>
          <th scope="col">Hinweis</th>
          <th scope="col">
            <span className="sr-only">Aktion</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {groupLinkProposals(items).map((options) => (
          <LinkProposalTableRow
            key={options[0]!.linkProposal.occurrenceId}
            options={options}
            busy={options.some((option) => option.id === busyId)}
            onOpenBooking={onOpenBooking}
            onReject={onReject}
          />
        ))}
      </tbody>
    </table>
  );
}
