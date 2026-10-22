import { Button, useAmountPrivacy } from '@budget/ui';
import { ChevronDown } from 'lucide-react';
import '../nav/disclosure-icons.css';
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

/**
 * The one quick-assign call (server action, one undo group): every entry point (inspector, envelope
 * panel, "Verteilen ▾" in the plan toolbar) goes through here, so the bookings are identical.
 */
export function useQuickAssign(month: string) {
  const write = useBudgetWrite();
  const [busy, setBusy] = useState(false);
  const apply = async (mode: QuickAssignMode, ids: string[]) => {
    setBusy(true);
    await write(
      () => quickAssign(month, mode, ids),
      (res) =>
        `${categories(res.changedCount)} ${mode === 'empty' ? 'befüllt' : 'zugewiesen'}${
          res.openCount ? ` · ${eur(res.missingCents)} fehlen für ${categories(res.openCount)}` : ''
        }`,
    );
    setBusy(false);
  };
  return { busy, apply };
}

/** One server action and one undo for every selection, in the current table order. */
export function QuickAssignActions({
  month,
  emptyIds,
  selectedIds,
  inline = false,
}: {
  month: string;
  emptyIds: string[];
  selectedIds: string[];
  inline?: boolean;
}) {
  useAmountPrivacy();
  const quick = useQuickAssign(month);
  const busy = quick.busy;
  const apply = (mode: QuickAssignMode) =>
    quick.apply(mode, mode === 'empty' ? emptyIds : selectedIds);
  const actions = (
    <div className={inline ? 'quick-assign-inline' : 'plan-popover-content'}>
      {!inline && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !emptyIds.length}
          onClick={() => void apply('empty')}
        >
          Leere füllen
        </Button>
      )}
      {selectedIds.length > 0 && (
        <div role="group" aria-label={`Zuweisen für ${categories(selectedIds.length)}`}>
          {!inline && <span>{categories(selectedIds.length)} ausgewählt</span>}
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
  return inline ? (
    actions
  ) : (
    <details className="quick-assign-actions plan-popover">
      <summary>
        Schnell zuweisen <ChevronDown className="disclosure-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
      </summary>
      {actions}
    </details>
  );
}
