// @vitest-environment jsdom
import { DEFAULT_EXPLORER_QUERY, type ExplorerResult } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExplorerChart626 } from './explorer-chart-626';
import { customChartModel } from './explorer-chart-model-626';
const width = vi.hoisted(() => ({ value: 320 }));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), width.value] }));
afterEach(() => {
  cleanup();
  width.value = 320;
  setAmountsHidden(false);
});
function source(values: number[]): ExplorerResult {
  return {
    query: { ...DEFAULT_EXPLORER_QUERY, cols: 'monat' },
    months: ['2024-01', '2024-02', '2024-04'].slice(0, values.length),
    columns: ['2024-01', '2024-02', '2024-04']
      .slice(0, values.length)
      .map((key) => ({ key, months: [key] })),
    unit: 'cents',
    rows: [{ key: 'source', label: 'Originalquelle', class: null, values, total: 7777 }],
    totals: null,
    truncated: 0,
    good: 'low',
  };
}
function finiteGeometry(container: HTMLElement, actualWidth: number) {
  const paths = container.querySelectorAll('.ex-chart-series .l-actual');
  for (const path of paths) {
    const value = path.getAttribute('d') ?? '';
    expect(value).not.toMatch(/NaN|Infinity|undefined/);
    const numbers = value.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
    expect(numbers.every(Number.isFinite)).toBe(true);
    numbers.forEach((value, index) => {
      expect(value).toBeGreaterThanOrEqual(index % 2 === 0 ? 60 : 16);
      expect(value).toBeLessThanOrEqual(index % 2 === 0 ? actualWidth - 12 : 192);
    });
  }
}
describe('626 actual-width original-value line geometry', () => {
  it.each([320, 1200])(
    'has finite bounded zero/signed/single/extreme geometry at %i CSS pixels',
    (actualWidth) => {
      width.value = actualWidth;
      for (const values of [
        [0, 0, 0],
        [-1001, -2001, -1],
        [1001],
        [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 0],
      ]) {
        const mounted = render(<ExplorerChart626 data={customChartModel(source(values))} />);
        expect(mounted.container.querySelector('svg.chart')?.getAttribute('width')).toBe(
          String(actualWidth),
        );
        finiteGeometry(mounted.container, actualWidth);
        mounted.unmount();
      }
    },
  );
  it('shows empty/missing values honestly and breaks both line segments at an explicit null', () => {
    const empty = render(<ExplorerChart626 data={customChartModel(source([]))} />);
    expect(screen.getByRole('status').textContent).toContain('Keine Werte');
    empty.unmount();
    const model = customChartModel(source([1001, 0, -1001]));
    model.rows[0]!.values = [1001, null, -1001];
    const mounted = render(<ExplorerChart626 data={model} />);
    expect(mounted.container.querySelectorAll('.ex-chart-series .l-actual')).toHaveLength(2);
    finiteGeometry(mounted.container, 320);
    mounted.unmount();
    const absent = customChartModel(source([0, 0, 0]));
    absent.rows[0]!.values = [null, null, null];
    const missing = render(<ExplorerChart626 data={absent} />);
    expect(missing.container.querySelectorAll('.ex-chart-series .l-actual')).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('Lücken');
  });
  it('paints an isolated interior value even when axis-label cadence skips its column', () => {
    const model = customChartModel(source([0, 0, 0]));
    model.columns = Array.from({ length: 12 }, (_, index) => ({
      key: `2024-${String(index + 1).padStart(2, '0')}`,
      label: `Monat ${index + 1}`,
      months: [`2024-${String(index + 1).padStart(2, '0')}`],
    }));
    model.rows[0]!.values = [null, 100, null, null, null, null, null, null, null, null, null, null];
    const mounted = render(<ExplorerChart626 data={model} />);
    const series = mounted.container.querySelector('.ex-chart-series')!;
    expect(series.querySelectorAll('.l-actual')).toHaveLength(1);
    expect(series.querySelector('[data-chart-point="1"] .ex-series-marker')).not.toBeNull();
    expect(series.querySelectorAll('.ex-series-marker')).toHaveLength(1);
    expect(series.querySelector('[data-chart-point="0"]')).toBeNull();
    expect(series.querySelector('[data-chart-point="2"]')).toBeNull();
    finiteGeometry(mounted.container, 320);
  });

  it('uses actual irregular month distances rather than equal spacing or invented dates', () => {
    const mounted = render(<ExplorerChart626 data={customChartModel(source([100, 200, 300]))} />);
    const path =
      mounted.container.querySelector('.ex-chart-series .l-actual')?.getAttribute('d') ?? '';
    const numbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(numbers[0]).toBe(60);
    expect(numbers[2]).toBeCloseTo(144.484, 3);
    expect(numbers[4]).toBe(308);
  });
  it('keeps eight distinct named marker patterns and literal Further values without changing source totals', async () => {
    const data = source([10, 20, 30]);
    data.rows = Array.from({ length: 8 }, (_, index) => ({
      key: `first-${index}`,
      label: `Quelle ${index + 1}`,
      class: null,
      values: [10, 20, 30],
      total: 9001,
    }));
    data.rows.push(
      { key: 'ninth', label: 'Neunte', class: null, values: [901, -101, 0], total: 9002 },
      { key: 'tenth', label: 'Zehnte', class: null, values: [-401, 201, 0], total: 9003 },
    );
    const before = structuredClone(data);
    const mounted = render(<ExplorerChart626 data={customChartModel(data)} />);
    expect(screen.getByRole('list', { name: 'Reihenlegende' }).querySelectorAll('li')).toHaveLength(
      9,
    );
    const marks = [
      ...screen.getByRole('list', { name: 'Reihenlegende' }).querySelectorAll('.ex-series-marker'),
    ].map((node) => node.getAttribute('d'));
    expect(new Set(marks).size).toBe(9);
    const target = mounted.container.querySelector('.chart-interactive')!;
    fireEvent.keyDown(target, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(document.querySelector('.chart-tooltip')?.textContent).toContain(
        'Weitere · Zeilensumme (2)',
      ),
    );
    expect(document.querySelector('.chart-tooltip')?.textContent).toContain('5,00 €');
    expect(data).toEqual(before);
  });
  it('distinguishes an original source named Weitere from the real remaining-row aggregate', async () => {
    const data = source([10, 20, 30]);
    data.rows = Array.from({ length: 8 }, (_, index) => ({
      key: `source-${index}`,
      label: index === 0 ? 'Weitere' : `Quelle ${index + 1}`,
      class: null,
      values: [1234, 0, 0],
      total: 1234,
    }));
    data.rows.push(
      { key: 'ninth', label: 'Neunte', class: null, values: [901, -101, 0], total: 800 },
      { key: 'tenth', label: 'Zehnte', class: null, values: [-401, 201, 0], total: -200 },
    );
    const mounted = render(<ExplorerChart626 data={customChartModel(data)} />);
    fireEvent.keyDown(mounted.container.querySelector('.chart-interactive')!, {
      key: 'ArrowRight',
    });
    await waitFor(() => expect(document.querySelector('.chart-tooltip')).not.toBeNull());
    const names = [...document.querySelectorAll('.chart-tooltip-row > span')].map(
      (node) => node.textContent,
    );
    expect(names.filter((name) => name === 'Weitere')).toHaveLength(1);
    expect(names.filter((name) => name === 'Weitere · Zeilensumme (2)')).toHaveLength(1);
    expect(names).not.toContain('Weitere · Zeilensumme (1)');
    expect(document.querySelector('.chart-tooltip')?.textContent).toContain('12,34 €');
    expect(document.querySelector('.chart-tooltip')?.textContent).toContain('5,00 €');
  });

  it('keeps amount privacy on tooltip/data alternatives without changing exact source values', async () => {
    const data = source([1234]);
    const mounted = render(<ExplorerChart626 data={customChartModel(data)} />);
    await act(async () => {
      setAmountsHidden(true);
    });
    fireEvent.keyDown(mounted.container.querySelector('.chart-interactive')!, {
      key: 'ArrowRight',
    });
    await waitFor(() => expect(document.querySelector('.chart-tooltip')).not.toBeNull());
    expect(document.querySelector('.chart-tooltip')?.textContent).not.toContain('12,34');
    expect(data.rows[0]?.values).toEqual([1234]);
  });
});
