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

/** A card with a head container (most reports) and one with a bare heading (the Onepager). */
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

const toggles = () => screen.getAllByRole('button', { name: /Abschnitt/ });

beforeEach(() => localStorage.clear());
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
    expect(toggles()).toHaveLength(2);
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

  it('keeps the heading visible and names the section in the description', () => {
    render(frame());
    const first = toggles()[0]!;
    expect(first.tagName).toBe('BUTTON');
    expect(first.getAttribute('type')).toBe('button');
    expect(document.getElementById(first.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Erster Abschnitt',
    );
    expect(document.getElementById('a-title')).not.toBeNull();
  });

  it('remembers the collapsed section per report across a reload', () => {
    const view = render(frame());
    fireEvent.click(toggles()[1]!);
    expect(JSON.parse(localStorage.getItem('budget.report-sections.' + slugOf(frame))!)).toEqual([
      '#1',
    ]);
    view.unmount();
    render(frame());
    expect(toggles()[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(toggles()[1]!.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not share the state between two reports', () => {
    const view = render(frame());
    fireEvent.click(toggles()[0]!);
    view.unmount();
    render(frame(frame === tableFrame ? 'jahresansicht' : 'geldfluss'));
    for (const button of toggles()) expect(button.getAttribute('aria-expanded')).toBe('true');
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
    localStorage.setItem('budget.report-sections.' + slugOf(frame), '{nope');
    render(frame());
    for (const button of toggles()) expect(button.getAttribute('aria-expanded')).toBe('true');
  });
});

function slugOf(frame: typeof tableFrame) {
  return frame === tableFrame ? 'sparquote' : 'einnahmen';
}

describe('section disclosure markup', () => {
  it('hides collapsed content by stylesheet and keeps the toggle at least 44 px on the phone', () => {
    const css = readFileSync('apps/web/src/reports/month-report.css', 'utf8');
    expect(css).toMatch(/section\[data-collapsed='true'\]\s*>\s*:not/);
    expect(css).toMatch(/\.section-toggle[\s\S]*var\(--touch\)/);
    expect(css).toMatch(/\.rs-scope\s*\{[^}]*row-gap: var\(--space-section\)/);
  });
});
