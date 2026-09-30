import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Elevation mark (Höhenkote): open triangle pointing down at a measured point, with a reference
 * line up to a shelf that runs under the whole label (as in the prototype). Used only inside
 * charts (forecast low, debt-free month, price change). `x`, `y` is the measured point; the mark
 * sits just above it. Fades in after the lines are drawn.
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
  const text = useRef<SVGTextElement>(null);
  // Estimate until the real width is measured (jsdom has no text metrics).
  const [width, setWidth] = useState(label.length * 6.5);
  useLayoutEffect(() => {
    const measured = text.current?.getComputedTextLength?.();
    if (measured) setWidth(measured);
  }, [label]);
  const top = y - shelf;
  const dir = align === 'end' ? -1 : 1;
  return (
    <g className="fade-in">
      <path d={`M${x - 6},${y - 12} L${x + 6},${y - 12} L${x},${y - 1.5} Z`} className="kote" />
      <path
        d={`M${x},${y - 12} L${x},${top} L${x + dir * (width + 8)},${top}`}
        className="l-dim l-dim-thin"
      />
      <text ref={text} x={x + dir * 4} y={top - 6} textAnchor={align} className="svg-label-strong">
        {label}
      </text>
    </g>
  );
}
