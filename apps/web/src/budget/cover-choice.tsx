import { useAmountPrivacy, Button } from '@budget/ui';
import { eur } from '../ledger/format';
import { coverOverspending } from './budget-api';
import { coverFromToBeAssigned, type PlanRow } from './plan-model';
import { useBudgetWrite } from './use-category-writes';

/**
 * "Decken" of an overspent envelope (triage bar and envelope panel). From "Zu verteilen" the server
 * covers at most what it holds. A refusal (422 `category_rule`) shows its German message as a toast.
 */
export function useCover(month: string, sourceName: (id: string) => string | undefined) {
  const write = useBudgetWrite();
  return (r: PlanRow, fromId: string | null) =>
    write(
      () => coverOverspending(month, r.id, fromId),
      (res) => {
        const rest = r.overspentCents - res.coveredCents;
        const from = fromId ? sourceName(fromId) : 'Zu verteilen';
        return `${eur(res.coveredCents)} von ${from} zu ${r.name} verschoben${rest > 0 ? ` · ${eur(rest)} bleiben offen${fromId ? ' · auf freies Geld begrenzt' : ''}` : ''}`;
      },
    );
}

/**
 * Confirm a partial cover from "Zu verteilen" without creating negative money.
 */
export function CoverChoice({
  overspentCents,
  toBeAssignedCents,
  onCover,
  onCancel,
}: {
  overspentCents: number;
  toBeAssignedCents: number;
  onCover: () => void;
  onCancel: () => void;
}) {
  useAmountPrivacy();
  const { capCents } = coverFromToBeAssigned(overspentCents, toBeAssignedCents);
  return (
    <div className="cover-choice" role="group" aria-label="Decken aus Zu verteilen">
      <p className="panel-sub">
        {capCents > 0
          ? `„Zu verteilen“ hat nur ${eur(capCents)} der ${eur(overspentCents)}.`
          : `„Zu verteilen“ hat nichts übrig (${eur(toBeAssignedCents)}).`}
      </p>
      <div className="panel-actions">
        {capCents > 0 && (
          <Button size="sm" onClick={onCover}>
            Nur {eur(capCents)} decken
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
