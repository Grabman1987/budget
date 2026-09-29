// @vitest-environment jsdom
import { cents } from '@budget/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DimensionChainDrawing } from './dimension-chain-drawing';

afterEach(cleanup);

const parts = [
  { key: 'need', label: 'Bedarf', cents: cents(128_000), fill: 'need' as const },
  { key: 'want', label: 'Wunsch', cents: cents(42_000), fill: 'want' as const },
];
const minus = {
  key: 'open',
  label: 'offen bis Gehalt',
  cents: cents(30_000),
  kind: 'bound' as const,
};
const result = { label: 'frei verfügbar', cents: cents(140_000) };

const draw = (props: Partial<React.ComponentProps<typeof DimensionChainDrawing>> = {}) =>
  render(
    <DimensionChainDrawing
      label="Frei verfügbar bis Gehalt"
      parts={parts}
      minus={minus}
      result={result}
      width={720}
      {...props}
    />,
  );

describe('DimensionChainDrawing', () => {
  it('shows partial dimensions, the bound part and the "= …" result as text', () => {
    draw();
    expect(screen.getByText('Bedarf 1.280,00 €')).toBeTruthy();
    expect(screen.getByText('Wunsch 420,00 €')).toBeTruthy();
    expect(screen.getByText('offen bis Gehalt −300,00 €')).toBeTruthy();
    expect(screen.getByText('= frei verfügbar 1.400,00 €')).toBeTruthy();
  });

  it('is one named group', () => {
    draw();
    expect(screen.getByRole('group', { name: 'Frei verfügbar bis Gehalt' })).toBeTruthy();
  });

  it('makes every segment a keyboard-operable button that reports its key', () => {
    const onSelect = vi.fn();
    draw({ onSelect });
    const segments = screen.getAllByRole('button');
    expect(segments.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Bedarf 1.280,00 €, Einzelposten zeigen',
      'Wunsch 420,00 €, Einzelposten zeigen',
      'offen bis Gehalt −300,00 €, Einzelposten zeigen',
    ]);
    for (const segment of segments) expect(segment.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(segments[0] as Element, { key: 'Enter' });
    fireEvent.keyDown(segments[1] as Element, { key: ' ' });
    fireEvent.click(segments[2] as Element);
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(['need', 'want', 'open']);
  });

  it('has no buttons without a handler', () => {
    draw();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('fills classes (solid need, hatched want) and hatches the bound part', () => {
    const { container } = draw();
    const fills = [...container.querySelectorAll('.seg-fill')].map((el) => el.getAttribute('fill'));
    expect(fills[0]).toBe('var(--need)');
    expect(fills[1]).toMatch(/^url\(#.+-want\)$/);
    expect(fills[2]).toMatch(/^url\(#.+-bound\)$/);
    expect(container.querySelector('[stroke-dasharray="var(--dash-debt)"]')).toBeNull();
  });

  it('draws a debt as a dashed outline without hatching', () => {
    const { container } = draw({ minus: { ...minus, kind: 'debt' } });
    const fills = [...container.querySelectorAll('.seg-fill')].map((el) => el.getAttribute('fill'));
    expect(fills[2]).toBe('transparent');
    expect(
      container.querySelector('.chain-minus .seg-outline')?.getAttribute('stroke-dasharray'),
    ).toBe('var(--dash-debt)');
  });

  it('sizes the bar in proportion to the values and the result to the remaining part', () => {
    const { container } = draw();
    const bars = [...container.querySelectorAll<SVGRectElement>('.seg-fill')];
    const width = (el: SVGRectElement) => Number(el.getAttribute('width'));
    // 1.280 : 420 of a 1.700 total over 716 px
    expect(width(bars[0] as SVGRectElement) / width(bars[1] as SVGRectElement)).toBeCloseTo(
      1280 / 420,
      1,
    );
    // the bound part is the remainder from result to total
    expect(width(bars[2] as SVGRectElement)).toBeCloseTo((300 / 1700) * 716, 0);
  });

  it('moves a dimension text up a row when a narrow neighbour is in its way', () => {
    const { container } = draw({
      parts: [
        { key: 'a', label: 'Budget-Konten', cents: cents(11_670), fill: 'need' },
        { key: 'b', label: 'Sparen', cents: cents(77_390), fill: 'future' },
        { key: 'c', label: 'Investment', cents: cents(8_800_000), fill: 'want' },
      ],
      minus: undefined,
      result: { label: 'Summe', cents: cents(8_889_060) },
    });
    const ys = [...container.querySelectorAll('.svg-label-strong')].map((t) => t.getAttribute('y'));
    // Budget-Konten and Sparen cannot share a line; Investment fits on the lowest one.
    expect(new Set(ys.slice(0, 2)).size).toBe(2);
    expect(ys[2]).toBe(ys[0] === ys[2] ? ys[0] : ys[1]);
  });

  it('drops the cents on narrow widths', () => {
    draw({ width: 400 });
    expect(screen.getByText('Bedarf 1.280 €')).toBeTruthy();
  });

  it('unfolds with the open flag', () => {
    const { container, rerender } = draw({ open: false });
    expect(container.querySelector('.chain-drawing')?.classList.contains('is-open')).toBe(false);
    rerender(
      <DimensionChainDrawing
        label="x"
        parts={parts}
        minus={minus}
        result={result}
        width={720}
        open
      />,
    );
    expect(container.querySelector('.chain-drawing')?.classList.contains('is-open')).toBe(true);
  });

  it('closed chains are not in the tab order or the accessibility tree', () => {
    draw({ open: false, onSelect: () => {} });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders a chain without a subtracted part', () => {
    draw({ minus: undefined, result: { label: 'Summe', cents: cents(170_000) } });
    expect(screen.getByText('= Summe 1.700,00 €')).toBeTruthy();
  });
});
