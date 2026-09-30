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
  /** Plotter draw: the line is pulled from its start once when it appears (solid kinds only). */
  draw?: boolean;
}

const lineClass = (kind: LineKind, draw: boolean) =>
  draw ? `${KIND_CLASS[kind]} line-draw` : KIND_CLASS[kind];

/** Polyline in one of the ISO line types. */
export function Line({ points, kind, draw = false }: LineProps) {
  return (
    <path
      d={linePath(points)}
      className={lineClass(kind, draw)}
      {...(draw ? { pathLength: 1 } : {})}
    />
  );
}

/** Step line: the value holds until the next point (balances, cumulative spending). */
export function StepLine({ points, kind = 'actual', draw = false }: LineProps) {
  return (
    <path
      d={stepPath(points)}
      className={lineClass(kind, draw)}
      {...(draw ? { pathLength: 1 } : {})}
    />
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
