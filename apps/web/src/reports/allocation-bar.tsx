import { allocationBar, type Allocation } from '@budget/domain';
import './allocation-bar.css';

/** Shared income-scale bar for reports and the Plan inspector. */
export function AllocationBar({
  data,
  label,
}: {
  data: Pick<Allocation, 'incomeCents' | 'needCents' | 'wantCents' | 'futureCents' | 'restCents'>;
  label: string;
}) {
  if (data.incomeCents <= 0)
    return <p className="text-muted">Ohne Einnahmen keine prozentuale Verteilung.</p>;
  const bar = allocationBar(data);
  const width = (value: number) => `${(value / bar.scale) * 100}%`;
  return (
    <div className="income-scale">
      <div className="income-scale-bar" role="img" aria-label={label}>
        {(['need', 'want', 'future', 'rest'] as const).map((kind) => (
          <span key={kind} className={`income-scale-${kind}`} style={{ width: width(bar[kind]) }} />
        ))}
        {bar.overflowCents > 0 && (
          <span
            className="income-scale-overflow"
            style={{ left: width(data.incomeCents), width: width(bar.overflowCents) }}
          />
        )}
        {[50, 80, 100].map((mark) => (
          <i
            key={mark}
            className={mark === 100 ? 'income-scale-end' : ''}
            style={{ left: width((data.incomeCents * mark) / 100) }}
          >
            <small>{mark} %</small>
          </i>
        ))}
      </div>
      {bar.overflowCents > 0 && (
        <p className="income-scale-note">
          +{((bar.overflowBp ?? 0) / 100).toLocaleString('de-AT')} % über Einnahmen · aus
          Guthaben/Ersparnissen
        </p>
      )}
      {bar.overflowCents === 0 && data.futureCents < 0 && (
        <p className="income-scale-note">
          Negative Zukunft: Geld aus Guthaben/Ersparnissen entnommen.
        </p>
      )}
    </div>
  );
}
