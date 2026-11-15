// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AutoResolvedHistory } from './auto-resolved-history';

afterEach(cleanup);

it('shows when a warning was opened and why the market run closed it', () => {
  render(
    <AutoResolvedHistory
      items={[
        {
          id: 'synthetic-warning',
          title: 'Kurse nicht abrufbar: Synthetischer Welt-ETF',
          detail: 'Fehlerklasse: http',
          refType: 'security',
          refId: 'synthetic-etf',
          createdAt: '2026-09-29T02:00:00.000Z',
          resolvedAt: '2026-09-30T02:00:00.000Z',
          resolution: 'Automatisch geschlossen: Kursabruf über ariva am 30.09.2026 erfolgreich.',
        },
      ]}
    />,
  );
  expect(screen.getByText('Automatisch geschlossene Warnungen · 1')).toBeTruthy();
  const steps = within(
    screen.getByRole('list', { name: 'Verlauf: Kurse nicht abrufbar: Synthetischer Welt-ETF' }),
  ).getAllByRole('listitem');
  expect(steps.map((step) => step.textContent)).toEqual([
    '29.09.2026 · Warnung geöffnet (Fehlerklasse: http)',
    '30.09.2026 · Automatisch geschlossen: Kursabruf über ariva am 30.09.2026 erfolgreich.',
  ]);
});

it('renders nothing without automatically closed warnings', () => {
  const { container } = render(<AutoResolvedHistory items={[]} />);
  expect(container.innerHTML).toBe('');
});
