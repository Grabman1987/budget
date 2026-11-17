import { Button } from '@budget/ui';
import { useBudgetWrite } from '../budget/use-category-writes';
import { linkOccurrence } from '../expected/api';
import type { InboxStored } from './api';

/**
 * Konten › Prüfen: an ambiguous or deviating debit of a recurring payment waits here (#1102).
 * "Zuordnen" links the booking to the occurrence through the audited link write, so the toast
 * offers "Rückgängig" for exactly this step; dismissing is the row's own "Nicht zuordnen".
 */
export function LinkProposalAction({ item, disabled }: { item: InboxStored; disabled: boolean }) {
  const write = useBudgetWrite();
  const proposal = item.linkProposal;
  if (!proposal) return null;
  return (
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
      Zuordnen
    </Button>
  );
}
