// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportNavigation, adjacentReports } from './report-navigation';
import { REPORTS } from '../nav/reports-catalog';
const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLinkProps: ({ to, onClick }: { to: string; onClick?: () => void }) => ({ href: to, onClick }),
}));

describe('report navigation', () => {
  it('follows every catalog position, including group boundaries and both endpoints', () => {
    REPORTS.forEach((r, i) =>
      expect(adjacentReports(r.id)).toEqual({ previous: REPORTS[i - 1], next: REPORTS[i + 1] }),
    );
    expect(adjacentReports('unknown')).toEqual({ previous: undefined, next: undefined });
  });
  it('names the destination and supports the advertised shortcut without stealing input keys', () => {
    navigate.mockClear();
    render(
      <>
        <ReportNavigation id="peinzahlungen" />
        <input aria-label="Eingabe" />
        <dialog open>
          <button type="button">Dialogaktion</button>
        </dialog>
      </>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Nächster Bericht: Rendite und Kennzahlen' }),
    );
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/reports/prendite' }));
    navigate.mockClear();
    fireEvent.keyDown(document.body, { altKey: true, shiftKey: true, key: 'ArrowLeft' });
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/reports/pallocation' }));
    navigate.mockClear();
    fireEvent.keyDown(screen.getByRole('textbox'), {
      altKey: true,
      shiftKey: true,
      key: 'ArrowRight',
    });
    expect(navigate).not.toHaveBeenCalled();
    const summary = screen.getByText('Bericht wechseln', { selector: 'summary' });
    const disclosure = summary.parentElement as HTMLDetailsElement;
    fireEvent.click(summary);
    expect(disclosure.open).toBe(true);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(disclosure.open).toBe(true);
    const search = screen.getByRole('searchbox', {
      name: 'Bericht nach Name oder Frage suchen',
    });
    search.focus();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(disclosure.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Dialogaktion' }), {
      altKey: true,
      shiftKey: true,
      key: 'ArrowRight',
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});
