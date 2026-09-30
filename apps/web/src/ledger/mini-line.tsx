import { Line, StepLine, type Point } from '@budget/ui';
import type { SeriesPoint } from './types';

const WIDTH = 120;
const HEIGHT = 30;

/** 30-day line of an account in the overview: the start value as pale reference, end dot. */
export function MiniLine({ points }: { points: ReadonlyArray<SeriesPoint> }) {
  if (points.length < 2) return <span className="kmini" aria-hidden="true" />;
  const values = points.map((p) => p.balanceCents);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const y = (v: number) => HEIGHT - 3 - ((v - lo) / span) * (HEIGHT - 6);
  const line: Point[] = points.map((p, i) => [
    (i / (points.length - 1)) * (WIDTH - 4),
    y(p.balanceCents),
  ]);
  const last = line[line.length - 1] as Point;
  const start = y(values[0] as number);
  return (
    <svg className="kmini" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <Line
        kind="plan"
        points={[
          [0, start],
          [WIDTH - 4, start],
        ]}
      />
      <StepLine kind="actual" points={line} />
      <circle cx={last[0]} cy={last[1]} r={2.5} className="dot-actual" />
    </svg>
  );
}
