import { TrendLine } from './trend';
import { area, curveStepAfter, line } from 'd3-shape';
import type { Point } from './types';

/**
 * ISO 128 line types carry meaning:
 * actual = solid 2 px · plan = dashed `7 5` pale · forecast = dashed `7 5` ink ·
 * previous / benchmark = dash-dot `12 4 2 4`.
 */
export type LineKind = 'actual' | 'plan' | 'forecast' | 'previous' | 'benchmark';

const KIND_CLASS: Record<LineKind, string> = {
  actual: 'l-actual',
  plan: 'l-plan',
  forecast: 'l-forecast',
  previous: 'l-prev',
  benchmark: 'l-prev',
};

const linear = line<Point>()
  .x((p) => p[0])
  .y((p) => p[1]);
const stepped = line<Point>()
  .x((p) => p[0])
  .y((p) => p[1])
  .curve(curveStepAfter);

export function linePath(points: ReadonlyArray<Point>): string {
  return linear(points as Point[]) ?? '';
}

export function stepPath(points: ReadonlyArray<Point>): string {
  return stepped(points as Point[]) ?? '';
}

export interface LineProps {
  points: ReadonlyArray<Point>;
  kind: LineKind;
  /**
   * Plotter draw when the line appears (900 ms, as in the prototype): 0 starts at once, 1 after
   * 260 ms, 2 after 520 ms; `false` shows it at once. Only solid lines are drawn, dashed ones
   * appear directly (their dash pattern would be lost). `true` is the same as 0.
   */
  draw?: boolean | 0 | 1 | 2;
  /** Extra class on the path, e.g. a thinner stroke for a dense daily series. */
  className?: string;
}

const DRAW_DELAY = ['', ' draw-late', ' draw-later'];

function drawClass(kind: LineKind, draw: LineProps['draw']): string {
  if (draw === false || draw === undefined || kind !== 'actual') return KIND_CLASS[kind];
  return `${KIND_CLASS[kind]} draw${DRAW_DELAY[draw === true ? 0 : draw]}`;
}

// pathLength scales dash patterns too, so it is set only on lines that are drawn (solid ones).
const drawLength = (className: string) => (className.includes(' draw') ? 1 : undefined);

/** Polyline in one of the ISO line types. */
export function Line({ points, kind, draw = 0, className: extra }: LineProps) {
  const className = drawClass(kind, draw);
  return (
    <g>
      {kind === 'actual' && !extra?.includes('halo') && <TrendLine points={points} />}
      <path
        d={linePath(points)}
        className={extra ? `${className} ${extra}` : className}
        pathLength={drawLength(className)}
      />
    </g>
  );
}

/** Step line: the value holds until the next point (balances, cumulative spending). */
export function StepLine({ points, kind = 'actual', draw = 0, className: extra }: LineProps) {
  const className = `${drawClass(kind, draw)} ${extra ?? ''}`;
  return (
    <g>
      {kind === 'actual' && <TrendLine points={points} />}
      <path d={stepPath(points)} className={className} pathLength={drawLength(className)} />
    </g>
  );
}

export interface BandPoint {
  x: number;
  y0: number;
  y1: number;
}

const band = area<BandPoint>()
  .x((p) => p.x)
  .y0((p) => p.y0)
  .y1((p) => p.y1);

/** Tolerance or buffer band: tinted area with dashed edges (never hatched). */
export function Band({ points }: { points: ReadonlyArray<BandPoint> }) {
  const fill = band(points as BandPoint[]) ?? '';
  const edge = (pick: (p: BandPoint) => number): Point[] => points.map((p) => [p.x, pick(p)]);
  return (
    <g>
      <path d={fill} className="band-fill" />
      <path d={linePath(edge((p) => p.y0))} className="band-edge" />
      <path d={linePath(edge((p) => p.y1))} className="band-edge" />
    </g>
  );
}
