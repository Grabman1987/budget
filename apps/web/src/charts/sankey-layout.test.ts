import { describe, expect, it } from 'vitest';
import { sankeyLayout, type SankeyLink, type SankeyNode } from './sankey-layout';

const cols: SankeyNode[][] = [
  [
    { id: 'a', name: 'A', value: 60 },
    { id: 'b', name: 'B', value: 40 },
  ],
  [{ id: 'pool', name: 'Pool', value: 100 }],
  [
    { id: 'x', name: 'X', value: 70 },
    { id: 'y', name: 'Y', value: 30 },
  ],
];
const links: SankeyLink[] = [
  { from: 'a', to: 'pool', value: 60 },
  { from: 'b', to: 'pool', value: 40 },
  { from: 'pool', to: 'x', value: 70 },
  { from: 'pool', to: 'y', value: 30 },
];

describe('sankeyLayout', () => {
  const layout = sankeyLayout(cols, links, { width: 600, height: 200, nodeWidth: 10, gap: 10 });

  it('places one rect per node with columns left to right', () => {
    expect(layout.nodes).toHaveLength(5);
    const xs = layout.nodes.map((n) => n.x);
    expect(xs[0]).toBe(xs[1]);
    expect(xs[2]).toBeGreaterThan(xs[0] ?? 0);
    expect(xs[3]).toBeGreaterThan(xs[2] ?? 0);
  });

  it('scales node heights proportionally to value', () => {
    const [a, b] = layout.nodes;
    expect((a?.height ?? 0) / (b?.height ?? 1)).toBeCloseTo(60 / 40, 5);
  });

  it('keeps every node inside the drawing area', () => {
    for (const n of layout.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + n.height).toBeLessThanOrEqual(200);
    }
  });

  it('builds one ribbon path per link with a thickness matching the value', () => {
    expect(layout.links).toHaveLength(4);
    expect(layout.links[0]?.d.startsWith('M')).toBe(true);
    expect(layout.links[0]?.thickness).toBeCloseTo((layout.nodes[0]?.height ?? 0) * 1, 5);
  });

  it('stacks links inside their nodes without overlap', () => {
    const outOfPool = layout.links.filter((l) => l.from === 'pool');
    const first = outOfPool[0];
    const second = outOfPool[1];
    expect((second?.y0 ?? 0) - ((first?.y0 ?? 0) + (first?.thickness ?? 0))).toBeCloseTo(0, 5);
  });

  it('ignores links with non-positive value or unknown nodes', () => {
    const l = sankeyLayout(
      cols,
      [...links, { from: 'a', to: 'nope', value: 5 }, { from: 'a', to: 'x', value: 0 }],
      {
        width: 600,
        height: 200,
      },
    );
    expect(l.links).toHaveLength(4);
  });
});
