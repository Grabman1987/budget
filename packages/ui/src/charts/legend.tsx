import type { LineKind } from './lines';

const KIND_CLASS: Record<LineKind, string> = {
  actual: 'l-actual',
  plan: 'l-plan',
  forecast: 'l-forecast',
  previous: 'l-prev',
  benchmark: 'l-prev',
};

/** Legend of line types. Required wherever more than one line type is shown. */
export function LineLegend({
  items,
}: {
  items: ReadonlyArray<{ kind: LineKind; label: string; className?: string }>;
}) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <svg aria-hidden="true" viewBox="0 0 32 8">
            <line
              x1="0"
              x2="32"
              y1="4"
              y2="4"
              className={`${KIND_CLASS[item.kind]} ${item.className ?? ''}`}
            />
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
