import { Button, useAmountPrivacy } from '@budget/ui';
import { overspentEnvelopes, type QuickAssignMode } from '@budget/domain';
import { useState } from 'react';
import { BarChart3, ChevronRight, History, PaintBucket, RotateCcw, Target } from 'lucide-react';
import { inspectorQuickAssign, type PlanRow } from './plan-model';
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
  preview,
}: {
  month: string;
  emptyIds: string[];
  selectedIds: string[];
  inline?: boolean;
  /** Inspector-only: exact ordered action scope from the displayed month, not all loaded rows. */
  preview?: { rows: PlanRow[]; tba: number; scopeLabel: string };
}) {
  useAmountPrivacy();
  const quick = useQuickAssign(month);
  const busy = quick.busy;
  if (preview) {
    const actions = [
      ['last-month', 'Wie letzter Monat', History],
      ['average', 'Ø 3 Monate', BarChart3],
      ['target', 'Ziele', Target],
      ['empty', 'Leere füllen', PaintBucket],
      ['reset', 'Auf 0 zurücksetzen', RotateCcw],
    ] as const;
    return (
      <section className="inspector-quick" aria-label="Automatisch zuweisen">
        <h3 className="panel-h">Automatisch zuweisen</h3>
        <p className="panel-sub">{preview.scopeLabel}</p>
        <p className="panel-sub">{!preview.rows.length ? 'Keine zuweisbaren Kategorien in dieser Auswahl.'
          : preview.rows.some((row) => row.needCents > 0) || overspentEnvelopes({ envelopes: preview.rows }).length
            ? `${overspentEnvelopes({ envelopes: preview.rows }).length} überzogen, ${preview.rows.filter((row) => row.needCents > 0).length} unterfinanziert`
            : 'Nichts ist unterfinanziert oder überzogen.'}</p>
        <div className="inspector-quick-rows">
          {actions.map(([mode, label, Icon]) => {
            const plan = inspectorQuickAssign(preview.rows, mode, preview.tba);
            return (
              <div key={mode}>
                <Button variant="ghost" className="inspector-quick-row"
                  disabled={busy || plan.ids.length === 0 || plan.deltaCents === 0}
                  onClick={() => void quick.apply(mode, plan.ids)}>
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>{label}</span>
                  <span className="insp-amount">{eur(plan.deltaCents, { sign: true })}</span>
                  <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
                </Button>
                {plan.openCount > 0 && <p className="panel-sub inspector-quick-limit">
                  Zu verteilen: {eur(preview.tba)} · auf freies Geld begrenzt · {eur(plan.missingCents)} fehlen für {categories(plan.openCount)}.
                </p>}
              </div>
            );
          })}
        </div>
      </section>
    );
  }
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
      <summary>Schnell zuweisen ▾</summary>
      {actions}
    </details>
  );
}
