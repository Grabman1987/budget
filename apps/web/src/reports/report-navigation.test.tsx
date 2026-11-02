// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportNavigation, adjacentReports } from './report-navigation';
const canonical = [
  'einnahmen-ausgaben',
  'ausgaben',
  'gehalt',
  'geldfluss',
  'sparquote',
  'budgettreue',
  'abos',
  'inflation',
  'vermoegen-schulden',
  'pdepots',
  'pallocation',
  'psteuern',
  'explorer',
  'vergleich',
  'onepager',
  'jahresreport',
] as const;
const aliases = [
  ['einnahmen', 'einnahmen-ausgaben'],
  ['cashflow', 'einnahmen-ausgaben'],
  ['projekte', 'einnahmen-ausgaben'],
  ['empfaenger', 'ausgaben'],
  ['planungstreue', 'budgettreue'],
  ['kosten', 'abos'],
  ['vermoegen', 'vermoegen-schulden'],
  ['gesamtuebersicht', 'vermoegen-schulden'],
  ['peinzahlungen', 'pallocation'],
  ['prendite', 'pallocation'],
  ['jahresansicht', 'explorer'],
  ['kategorien', 'explorer'],
  ['gesamttabelle', 'explorer'],
] as const;
const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLinkProps: ({
    to,
    onClick,
    'aria-current': current,
  }: {
    to: string;
    onClick?: () => void;
    'aria-current'?: 'page';
  }) => ({ href: to, onClick, 'aria-current': current }),
}));

describe('report navigation', () => {
  it('follows the literal sixteen-report chain across groups and both endpoints without self edges', () => {
    canonical.forEach((id, index) => {
      const neighbors = adjacentReports(id);
      expect({ previous: neighbors.previous?.id, next: neighbors.next?.id }).toEqual({
        previous: canonical[index - 1],
        next: canonical[index + 1],
      });
      for (const neighbor of [neighbors.previous, neighbors.next])
        if (neighbor) {
          expect(canonical).toContain(neighbor.id);
          expect(neighbor.id).not.toBe(id);
        }
    });
  });
  it('normalizes every report alias to the same canonical neighbors and keeps retired/unknown ids safe', () => {
    for (const [alias, target] of aliases) {
      const index = canonical.indexOf(target);
      const neighbors = adjacentReports(alias);
      expect({ previous: neighbors.previous?.id, next: neighbors.next?.id }).toEqual({
        previous: canonical[index - 1],
        next: canonical[index + 1],
      });
      for (const neighbor of [neighbors.previous, neighbors.next])
        if (neighbor) expect(neighbor.id).not.toBe(target);
    }
    for (const id of ['unknown', 'liquiditaet', 'vorschau', 'sparziele', 'kontakte', 'finanzcheck'])
      expect(adjacentReports(id)).toEqual({ previous: undefined, next: undefined });
  });
  it('disables only the real canonical first and last directions', () => {
    const view = render(<ReportNavigation id="einnahmen-ausgaben" />);
    expect(
      (screen.getByRole('button', { name: 'Vorheriger Bericht' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Nächster Bericht: Ausgabenanalyse',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    view.rerender(<ReportNavigation id="jahresreport" />);
    expect(
      (screen.getByRole('button', { name: 'Nächster Bericht' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Vorheriger Bericht: Monatsbericht',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
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
    expect(
      screen
        .getByRole('button', { name: 'Nächster Bericht: Kosten, Steuern, Erträge' })
        .getAttribute('title'),
    ).toBe('12 Kosten, Steuern, Erträge · Alt+Umschalt+→');
    expect(
      screen
        .getByRole('button', { name: 'Vorheriger Bericht: Depots im Vergleich' })
        .getAttribute('title'),
    ).toBe('10 Depots im Vergleich · Alt+Umschalt+←');
    fireEvent.click(
      screen.getByRole('button', { name: 'Nächster Bericht: Kosten, Steuern, Erträge' }),
    );
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/reports/psteuern' }));
    const selectedSearch = navigate.mock.calls[0]![0].search;
    expect(
      selectedSearch({
        zeitraum: 'YTD',
        trend: true,
        monat: '2026-09',
        darstellung: 'einzahlungen',
        vorlage: 'year',
        ansicht: 'private',
      }),
    ).toEqual({ zeitraum: 'YTD', trend: true, monat: '2026-09' });
    navigate.mockClear();
    fireEvent.keyDown(document.body, { altKey: true, shiftKey: true, key: 'ArrowLeft' });
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/reports/pdepots' }));
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
    expect(
      screen.getByRole('link', { name: '11. Portfolio-Auswertung' }).getAttribute('aria-current'),
    ).toBe('page');
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
