// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { REPORTS, LIQUIDITY_FORECAST } from '../nav/reports-catalog';
import {
  HUB_GROUPS,
  HUB_REPORTS,
  MOVED_REPORTS,
  hubReport,
  matchingHubReports,
} from './report-hub-model';
import { ReportHub } from './report-hub';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('./saved-explorer-links', () => ({ SavedExplorerLinks: () => <p>Meine Auswertungen</p> }));

it('ON uses the approved identities and 3+2+3+8 groups; every legacy name retains a working source entry', () => {
  expect(HUB_REPORTS.map((report) => report.id)).toEqual([
    'onepager',
    'jahresreport',
    'vergleich',
    'kontakte',
    'explorer',
    'vermoegen-schulden',
    'pdepots',
    'psteuern',
    'einnahmen-ausgaben',
    'ausgaben',
    'gehalt',
    'geldfluss',
    'sparquote',
    'budgettreue',
    'abos',
    'inflation',
  ]);
  expect(HUB_REPORTS.map((report) => report.no)).toEqual(
    Array.from({ length: 16 }, (_, index) => index + 1),
  );
  expect(
    HUB_GROUPS.map((group) => [
      group.name,
      HUB_REPORTS.filter((report) => report.group === group.id).length,
    ]),
  ).toEqual([
    ['Berichte', 3],
    ['Auswertungen', 2],
    ['Portfolio', 3],
    ['Einnahmen und Ausgaben', 8],
  ]);
  const moved = new Set<string>(MOVED_REPORTS.map((report) => report.id));
  for (const source of [LIQUIDITY_FORECAST, ...REPORTS]) {
    if (moved.has(source.id)) continue;
    expect(hubReport(source.id), source.id).toBeDefined();
    expect(
      matchingHubReports(source.name).map((report) => report.id),
      source.name,
    ).toContain(hubReport(source.id)!.id);
  }
  const rendered = render(<ReportHub />);
  const rows = rendered.container.querySelectorAll('.report-hub-list > li');
  expect(rows).toHaveLength(16);
  expect([...rows].map((row) => row.querySelector('a')?.getAttribute('href'))).toEqual(
    HUB_REPORTS.map((report) => `/reports/${report.id}`),
  );
  // Unfinished consolidated bodies use their retained source paths, never a synthetic target.
  for (const id of ['finanzcheck', 'pallocation', 'peinzahlungen', 'prendite'])
    expect(rendered.container.querySelector(`a[href="/reports/${id}"]`), id).not.toBeNull();
  for (const source of MOVED_REPORTS)
    expect(
      within(screen.getByRole('navigation', { name: 'Nach Plan verschobene Berichte' }))
        .getByRole('link', { name: `${source.name} → ${source.destination}` })
        .getAttribute('href'),
    ).toBe(`/reports/${source.id}`);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Rendite und Kennzahlen' } });
  expect(rendered.container.querySelectorAll('.report-hub-list > li')).toHaveLength(1);
  expect(screen.getByRole('link', { name: /Vermögensreport/ }).getAttribute('href')).toBe(
    '/reports/vermoegen-schulden',
  );
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unbekannt' } });
  expect(screen.getByText('Kein Bericht passt zu dieser Suche und Gruppe.')).toBeTruthy();
});
