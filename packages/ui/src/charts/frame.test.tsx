// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartSvg, ChartValues, chartDate } from './frame';
import { setAmountsHidden } from '../amount-privacy';

const points = [
  {
    x: 20,
    date: '2026-01-03',
    series: [
      { name: 'Wert', value: '123,45 €', color: 'var(--line)' },
      { name: 'Markt', value: '−12,34 €', color: 'var(--red)' },
    ],
  },
  {
    x: 80,
    date: '2026-01-04',
    series: [
      { name: 'Wert', value: '145,67 €' },
      { name: 'Anteil', value: '12,34 %' },
    ],
  },
];
const chart = () =>
  render(
    <ChartSvg width={100} height={120} label="Musterverlauf" points={points}>
      <path d="M20 80L80 20" />
    </ChartSvg>,
  );
afterEach(() => {
  act(() => setAmountsHidden(false));
  vi.unstubAllGlobals();
});

describe('shared chart inspection', () => {
  it('shows every series with its swatch, exact values and date at the bottom; arrows move and Escape hides', () => {
    const { container } = chart();
    const group = screen.getByRole('group', { name: 'Musterverlauf' });
    fireEvent.focus(group);
    const tooltip = screen.getByRole('status');
    expect(tooltip.textContent).toBe('Wert123,45 €Markt−12,34 €03.01.2026');
    expect(tooltip.querySelectorAll('rect')).toHaveLength(2);
    expect(tooltip.querySelectorAll('rect')[1]?.getAttribute('fill')).toBe('var(--red)');
    expect(container.querySelector('.chart-crosshair')?.getAttribute('x1')).toBe('20');
    fireEvent.keyDown(group, { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(screen.getByRole('status').textContent).toContain('03.01.2026');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toContain('12,34 %04.01.2026');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(container.querySelector('.chart-crosshair')?.getAttribute('x1')).toBe('80');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.getByRole('status').textContent).toContain('123,45');
    fireEvent.keyDown(group, { key: 'Escape' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('snaps using SVG coordinates even when the viewport scales the chart', () => {
    const { container } = chart();
    const svg = screen.getByRole('img');
    Object.defineProperty(svg, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) });
    vi.stubGlobal(
      'DOMPoint',
      class {
        constructor(public x: number) {}
        matrixTransform() {
          return { x: this.x / 2 };
        }
      },
    );
    vi.stubGlobal('PointerEvent', MouseEvent);
    fireEvent.pointerMove(svg, { clientX: 140, clientY: 20 });
    expect(container.querySelector('.chart-crosshair')?.getAttribute('x1')).toBe('80');
  });

  it('supports touch hit targets and outside dismissal on non-time charts', () => {
    class TouchPointer extends MouseEvent {
      pointerType = 'touch';
    }
    vi.stubGlobal('PointerEvent', TouchPointer);
    render(
      <ChartValues label="Musterfluss" points={points}>
        <span data-chart-point={1}>Fluss</span>
      </ChartValues>,
    );
    fireEvent.pointerDown(screen.getByText('Fluss'));
    expect(screen.getByRole('status').textContent).toContain('145,67');
    fireEvent.pointerLeave(screen.getByRole('group'));
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('never exposes tooltip values when amount privacy is enabled', () => {
    chart();
    fireEvent.focus(screen.getByRole('group'));
    act(() => setAmountsHidden(true));
    expect(screen.getByRole('status').textContent).not.toMatch(/123|12,34/);
    expect(screen.getByRole('status').textContent).toContain('03.01.2026');
  });

  it('labels calendar months without inventing a daily date', () => {
    expect(chartDate('2026-01')).toBe('Jänner 2026');
    expect(chartDate('Start')).toBe('Start');
  });
});
