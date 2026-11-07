import { eur } from '../ledger/format';
import { coverOverspending } from './budget-api';
import type { PlanRow } from './plan-model';
import { useBudgetWrite } from './use-category-writes';

/**
 * "Decken" of an overspent envelope (triage bar and envelope panel). From "Zu verteilen" the server
 * may assign beyond what it holds (#982). A refusal (422 `category_rule`) shows its German message as a toast.
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
