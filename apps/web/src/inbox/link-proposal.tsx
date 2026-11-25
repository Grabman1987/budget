import { Button } from '@budget/ui';
import { useBudgetWrite } from '../budget/use-category-writes';
import { linkOccurrence } from '../expected/api';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import type { InboxStored } from './api';

/**
 * Konten › Prüfen: an ambiguous or deviating debit of a recurring payment waits here (#1102).
 * "Zuordnen" links the booking to the occurrence through the audited link write, so the toast
 * offers "Rückgängig" for exactly this step; dismissing is the row's own "Nicht zuordnen".
 */
export function LinkProposalAction({
  item,
  disabled,
  onOpenBooking,
}: {
  item: InboxStored;
  disabled: boolean;
  /** Opens the proposed booking (redesign: next to "Bestätigen" / "Ablehnen", #1345). */
  onOpenBooking?: (bookingId: string) => void;
}) {
  const write = useBudgetWrite();
  const proposal = item.linkProposal;
  if (!proposal) return null;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() =>
          void write(
            () => linkOccurrence(proposal.occurrenceId, proposal.bookingId),
            () => 'Abbuchung zugeordnet.',
          )
        }
      >
        {REDESIGN_ENABLED ? 'Bestätigen' : 'Zuordnen'}
      </Button>
      {REDESIGN_ENABLED && onOpenBooking && (
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onOpenBooking(proposal.bookingId)}
        >
          Buchung öffnen
        </Button>
      )}
    </>
  );
}
