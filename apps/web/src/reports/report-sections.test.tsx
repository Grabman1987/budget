// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReportTables } from '@budget/db';
import { REPORTS_CATALOG } from '../nav/pages';
import { findReport } from '../nav/reports-catalog';
import { MonthReportFrame } from './month-frame';
import { TableReportFrame } from './table-report-frame';

vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const tables: ReportTables = {
  asOf: '2026-09-17',
  currentMonth: '2026-09',
  firstMonth: '2023-10',
  lastFullMonth: '2026-08',
  netWorth: 'omitted',
  payees: {},
  months: [],
  categories: [],
  incomeTypes: [],
  targets: { savingsRateBp: 2000, moneyAgeDays: 30 },
};

/** Head container first (most reports), a bare heading (Onepager), a note before the head (Sparquote). */
const sections = () => (
  <>
    <section aria-labelledby="a-title">
      <div className="tbd-head">
        <h2 id="a-title">Erster Abschnitt</h2>
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

const tableFrame = (slug = 'sparquote') => (
  <TableReportFrame
    report={findReport(slug)!}
    meta={REPORTS_CATALOG}
    through="full"
    className="synthetic"
    query={{ data: tables, isFetching: false, isError: false } as UseQueryResult<ReportTables>}
  >
    {sections}
  </TableReportFrame>
);

const monthFrame = (slug = 'einnahmen') => (
  <MonthReportFrame
    report={findReport(slug)!}
    meta={REPORTS_CATALOG}
    month="2026-08"
    shift={vi.fn()}
    current="2026-09"
  >
    {sections()}
  </MonthReportFrame>
);

const toggles = () => screen.getAllByRole('button', { name: 'Abschnitt ein- oder ausklappen' });

const KEY = 'budget.report-sections./reports/x';
beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/reports/x');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([
  ['table reports', tableFrame],
  ['month reports', monthFrame],
])('collapsible sections in %s', (_name, frame) => {
  it('gives every section a disclosure button that starts expanded', () => {
    render(frame());
    expect(toggles()).toHaveLength(3);
    for (const button of toggles()) expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses and expands the content of one section only', () => {
    const { container } = render(frame());
    const [first, second] = toggles() as [HTMLElement, HTMLElement];
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(second.getAttribute('aria-expanded')).toBe('true');
    const [a, b] = container.querySelectorAll('section');
    expect(a!.getAttribute('data-collapsed')).toBe('true');
    expect(b!.hasAttribute('data-collapsed')).toBe(false);
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(a!.hasAttribute('data-collapsed')).toBe(false);
  });

  it('describes each toggle by its section heading and keeps every head marked', () => {
    const { container } = render(frame());
    const titles = ['Erster Abschnitt', 'Zweiter Abschnitt', 'Dritter Abschnitt'];
    toggles().forEach((button, i) => {
      expect(button.getAttribute('type')).toBe('button');
      expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(
        titles[i],
      );
    });
    for (const section of container.querySelectorAll('section'))
      expect(section.querySelectorAll('[data-section-head]')).toHaveLength(1);
  });

  it('finds the head of a section that starts with a note, and keeps the note out of the head', () => {
    const { container } = render(frame());
    const third = container.querySelectorAll('section')[2]!;
    expect(third.firstElementChild!.hasAttribute('data-section-head')).toBe(false);
    expect(third.querySelector('[data-section-head] h2')?.textContent).toBe('Dritter Abschnitt');
    fireEvent.click(toggles()[2]!);
    expect(third.getAttribute('data-collapsed')).toBe('true');
  });

  it('remembers the collapsed section per report across a reload', () => {
    const view = render(frame());
    fireEvent.click(toggles()[1]!);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['#1']);
    view.unmount();
    render(frame());
    expect(toggles()[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(toggles()[1]!.getAttribute('aria-expanded')).toBe('false');
  });

  it('keys the state by page path, so two pages (also of one report) do not share state', () => {
    const view = render(frame());
    fireEvent.click(toggles()[0]!);
    view.unmount();
    window.history.pushState({}, '', '/reports/x/historie');
    render(frame());
    for (const button of toggles()) expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(localStorage.getItem('budget.report-sections./reports/x/historie')).toBeNull();
  });

  it('re-reads storage when toggling, so a second hook instance does not overwrite it', () => {
    render(frame());
    localStorage.setItem(KEY, JSON.stringify(['#2']));
    fireEvent.click(toggles()[0]!);
    expect(JSON.parse(localStorage.getItem(KEY)!).sort()).toEqual(['#2', 'a-title']);
  });

  it('renders expanded and still toggles when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(frame());
    for (const button of toggles()) expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggles()[0]!);
    expect(toggles()[0]!.getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores a damaged stored value', () => {
    localStorage.setItem(KEY, '{nope');
    render(frame());
    for (const button of toggles()) expect(button.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('section disclosure markup', () => {
  const css = readFileSync('apps/web/src/reports/month-report.css', 'utf8');
  it('hides collapsed content on screen only, never the head, and drops the toggle in print', () => {
    expect(css).toMatch(
      /@media screen\s*\{\s*section\[data-collapsed='true'\]\s*>\s*:not\(\[data-section-head\], \.section-toggle\)/,
    );
    expect(css).toMatch(/@media print\s*\{\s*\.section-toggle\s*\{\s*display: none/);
  });

  it('makes the toggle a 44 px target on the phone and 32 px only from 768 px up', () => {
    const ui = readFileSync('packages/ui/src/styles/components.css', 'utf8');
    expect(ui).toMatch(/\.icon-btn\s*\{[^}]*width: var\(--touch\);[^}]*height: var\(--touch\)/);
    expect(readFileSync('packages/ui/src/styles/scale-tokens.css', 'utf8')).toMatch(
      /--touch: 44px/,
    );
    expect(css.replace(/@media[^{]*\{[^{}]*\{[^}]*\}\s*\}/g, '')).not.toMatch(
      /\.section-toggle\s*\{[^}]*(width|height):/,
    );
    expect(css).toMatch(
      /@media \(min-width: 768px\)\s*\{\s*\.section-toggle\s*\{\s*width: 32px;\s*height: 32px/,
    );
  });

  it('wraps month report bodies in a grid that keeps the sheet row gap', () => {
    expect(css).toMatch(/\.rs-scope\s*\{[^}]*row-gap: var\(--space-section\)/);
  });
});
