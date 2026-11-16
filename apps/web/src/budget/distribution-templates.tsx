import {
  cents,
  formatDecimal,
  freedomSumCents,
  parseAmount,
  quickAssignPlan,
} from '@budget/domain';
import { AmountInput, Button } from '@budget/ui';
import { useState } from 'react';
import type { IntendedAssignment } from '@budget/domain';
import { eur } from '../ledger/format';
import { overAssignmentHint, type PlanRow } from './plan-model';

/** Local preview only; confirmation uses the flow's existing guarded, audited assignment. */
export function DistributionTemplates({
  rows,
  tba,
  busy,
  onApply,
}: {
  rows: PlanRow[];
  tba: number;
  busy: boolean;
  onApply: (items: IntendedAssignment[]) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const eligible = rows.filter(
    (row) => row.cls && !row.target && row.kind !== 'card_payment' && row.quickAssign,
  );
  const edited = eligible.filter((row) => draft?.[row.id] !== undefined);
  const parsed = edited.map((row) => ({ row, amount: parseAmount(draft![row.id]!) }));
  const valid = parsed.every(({ amount }) => amount.ok && amount.cents >= 0);
  const items = parsed.flatMap(({ row, amount }) =>
    amount.ok && amount.cents !== row.assignedCents
      ? [{ categoryId: row.id, assignedCents: amount.cents }]
      : [],
  );
  const delta = freedomSumCents(
    parsed.flatMap(({ row, amount }) => (amount.ok ? [amount.cents, -row.assignedCents] : [])),
  );
  const remaining = delta === null ? null : freedomSumCents([tba, -delta]);
  const hint = remaining === null ? undefined : overAssignmentHint(remaining);
  return (
    <section aria-label="Verteilungsvorlagen" className="distribute-row-action">
      <h4>Vorlage für Kategorien ohne Ziel</h4>
      <p className="distribute-note">
        Vorschau prüfen und Beträge anpassen. Erst „Vorlage zuweisen“ speichert.
      </p>
      {(['last-month', 'average'] as const).map((mode) => {
        const available = eligible.some((row) =>
          (mode === 'last-month' ? row.quickAssign?.lastMonthCents : row.quickAssign?.averageCents)
            ? true
            : false,
        );
        const reason =
          mode === 'last-month'
            ? 'Keine historischen Zuweisungen für Kategorien ohne Ziel vorhanden.'
            : 'Keine historischen Ausgaben für Kategorien ohne Ziel vorhanden.';
        return (
          <div key={mode}>
            <Button
              variant="ghost"
              disabled={busy || !available}
              aria-describedby={!available ? `template-${mode}-reason` : undefined}
              onClick={() => {
                const preview = quickAssignPlan(eligible, mode, tba);
                setDraft(
                  Object.fromEntries(
                    eligible.map((row) => [
                      row.id,
                      formatDecimal(
                        cents(
                          preview.items.find((item) => item.categoryId === row.id)?.assignedCents ??
                            row.assignedCents,
                        ),
                      ),
                    ]),
                  ),
                );
              }}
            >
              {mode === 'last-month' ? 'Wie letzter Monat' : 'Ø 3 Monate'}
            </Button>
            {!available && (
              <p className="distribute-note" id={`template-${mode}-reason`}>
                {reason}
              </p>
            )}
          </div>
        );
      })}
      {draft !== null && (
        <>
          <p className="distribute-note">
            Wie letzter Monat übernimmt die Zuweisungen; Ø 3 Monate nutzt die historischen Ausgaben.
            Die Vorlage ist auf „Zu verteilen“ begrenzt.
          </p>
          {edited.map((row) => (
            <AmountInput
              key={row.id}
              label={`${row.name} · Zugewiesen`}
              value={draft[row.id]!}
              disabled={busy}
              onChange={(value) => setDraft({ ...draft, [row.id]: value })}
            />
          ))}
          {(!valid || remaining === null) && (
            <p role="alert">Bitte gültige, nicht negative Beträge eingeben.</p>
          )}
          {valid && remaining !== null && (
            <p className="distribute-note" aria-live="polite">
              Danach zu verteilen: {eur(remaining)}
            </p>
          )}
          {valid && hint && (
            <p className="distribute-alert" role="note">
              {hint}
            </p>
          )}
          <Button
            disabled={busy || !valid || remaining === null || items.length === 0}
            onClick={() => onApply(items)}
          >
            Vorlage zuweisen
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
            Vorschau verwerfen
          </Button>
        </>
      )}
    </section>
  );
}
