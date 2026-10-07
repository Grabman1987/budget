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
