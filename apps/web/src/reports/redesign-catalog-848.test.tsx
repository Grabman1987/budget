// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { REPORTS, LIQUIDITY_FORECAST } from '../nav/reports-catalog';
import {
  HUB_GROUPS,
  HUB_REPORTS,
  recentReports,
  hubReport,
  matchingHubReports,
} from './report-hub-model';
import { ReportHub } from './report-hub';
import { adjacentReports } from './report-navigation';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('./saved-explorer-links', () => ({ SavedExplorerLinks: () => <p>Meine Auswertungen</p> }));

it('ON uses the approved identities and 2+2+4+8 groups; every legacy name retains a working source entry', () => {
  expect(HUB_REPORTS.map((report) => report.id)).toEqual([
    'onepager',
    'jahresreport',
    'kontakte',
    'explorer',
    'vermoegen-schulden',
    'pdepots',
    'pallocation',
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
    ['Berichte', 2],
    ['Auswertungen', 2],
    ['Portfolio', 4],
    ['Einnahmen und Ausgaben', 8],
  ]);
  HUB_REPORTS.forEach((report, index) => {
    expect(adjacentReports(report.id).previous?.id).toBe(HUB_REPORTS[index - 1]?.id);
    expect(adjacentReports(report.id).next?.id).toBe(HUB_REPORTS[index + 1]?.id);
    for (const id of report.sources)
      expect(adjacentReports(id)).toEqual(adjacentReports(report.id));
  });
  const moved = new Set(['liquiditaet', 'vorschau', 'sparziele', 'gesamttabelle', 'planungstreue']);
  for (const source of [LIQUIDITY_FORECAST, ...REPORTS]) {
    if (moved.has(source.id)) continue;
    expect(hubReport(source.id), source.id).toBeDefined();
    expect(
      matchingHubReports(source.name).map((report) => report.id),
      source.name,
    ).toContain(hubReport(source.id)!.id);
  }
  sessionStorage.setItem(
    'budget.reports.recent.v1',
    JSON.stringify(['planungstreue', 'gesamttabelle', 'sparziele', 'vorschau', 'liquiditaet']),
  );
  expect(recentReports()).toEqual([]);
  const rendered = render(<ReportHub initialGroup="portfolio" />);
  expect(screen.queryByRole('group', { name: 'Berichtsgruppen' })).toBeNull();
  for (const name of ['Alle', 'Berichte', 'Auswertungen', 'Portfolio', 'Einnahmen und Ausgaben'])
    expect(screen.queryByRole('button', { name })).toBeNull();
  const rows = rendered.container.querySelectorAll('.report-hub-list > li');
  expect(rows).toHaveLength(16);
  expect([...rows].map((row) => row.querySelector('a')?.getAttribute('href'))).toEqual(
    HUB_REPORTS.map((report) => `/reports/${report.id}`),
  );
  // Unfinished consolidated bodies use their retained source paths, never a synthetic target.
  for (const id of ['finanzcheck', 'pallocation', 'peinzahlungen', 'prendite'])
    expect(rendered.container.querySelector(`a[href="/reports/${id}"]`), id).not.toBeNull();
  expect(screen.queryByRole('navigation', { name: 'Nach Plan verschobene Berichte' })).toBeNull();
  for (const name of [
    'Gesamttabelle',
    'Prognosegenauigkeit',
    'Jahresvorschau Zahlungen',
    'Sparziele-Fortschritt',
    'Liquiditätsprognose',
  ])
    expect(screen.queryByRole('link', { name })).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Rendite und Kennzahlen' } });
  expect(rendered.container.querySelectorAll('.report-hub-list > li')).toHaveLength(1);
  expect(screen.getByRole('link', { name: /Portfolio-Auswertung/ }).getAttribute('href')).toBe(
    '/reports/pallocation',
  );
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unbekannt' } });
  expect(screen.getByText('Kein Bericht passt zu dieser Suche.')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
  expect(rendered.container.querySelectorAll('.report-hub-list > li')).toHaveLength(16);
});

it('ON groups bank costs with portfolio costs and leaves contracts on their own', () => {
  expect(hubReport('kosten')).toMatchObject({
    id: 'psteuern',
    name: 'Kosten und Steuern',
    group: 'portfolio',
  });
  expect(hubReport('abos')).toMatchObject({ name: 'Verträge und Abos', sources: ['abos'] });
});

it('ON discovers the archived comparison and category addresses under Ausgaben, with Explorer still present', () => {
  expect(hubReport('vergleich')?.id).toBe('ausgaben');
  expect(hubReport('kategorien')?.id).toBe('ausgaben');
  expect(hubReport('explorer')?.id).toBe('explorer');
});
