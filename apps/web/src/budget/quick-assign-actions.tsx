import { Button, useAmountPrivacy } from '@budget/ui';
import type { QuickAssignMode } from '@budget/domain';
import { useState } from 'react';
import { eur } from '../ledger/format';
import { quickAssign } from './budget-api';
import { useBudgetWrite } from './use-category-writes';

const QUICK = [
  ['last-month', 'Wie letzter Monat'],
  ['average', 'Ø 3 Monate'],
  ['target', 'Ziel'],
] as const;
const categories = (n: number) => `${n} ${n === 1 ? 'Kategorie' : 'Kategorien'}`;

/** One server action and one undo for every selection, in the current table order. */
export function QuickAssignActions({
  month,
  emptyIds,
  selectedIds,
}: {
  month: string;
  emptyIds: string[];
  selectedIds: string[];
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [busy, setBusy] = useState(false);
  const apply = async (mode: QuickAssignMode) => {
    setBusy(true);
    await write(
      () => quickAssign(month, mode, mode === 'empty' ? emptyIds : selectedIds),
      (res) =>
        `${categories(res.changedCount)} ${mode === 'empty' ? 'befüllt' : 'zugewiesen'}${
          res.openCount ? ` · ${eur(res.missingCents)} fehlen für ${categories(res.openCount)}` : ''
        }`,
    );
    setBusy(false);
  };
  return (
    <div className="quick-assign-actions" aria-label="Schnell zuweisen">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy || !emptyIds.length}
        onClick={() => void apply('empty')}
      >
        Leere füllen
      </Button>
      {selectedIds.length > 0 && (
        <div role="group" aria-label={`Zuweisen für ${categories(selectedIds.length)}`}>
          <span>{categories(selectedIds.length)} ausgewählt</span>
          {QUICK.map(([mode, label]) => (
            <Button
              key={mode}
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void apply(mode)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
