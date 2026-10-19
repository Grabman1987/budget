// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssetsDebtsChart } from './assets-debts-chart';
import type { AssetsDebtsHistory } from './assets-debts-api';
import { useElementWidth } from '../charts/use-element-width';

const history: AssetsDebtsHistory = {
  period: 'Alles',
  from: '2026-08-01',
  to: '2026-08-31',
  change: { startCents: 10_000, endCents: 12_345, deltaCents: 2345, deltaRate: 0.2345 },
  months: [
    {
      month: '2026-08',
      date: '2026-08-31',
      partial: false,
      incomplete: false,
      assetsCents: 15_000,
      debtsCents: -2655,
      netCents: 12_345,
      assets: [],
      debts: [],
    },
  ],
};
let notify: (width: number) => void;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: 340,
    width: 800,
    height: 340,
    toJSON: () => ({}),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        notify = (width) =>
          callback(
            [{ contentRect: { width } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the same open native disclosure through transient zero and positive chart measurements', () => {
  const { container } = render(
    <AssetsDebtsChart history={history} selected="2026-08" onSelect={() => {}} />,
  );
  const details = container.querySelector('details')!;
  fireEvent.click(details.querySelector('summary')!);
  expect(details.open).toBe(true);

  for (const width of [0, 1138, 1074, 390, 0, 800]) {
    act(() => notify(width));
    expect(container.querySelector('details')).toBe(details);
    expect(details.open).toBe(true);
  }
  expect(screen.getByTestId('assets-debts-chart').getAttribute('width')).toBe('800');
  fireEvent.click(details.querySelector('summary')!);
  expect(details.open).toBe(false);
});

it('waits for an initial positive measurement before creating the drawing or disclosure', () => {
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  });
  const { container } = render(
    <AssetsDebtsChart history={history} selected="2026-08" onSelect={() => {}} />,
  );
  expect(container.querySelector('details')).toBeNull();
  expect(screen.queryByTestId('assets-debts-chart')).toBeNull();
  act(() => notify(390));
  expect(screen.getByTestId('assets-debts-chart').getAttribute('width')).toBe('390');
  expect(container.querySelector('details')!.open).toBe(false);
});

function DefaultWidthConsumer() {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="measured-width">
      {width}
    </div>
  );
}

it('preserves zero measurements for consumers that do not opt into retaining a positive width', () => {
  render(<DefaultWidthConsumer />);
  expect(screen.getByTestId('measured-width').textContent).toBe('800');
  act(() => notify(0));
  expect(screen.getByTestId('measured-width').textContent).toBe('0');
  act(() => notify(390));
  expect(screen.getByTestId('measured-width').textContent).toBe('390');
});
