import { useState } from 'react';
import { Button } from '@budget/ui';
import type { BudgetAdherenceReport } from '@budget/db';
import { useAmountPrivacy } from '@budget/ui';
import { eur } from '../ledger/format';
import { adherenceGroups } from './budget-cost-inflation-presentation';

function Bullet({
  name,
  planCents,
  istCents,
  maxCents,
}: {
  name: string;
  planCents: number;
  istCents: number;
  maxCents?: number;
}) {
  const max = maxCents ?? Math.max(1, Math.abs(planCents), Math.abs(istCents));
  return (
    <div className="r11-bullet">
      <strong>{name}</strong>
      <span
        className="r11-bullet-track"
        role="img"
        aria-label={`${name}: Ist ${eur(istCents)} von Monatsplan ${eur(planCents)}`}
      >
        <i style={{ width: `${(Math.max(0, istCents) / max) * 100}%` }} />
        {planCents > 0 && <b style={{ left: `${Math.min(99.5, (planCents / max) * 100)}%` }} />}
      </span>
      <span className="r11-bullet-value">
        {eur(istCents)} <small>von {eur(planCents)}</small>
      </span>
    </div>
  );
}

export function BudgetPlanSummary({ data }: { data: BudgetAdherenceReport }) {
  useAmountPrivacy();
  const [all, setAll] = useState(false);
  if (data.status !== 'ok') return null;
  const groups = adherenceGroups(data);
  const groupMax = Math.max(
    1,
    ...groups.flatMap((row) => [Math.abs(row.planCents), Math.abs(row.istCents)]),
  );
  const shown = all ? groups : [...groups].sort((a, b) => b.istCents - a.istCents).slice(0, 4);
  return (
    <>
      <section className="sr-card r11-budget-total" aria-labelledby="r11-budget-total">
        <h2 id="r11-budget-total">Gesamt</h2>
        <Bullet name="Ist gegen Monatsplan" planCents={data.planCents} istCents={data.istCents} />
        <p className={data.live && data.restCents < 0 ? 'r11-current-deficit' : 'sr-note'}>
          {data.restCents < 0
            ? `${eur(-data.restCents)} über Plan`
            : `${eur(data.restCents)} im Plan übrig`}
          {data.live && data.restCents < 0 ? ' · jetzt im Plan umschichten' : ''}
        </p>
      </section>
      <section className="sr-card" aria-labelledby="r11-budget-groups">
        <h2 id="r11-budget-groups">Je Gruppe · Ist gegen Monatsplan</h2>
        {groups.length ? (
          <div className="r11-bullets">
            {shown.map((row) => (
              <Bullet key={row.name} {...row} maxCents={groupMax} />
            ))}
          </div>
        ) : (
          <p role="status">In diesem Monat ist nichts zugewiesen und nichts ausgegeben.</p>
        )}
        {groups.length > 4 && (
          <Button variant="ghost" onClick={() => setAll(!all)}>
            {all ? 'Weniger Gruppen anzeigen' : `Alle ${groups.length} Gruppen anzeigen`}
          </Button>
        )}
        <p className="sr-note">
          Plan = im Monat zugewiesen; periodische Kategorien mit Rücklage.{' '}
          {data.live
            ? `Ist bis ${data.liveUntil}; der Monatsplan wird nicht zeitanteilig gekürzt.`
            : 'Ist am Monatsende.'}
        </p>
        <details className="r11-chart-table">
          <summary>Tabelle anzeigen</summary>
          <table className="r11-table">
            <caption className="sr-only">Ist und Monatsplan je Gruppe</caption>
            <thead>
              <tr>
                <th scope="col">Gruppe</th>
                <th scope="col">Ist</th>
                <th scope="col">Monatsplan</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td>{eur(row.istCents)}</td>
                  <td>{eur(row.planCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    </>
  );
}
