import { freedomSumCents, quickAssignPlan, type QuickAssignMode } from '@budget/domain';
import { Button, useAmountPrivacy } from '@budget/ui';
import { ArrowLeftRight, ChevronRight, Copy, RotateCcw, Target, TrendingUp } from 'lucide-react';
import { eur } from '../ledger/format';
import type { PlanRow } from './plan-model';
import { useQuickAssign } from './quick-assign-actions';

/** The exact existing planner items, expressed as the signed change this action will book. */
export function automaticAssignment(rows: Parameters<typeof quickAssignPlan>[0], mode: QuickAssignMode, tba: number) {
  const plan = quickAssignPlan(rows, mode, tba);
  const before = new Map(rows.map((row) => [row.categoryId, row.assignedCents]));
  const deltaCents = freedomSumCents(plan.items.flatMap((item) => [item.assignedCents, -before.get(item.categoryId)!]));
  if (deltaCents === null) throw new RangeError('Quick assignment delta exceeds safe cents');
  return { ...plan, deltaCents };
}
const ACTIONS = [
  ['last-month', 'Wie letzter Monat', Copy],
  ['average', 'Ø 3 Monate', TrendingUp],
  ['target', 'Ziele', Target],
  ['empty', 'Leere füllen', ArrowLeftRight],
  ['reset', 'Auf 0 zurücksetzen', RotateCcw],
] as const;

export function PlanAutomatic({ month, rows, tba, disabled = false }: { month: string; rows: PlanRow[]; tba: number; disabled?: boolean }) {
  useAmountPrivacy();
  const quick = useQuickAssign(month);
  // The canonical read enriches exactly classed spending categories, including legacy rows.
  const eligible = rows.filter((row) => row.cls);
  const overspent = eligible.filter((row) => row.overspentCents > 0).length;
  const underfunded = eligible.filter((row) => row.needCents > 0).length;
  return (
    <section className="plan-automatic" aria-label="Automatisch zuweisen">
      <p className="panel-sub">{overspent || underfunded ? `${overspent} überzogen, ${underfunded} unterfinanziert` : 'Nichts ist unterfinanziert oder überzogen'}</p>
      {disabled && <p className="panel-sub">Nur bei einem Monat</p>}
      {ACTIONS.map(([mode, label, Icon]) => {
        const preview = automaticAssignment(eligible, mode, tba);
        return (
          <div key={mode}>
            <Button variant="ghost" className="plan-automatic-row" aria-label={`${label} ${eur(preview.deltaCents, { sign: true })}`} disabled={disabled || quick.busy || preview.changedCount === 0} onClick={() => void quick.apply(mode, eligible.map((row) => row.id))}>
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{label}</span>
              <strong className="plan-money">{eur(preview.deltaCents, { sign: true })}</strong>
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </Button>
            {preview.missingCents > 0 && <p className="panel-sub"><span className="plan-money">{eur(preview.missingCents)}</span> fehlen für {preview.openCount} {preview.openCount === 1 ? 'Kategorie' : 'Kategorien'} · auf Zu verteilen begrenzt</p>}
          </div>
        );
      })}
    </section>
  );
}
