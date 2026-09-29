/** Pure Sankey layout (columns of nodes, links as ribbons), ported from `design/prototype/reports-core.js`. */

export interface SankeyNode {
  id: string;
  name: string;
  value: number;
  /** Style hook, e.g. `need`, `want`, `future`, `rest`. */
  tone?: string;
}

export interface SankeyLink {
  from: string;
  to: string;
  value: number;
  tone?: string;
  label?: string;
}

export interface SankeyOptions {
  width: number;
  height: number;
  nodeWidth?: number;
  gap?: number;
  /** Horizontal margins reserved for labels. */
  padLeft?: number;
  padRight?: number;
}

export interface PlacedNode extends SankeyNode {
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedLink extends SankeyLink {
  d: string;
  thickness: number;
  y0: number;
  y1: number;
}

export interface SankeyLayout {
  nodes: PlacedNode[];
  links: PlacedLink[];
}

export function sankeyLayout(
  columns: SankeyNode[][],
  links: SankeyLink[],
  { width, height, nodeWidth = 10, gap = 10, padLeft = 0, padRight = 0 }: SankeyOptions,
): SankeyLayout {
  const columnCount = columns.length;
  const colX = columns.map(
    (_, i) =>
      padLeft + (i * (width - padLeft - padRight - nodeWidth)) / Math.max(1, columnCount - 1),
  );
  const total = Math.max(...columns.map((c) => c.reduce((sum, n) => sum + n.value, 0)));
  const maxNodes = Math.max(...columns.map((c) => c.length));
  const k = (height - 8 - gap * (maxNodes - 1)) / total;

  const nodes: PlacedNode[] = [];
  const cursor = new Map<string, { out: number; in: number; node: PlacedNode }>();
  columns.forEach((column, ci) => {
    let y = 4;
    for (const n of column) {
      const h = Math.max(2, n.value * k);
      const placed: PlacedNode = {
        ...n,
        column: ci,
        x: colX[ci] ?? 0,
        y,
        width: nodeWidth,
        height: h,
      };
      nodes.push(placed);
      cursor.set(n.id, { out: y, in: y, node: placed });
      y += h + gap;
    }
  });

  const placedLinks: PlacedLink[] = [];
  for (const link of links) {
    const a = cursor.get(link.from);
    const b = cursor.get(link.to);
    if (!a || !b || link.value <= 0) continue;
    const t = link.value * k;
    const x0 = a.node.x + nodeWidth;
    const x1 = b.node.x;
    const xm = (x0 + x1) / 2;
    const y0 = a.out;
    const y1 = b.in;
    a.out += t;
    b.in += t;
    const d =
      `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + t} ` +
      `C${xm},${y1 + t} ${xm},${y0 + t} ${x0},${y0 + t} Z`;
    placedLinks.push({ ...link, d, thickness: t, y0, y1 });
  }
  return { nodes, links: placedLinks };
}
