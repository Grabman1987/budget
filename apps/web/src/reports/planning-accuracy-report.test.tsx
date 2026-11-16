// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PaceAccuracyNote } from './planning-accuracy-report';
afterEach(cleanup);
it('withholds the Heute Pace claim until three comparable months exist', () => {
  const note = render(<PaceAccuracyNote summary={{ count: 2, hits: 1, meanAbsoluteBp: 400 }} />);
  expect(note.container.textContent).toBe('');
  note.rerender(<PaceAccuracyNote summary={{ count: 3, hits: 2, meanAbsoluteBp: 400 }} />);
  expect(screen.getByText('Deine Hochrechnung lag zuletzt im Schnitt 4 % daneben.')).toBeTruthy();
});
