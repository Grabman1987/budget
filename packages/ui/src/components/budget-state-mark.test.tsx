// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as stamps from './stamps';

describe('budget state presentation', () => {
  it.each([
    ['met', 'Ziel erfüllt', 'lucide-check'],
    ['open', 'Offen', 'lucide-chart-pie'],
    ['overspent', 'Überzogen', 'lucide-credit-card'],
    ['overfunded', 'Mehr als Ziel', 'lucide-arrow-up'],
    ['neutral', 'Null / pausiert', 'lucide-minus'],
  ] as const)(
    'shows %s with a visible label and a distinct non-color glyph',
    (state, label, icon) => {
      const Mark = stamps.BudgetStateMark;
      render(<Mark state={state} />);
      const mark = screen.getByText(label);
      expect(mark.querySelector(`svg.${icon}`)?.getAttribute('aria-hidden')).toBe('true');
      expect(mark.classList.contains(`budget-state-${state}`)).toBe(true);
      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('uses the supplied wording without calculating a new state from a figure', () => {
    const Mark = stamps.BudgetStateMark;
    render(<Mark state="open">Noch zu finanzieren</Mark>);
    expect(screen.getByText('Noch zu finanzieren').classList.contains('budget-state-open')).toBe(
      true,
    );
  });
});
