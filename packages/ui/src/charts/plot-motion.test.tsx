// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChartSvg } from './frame';
import { Line } from './lines';

const charts = () =>
  render(
    <StrictMode>
      {[1, 2].map((i) => (
        <ChartSvg key={i} width={100} height={100} label={`Verlauf ${i}`}>
          <Line
            kind="actual"
            points={[
              [0, 50],
              [100, 20],
            ]}
          />
        </ChartSvg>
      ))}
    </StrictMode>,
  );

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/plan');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('animates only the first chart on the first visit to each page in this session', () => {
  const first = charts();
  expect(first.container.querySelectorAll('.plot-first')).toHaveLength(1);
  expect(first.container.querySelector('svg')?.classList.contains('plot-first')).toBe(true);
  first.unmount();
  const revisit = charts();
  expect(revisit.container.querySelectorAll('.plot-first')).toHaveLength(0);
  revisit.unmount();
  window.history.replaceState(null, '', '/heute');
  expect(charts().container.querySelectorAll('.plot-first')).toHaveLength(1);
});

it.each(['getItem', 'setItem'] as const)(
  'shows charts without animation when storage %s is blocked',
  (method) => {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(charts().container.querySelectorAll('.plot-first')).toHaveLength(0);
  },
);
