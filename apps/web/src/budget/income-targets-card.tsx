import type { IncomeTargets } from '@budget/domain';
import { eur } from '../ledger/format';
import type { PlanRow } from './plan-model';

const SOURCES = {
  expected: 'Quelle: Erwartete Zahlungen · bei Betragsbereichen der untere Wert',
  salary_rule: 'Quelle: Gehaltsregel',
  median: 'Schätzung: Median der letzten 3 vollständigen Monate',
  unavailable:
    'Keine vollständige Einkommensquelle: Erwartete Zahlungen prüfen oder 3 vollständige Monate erfassen.',
};

export function IncomeTargetsCard({
  data,
  rows,
  onOpen,
}: {
  data: IncomeTargets;
  rows: PlanRow[];
  onOpen: (id: string) => void;
}) {
  const gap = data.differenceCents !== null && data.differenceCents < 0;
  const max = Math.max(1, data.targetsCents, data.assignedIncomeCents ?? 0);
  const unfunded = data.unfundedCategoryIds
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is PlanRow => !!r);
  return (
    <section
      className="insp-card card income-targets"
      aria-labelledby="income-targets-title"
      data-testid="income-targets"
    >
      <h2 className="insp-title" id="income-targets-title">
        Erwartetes Einkommen vs. Monatsziele
      </h2>
      <p className="income-targets-source">{SOURCES[data.source]}</p>
      <dl className="insp-list">
        <div>
          <dt>Erwartetes Einkommen</dt>
          <dd>{data.expectedCents === null ? '–' : eur(data.expectedCents)}</dd>
        </div>
        {data.previousHeldCents > 0 && (
          <div>
            <dt>Vom Vormonat zurückgehalten</dt>
            <dd>{eur(data.previousHeldCents)}</dd>
          </div>
        )}
        {data.heldCents > 0 && (
          <div>
            <dt>Für den Folgemonat zurückgehalten</dt>
            <dd>{eur(data.heldCents)}</dd>
          </div>
        )}
        {(data.heldCents > 0 || data.previousHeldCents > 0) && (
          <div>
            <dt>Diesem Monat zugerechnet</dt>
            <dd>{data.assignedIncomeCents === null ? '–' : eur(data.assignedIncomeCents)}</dd>
          </div>
        )}
        <div>
          <dt>Monatsziele</dt>
          <dd>{eur(data.targetsCents)}</dd>
        </div>
        <div className="insp-total">
          <dt>
            {data.differenceCents === null
              ? 'Vergleich'
              : gap
                ? 'Lücke'
                : data.differenceCents === 0
                  ? 'Ausgeglichen'
                  : 'Überschuss'}
          </dt>
          <dd
            className={gap ? 'income-targets-gap' : undefined}
            data-testid="income-targets-difference"
          >
            {data.differenceCents === null
              ? 'nicht verfügbar'
              : eur(data.differenceCents, { sign: true })}
          </dd>
        </div>
      </dl>
      {data.assignedIncomeCents !== null && (
        <div className="income-targets-bars" aria-hidden="true">
          <div style={{ width: `${(Math.max(0, data.assignedIncomeCents) / max) * 100}%` }} />
          <div
            className="income-targets-goal"
            style={{ width: `${(data.targetsCents / max) * 100}%` }}
          />
        </div>
      )}
      <p className="income-targets-source">
        Planungswert; erwartetes Einkommen steht erst nach Eingang zum Verteilen bereit. Ziele
        berücksichtigen vorhandene Überträge.
      </p>
      <p>
        {unfunded.length
          ? `Noch zu finanzieren: ${eur(data.unfundedCents)}`
          : 'Alle Monatsziele sind finanziert.'}
      </p>
      {unfunded.length > 0 && (
        <ul className="income-targets-links" aria-label="Kategorien mit offenen Monatszielen">
          {unfunded.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onOpen(r.id)}>
                {r.name}
                <span>{eur(r.needCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
