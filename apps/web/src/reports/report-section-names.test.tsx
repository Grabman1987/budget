// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPORTS_CATALOG } from '../nav/pages';
import { findReport } from '../nav/reports-catalog';
import { MonthReportFrame } from './month-frame';

vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);

/** Same shapes as report-sections.test.tsx: head container, bare heading, note before the head. */
const sections = () => (
  <>
    <section>
      <div className="tbd-head">
        <h2 id="a-title">2026 · 8 Monate</h2>
      </div>
      <p>Inhalt A</p>
    </section>
    <section>
      <h3>Zweiter Abschnitt</h3>
      <p>Inhalt B</p>
    </section>
    <section>
      <p>Regel R17</p>
      <div className="tbd-head">
        <h2>Dritter Abschnitt</h2>
      </div>
      <p>Inhalt C</p>
    </section>
  </>
);

describe('accessible names of the section toggles (#647)', () => {
  it('names every toggle by the action and its own section title, via aria-labelledby', () => {
    render(
      <MonthReportFrame
        report={findReport('einnahmen')!}
        meta={REPORTS_CATALOG}
        month="2026-08"
        shift={vi.fn()}
        current="2026-09"
      >
        {sections()}
      </MonthReportFrame>,
    );
    const names = [
      'Abschnitt ein- oder ausklappen 2026 · 8 Monate',
      'Abschnitt ein- oder ausklappen Zweiter Abschnitt',
      'Abschnitt ein- oder ausklappen Dritter Abschnitt',
    ];
    for (const name of names) expect(screen.getAllByRole('button', { name })).toHaveLength(1);
    const buttons = screen.getAllByRole('button', { name: /^Abschnitt ein- oder ausklappen/ });
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.getAttribute('aria-describedby')).toBe(
        button.getAttribute('aria-labelledby')!.split(' ')[1],
      );
      const [self, heading] = button.getAttribute('aria-labelledby')!.split(' ');
      expect(self).toBe(button.id);
      expect(document.getElementById(heading!)?.tagName).toMatch(/^H[23]$/);
    }
    // The visible text stays empty (icon button): the name comes from attributes only.
    for (const button of buttons) expect(button.textContent).toBe('');
  });
});
