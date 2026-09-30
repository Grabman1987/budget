import { Button } from '@budget/ui';
import { eur } from '../ledger/format';
import { coverOverspending } from './budget-api';
import { coverFromToBeAssigned, type PlanRow } from './plan-model';
import { useBudgetWrite } from './use-category-writes';

/**
 * "Decken" of an overspent envelope (triage bar and envelope panel). From "Zu verteilen" the server
 * covers at most what it holds; the full amount only with `allowNegative`. A refusal (422
 * `category_rule`) shows its German message as a toast.
 */
export function useCover(month: string, sourceName: (id: string) => string | undefined) {
  const write = useBudgetWrite();
  return (r: PlanRow, fromId: string | null, allowNegative = false) =>
    write(
      () => coverOverspending(month, r.id, fromId, allowNegative),
      (res) => {
        const rest = r.overspentCents - res.coveredCents;
        const from = fromId ? sourceName(fromId) : 'Zu verteilen';
        return `${eur(res.coveredCents)} von ${from} zu ${r.name} verschoben${rest > 0 ? ` · ${eur(rest)} bleiben offen` : ''}`;
      },
    );
}

/**
 * The choice when "Zu verteilen" cannot cover all of the overspending: "Nur x decken" (default)
 * and the explicit "Trotzdem ganz decken", which takes "Zu verteilen" below 0. When it holds
 * nothing, only the explicit one is offered. It never goes negative silently.
 */
export function CoverChoice({
  overspentCents,
  toBeAssignedCents,
  onCover,
  onCancel,
}: {
  overspentCents: number;
  toBeAssignedCents: number;
  onCover: (allowNegative: boolean) => void;
  onCancel: () => void;
}) {
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
          <Button size="sm" onClick={() => onCover(false)}>
            Nur {eur(capCents)} decken
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onCover(true)}>
          Trotzdem ganz decken (Zu verteilen wird negativ)
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
