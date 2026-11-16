// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { HEUTE, PAGES, REPORTS_CATALOG } from '../nav/pages';
import { AreaHead } from './area-head';

const params = vi.hoisted(() => ({ value: {} as { reportId?: string } }));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => params.value,
  useNavigate: () => vi.fn(),
  useLinkProps: ({ to, onClick }: { to: string; onClick?: () => void }) => ({ href: to, onClick }),
}));
vi.mock('../shell/use-month', () => ({
  useMonth: () => ['2026-10'],
  currentMonth: () => '2026-10',
}));
vi.mock('../budget/month-span', () => ({ useMonthSpan: () => 1 }));

afterEach(cleanup);
const head = (ui: React.ReactElement) => {
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  );
  return container.querySelector('.titleblock')!;
};

it('a single report gets the one-row head: question beside the title, data basis, no sync stamp', () => {
  params.value = { reportId: 'sparquote' };
  const el = head(
    <AreaHead
      meta={REPORTS_CATALOG}
      title="Sparquote"
      subtitle="1.7 · Wie viel bleibt?"
      reportDataBasis="Okt 23 bis Aug 26"
    />,
  );
  expect(el.classList.contains('titleblock-report')).toBe(true);
  expect(screen.getByText('1.7 · Wie viel bleibt?')).toBeTruthy();
  expect(screen.getByText('Okt 23 bis Aug 26')).toBeTruthy();
  expect(screen.queryByText('Stand')).toBeNull();
});

it('a report keeps its own source field instead of the sync stamp', () => {
  params.value = { reportId: 'sparquote' };
  head(
    <AreaHead
      meta={REPORTS_CATALOG}
      reportStand={{ label: 'Stichtag', value: 'Monatsende' }}
      reportDataBasis="x"
    />,
  );
  expect(screen.getByText('Stichtag')).toBeTruthy();
});

it('the report overview and the other areas keep their head unchanged', () => {
  params.value = {};
  expect(head(<AreaHead meta={REPORTS_CATALOG} />).classList.contains('titleblock-report')).toBe(
    false,
  );
  expect(screen.getByText('Stand')).toBeTruthy();
  cleanup();
  for (const meta of [
    HEUTE,
    PAGES.find((p) => p.area === 'plan')!,
    PAGES.find((p) => p.area === 'konten')!,
  ]) {
    params.value = { reportId: 'sparquote' }; // a stray param must not change other areas
    const el = head(<AreaHead meta={meta} />);
    expect(el.classList.contains('titleblock-report'), meta.area).toBe(false);
    cleanup();
  }
});
