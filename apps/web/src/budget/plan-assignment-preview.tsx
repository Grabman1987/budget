import { useState } from 'react';
import { Field, Select, useAmountPrivacy } from '@budget/ui';
import { eur } from '../ledger/format';
import { monthLabel } from '../nav/month';
import { automaticAssignment } from './plan-automatic';
import { moveGuard, type PlanRow } from './plan-model';

type PreviewMode = 'target' | 'reset';

function exclusion(row: PlanRow, mode: PreviewMode): string | null {
  if (row.kind === 'card_payment') return 'Kartenreserve – keine automatische Zuweisung';
  if (!row.cls) return 'Keine Ausgabenkategorie';
  if (mode === 'target' && !row.target) return 'Kein Ziel';
  if (mode === 'target' && !row.quickAssign) return 'Zuweisungsdaten nicht verfügbar';
  return null;
}

/** Advisory only: target funding permits overdraft planning; reset retains its funding cap. */
export function selectedAssignmentPreview(rows: PlanRow[], mode: PreviewMode, tba: number) {
  const plan = automaticAssignment(
    rows.filter((row) => !exclusion(row, mode)),
    mode,
    tba,
  );
  const assigned = new Map(plan.items.map((item) => [item.categoryId, item.assignedCents]));
  return {
    ...plan,
    rows: rows.map((row) => {
      const afterCents = assigned.get(row.categoryId) ?? row.assignedCents;
      const deltaCents = afterCents - row.assignedCents;
      const reason = exclusion(row, mode);
      return {
        row,
        reason,
        afterCents,
        deltaCents,
        missingCents: reason
          ? null
          : mode === 'reset'
            ? Math.abs(afterCents)
            : Math.max(0, row.needCents - deltaCents),
      };
    }),
  };
}

export function PlanAssignmentPreview({
  month,
  rows,
  tba,
  disabled = false,
}: {
  month: string;
  rows: PlanRow[];
  tba: number;
  disabled?: boolean;
}) {
  useAmountPrivacy();
  const [mode, setMode] = useState<PreviewMode>('target');
  const preview = selectedAssignmentPreview(disabled ? [] : rows, mode, tba);
  return (
    <details className="inspector-section">
      <summary>Zuweisungsvorschau</summary>
      <section className="inspector-selection kform" aria-label="Zuweisungsvorschau">
        <p className="panel-sub">
          {monthLabel(month)} · Nur Vorschau. Es wird nichts zugewiesen. Die Reihenfolge entspricht
          der Auswahl im Plan.
        </p>
        <Field label="Vorschau für">
          {({ id }) => (
            <Select
              id={id}
              value={mode}
              disabled={disabled || rows.length === 0}
              onChange={(event) => setMode(event.target.value === 'reset' ? 'reset' : 'target')}
            >
              <option value="target">Ziele finanzieren</option>
              <option value="reset">Zuweisungen auf 0 setzen</option>
            </Select>
          )}
        </Field>
        {disabled ? (
          <p className="panel-sub">Nur bei einem Monat</p>
        ) : rows.length === 0 ? (
          <p className="panel-sub">Bitte Kategorien auswählen.</p>
        ) : (
          <>
            <dl className="insp-list">
              <div>
                <dt>Zu verteilen</dt>
                <dd className="plan-money">{eur(tba)}</dd>
              </div>
              <div>
                <dt>Änderung gesamt</dt>
                <dd className="plan-money">{eur(preview.deltaCents, { sign: true })}</dd>
              </div>
              <div>
                <dt>Fehlbetrag</dt>
                <dd className="plan-money">{eur(preview.missingCents)}</dd>
              </div>
            </dl>
            {preview.changedCount > 0 && moveGuard(preview.deltaCents, tba).message && (
              <p className="panel-sub" role="status">
                {moveGuard(preview.deltaCents, tba).message}
              </p>
            )}
            {preview.changedCount === 0 && (
              <p className="panel-sub">
                {preview.rows.some(({ reason }) => reason)
                  ? 'Keine vollständige Zuweisungsvorschau verfügbar.'
                  : preview.missingCents > 0
                    ? 'Kein Geld für weitere Zuweisungen verfügbar.'
                    : 'Keine Zuweisung erforderlich.'}
              </p>
            )}
            {preview.rows.map(({ row, reason, afterCents, deltaCents, missingCents }) => (
              <div key={row.id} role="group" aria-label={row.name}>
                <p className="panel-h">{row.name}</p>
                {reason && <p className="panel-sub">{reason}</p>}
                <dl className="insp-list">
                  <div>
                    <dt>Zugewiesen</dt>
                    <dd className="plan-money">{eur(row.assignedCents)}</dd>
                  </div>
                  {mode === 'target' && (
                    <div>
                      <dt>Zielbedarf</dt>
                      <dd className="plan-money">{eur(row.needCents)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Änderung</dt>
                    <dd className="plan-money">{eur(deltaCents, { sign: true })}</dd>
                  </div>
                  <div>
                    <dt>Danach zugewiesen</dt>
                    <dd className="plan-money">{eur(afterCents)}</dd>
                  </div>
                  {missingCents !== null && (
                    <div>
                      <dt>Weiterhin offen</dt>
                      <dd className="plan-money">{eur(missingCents)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </>
        )}
      </section>
    </details>
  );
}
