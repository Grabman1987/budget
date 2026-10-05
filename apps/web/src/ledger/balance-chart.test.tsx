// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BalanceChart } from './balance-chart';
vi.mock('@budget/ui', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useIsPhone: () => false,
}));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [null, 600] }));
const points = [
  { date: '2026-10-03', balanceCents: 10000 },
  { date: '2026-10-04', balanceCents: 12345 },
];
it('uses dashed forecast and credit limit, no zero reference, exact keyboard tooltip', () => {
  const { container } = render(
    <BalanceChart
      points={points}
      windowLabel="3M"
      previewPoints={[points[1]!, { date: '2026-10-05', balanceCents: 11344 }]}
      limitCents={10000}
      limitLabel="Dispolimit"
    />,
  );
  expect(container.querySelector('.l-forecast')).toBeTruthy();
  expect(screen.getByText(/Dispolimit/).textContent).toContain('−100,00');
  expect(screen.queryByText('0')).toBeNull();
  const slider = screen.getByRole('slider');
  fireEvent.focus(slider);
  expect(container.querySelector('.kchart-tooltip')?.textContent).toContain('113,44');
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(container.querySelector('.kchart-tooltip')?.textContent).toContain('123,45');
  expect(container.querySelector('.kchart-tooltip')?.textContent).toContain('04.10.2026');
});
it('draws no reference line when terms do not contain a limit', () => {
  const { container } = render(<BalanceChart points={points} windowLabel="3M" />);
  expect(container.querySelector('.l-plan')).toBeNull();
});

it('keeps the hover in bounds when the preview shrinks', () => {
  const { rerender, container } = render(
    <BalanceChart
      points={points}
      windowLabel="3M"
      previewPoints={[points[1]!, { date: '2026-10-05', balanceCents: 11344 }]}
    />,
  );
  fireEvent.focus(screen.getByRole('slider'));
  rerender(<BalanceChart points={points} windowLabel="3M" />);
  expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('1');
  expect(container.querySelector('.kchart-tooltip')?.textContent).toContain('123,45');
});
