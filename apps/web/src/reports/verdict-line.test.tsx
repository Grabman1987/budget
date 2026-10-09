// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import { VerdictLine } from './verdict-line';
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
});
it('renders the shared engine and reacts to privacy without leaking figures in attributes', () => {
  const facts = {
    reportId: 'synthetic',
    period: '2025-09',
    metric: {
      label: 'Sparbetrag',
      value: -120000,
      unit: 'money' as const,
      better: 'higher' as const,
    },
  };
  const { rerender, container } = render(<VerdictLine facts={facts} />);
  expect(screen.getByTestId('report-verdict').textContent).toContain('−1.200 €');
  setAmountsHidden(true);
  rerender(<VerdictLine facts={facts} />);
  expect(screen.getByTestId('report-verdict').textContent).toContain('••• €');
  expect(container.innerHTML).not.toContain('1.200');
});
it('retains partial and estimated caveats and renders a neutral empty report', () => {
  render(
    <VerdictLine
      facts={{ reportId: 'synthetic', period: '2025-09', partial: true, estimated: true }}
    />,
  );
  expect(screen.getByTestId('report-verdict').textContent).toMatch(/laufend.*vorläufig/);
  expect(screen.getByTestId('report-verdict').textContent).not.toContain('Stand –');
});

it('masks both booked and expected amounts in the running-month context', () => {
  setAmountsHidden(true);
  const facts = {
    reportId: 'onepager',
    period: '2026-03',
    partial: true,
    metric: {
      label: 'Sparbetrag',
      value: -60_000,
      unit: 'money' as const,
      better: 'higher' as const,
    },
    monthProgress: {
      asOf: '2026-03-18',
      pendingIncome: {
        count: 1,
        cents: 300_000,
        from: '2026-03-31',
        through: '2026-03-31',
      },
    },
  };
  const { container } = render(<VerdictLine facts={facts} />);
  const text = screen.getByTestId('report-verdict').textContent ?? '';
  expect(text.match(/••• €/g)).toHaveLength(2);
  expect(text).toContain('18.03.');
  expect(text).toContain('31.03.');
  expect(container.innerHTML).not.toMatch(/600|3000/);
});
