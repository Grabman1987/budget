// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AccuracyHeadline, PaceAccuracyNote } from './planning-accuracy-report';
afterEach(cleanup);
it('shows the requested headline and withholds the Pace claim until three comparable months exist', () => {
  render(
    <AccuracyHeadline
      summary={{ count: 6, hits: 4, meanAbsoluteBp: 380 }}
      reliableFrom="2026-12"
    />,
  );
  expect(
    screen.getByText('Trefferquote 6 Monate: 4 von 6 · mittlere Abweichung 3,8 %'),
  ).toBeTruthy();
  const note = render(<PaceAccuracyNote summary={{ count: 2, hits: 1, meanAbsoluteBp: 400 }} />);
  expect(note.container.textContent).toBe('');
  note.rerender(<PaceAccuracyNote summary={{ count: 3, hits: 2, meanAbsoluteBp: 400 }} />);
  expect(screen.getByText('Deine Hochrechnung lag zuletzt im Schnitt 4 % daneben.')).toBeTruthy();
});
it('names the reliability boundary instead of inventing a hit rate', () => {
  render(
    <AccuracyHeadline
      summary={{ count: 0, hits: 0, meanAbsoluteBp: null }}
      reliableFrom="2026-12"
    />,
  );
  expect(screen.getByRole('status').textContent).toBe(
    'Erst ab Dezember 2026 belastbar (2–3 Monate Daten)',
  );
});
