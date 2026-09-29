/**
 * Elevation mark (Höhenkote): open triangle pointing down at a measured point, with a reference
 * line to a label shelf. Used only inside charts (forecast low, debt-free month, price change).
 * `x`, `y` is the measured point; the mark sits just above it.
 */
export function ElevationMark({
  x,
  y,
  label,
  shelf = 48,
  align = 'end',
}: {
  x: number;
  y: number;
  label: string;
  /** Vertical distance from the point to the label shelf. */
  shelf?: number;
  /** `end`: label extends to the left of the mark, `start`: to the right. */
  align?: 'start' | 'end';
}) {
  const top = y - shelf;
  const dir = align === 'end' ? -1 : 1;
  return (
    <g>
      <path d={`M${x - 6},${y - 12} L${x + 6},${y - 12} L${x},${y - 1.5} Z`} className="kote" />
      <path
        d={`M${x},${y - 12} L${x},${top} L${x + dir * 8},${top}`}
        className="l-dim l-dim-thin"
      />
      <text x={x + dir * 12} y={top - 6 + 5} textAnchor={align} className="svg-label-strong">
        {label}
      </text>
    </g>
  );
}
