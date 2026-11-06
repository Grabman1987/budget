// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import type { FinancialHealthAssessment, HealthMetric } from '@budget/domain';
import type { ReactNode } from 'react';
import type * as Http from '../api/http';
import { afterEach, expect, it, vi } from 'vitest';
import { FinancialHealthScores, HealthAssessmentView } from './financial-health-scores';

const flag = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
const request = vi.hoisted(() => vi.fn());
vi.mock('../shell/redesign-flag', () => flag);
vi.mock('../api/http', async (original) => ({
  ...(await original<typeof Http>()),
  request,
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, hash, children }: { to: string; hash?: string; children: ReactNode }) => (
    <a href={to + (hash ? `#${hash}` : '')}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  request.mockReset();
  flag.REDESIGN_ENABLED = true;
  act(() => setAmountsHidden(false));
});
const metric = (id: HealthMetric['id'], weight: number, score: number): HealthMetric => ({
  id,
  weight,
  score,
  state: 'available',
  reason: null,
  explanation: `Bekannter Befund ${id}.`,
  basis: ['100,01 € · 25,00 %'],
  source: {
    state: 'available',
    asOf: '2026-10-15',
    window: { from: '2026-01-01', to: '2026-09-30' },
    facts: {},
  },
});
const facts = (): FinancialHealthAssessment => ({
  method: 'budget-health-v1',
  asOf: '2026-10-15',
  score: 68,
  coverageBp: 10000,
  applicableWeight: 100,
  evaluatedCategories: 3,
  applicableCategories: 3,
  categories: [
    {
      id: 'cashflow',
      weight: 40,
      score: 50,
      state: 'complete',
      coverageBp: 10000,
      metrics: [metric('cashflow', 50, 50), metric('reserves', 50, 50)],
    },
    {
      id: 'debt',
      weight: 30,
      score: 100,
      state: 'complete',
      coverageBp: 10000,
      metrics: [metric('debt', 100, 100)],
    },
    {
      id: 'portfolio',
      weight: 30,
      score: 60,
      state: 'complete',
      coverageBp: 10000,
      metrics: [
        metric('structure', 40, 50),
        metric('concentration', 40, 100),
        metric('speculation', 20, 0),
      ],
    },
  ],
});

it('shows the supplied overall/sub-scores, source day, version, named windows and accessible details', () => {
  render(<HealthAssessmentView assessment={facts()} />);
  expect(screen.getByTestId('health-overall-score').textContent).toBe('68 von 100');
  expect(screen.getByTestId('health-score-cashflow').textContent).toBe('50 von 100');
  expect(screen.getByTestId('health-score-debt').textContent).toBe('100 von 100');
  expect(screen.getByTestId('health-score-portfolio').textContent).toBe('60 von 100');
  expect(screen.getByTestId('health-assessment').textContent).toContain('budget-health-v1');
  const detail = screen.getByText('Berechnung · Cashflow und Notgroschen').closest('details')!;
  fireEvent.click(detail.querySelector('summary')!);
  expect(detail.open).toBe(true);
  expect(detail.textContent).toContain('Quellfenster 01.01.2026 bis 30.09.2026');
  expect(
    screen.getByRole('link', { name: 'Schulden und Konditionen öffnen' }).getAttribute('href'),
  ).toBe('/vermoegen/schulden');
  expect(
    screen.getByRole('link', { name: 'Notgroschen im Regelwerk öffnen' }).getAttribute('href'),
  ).toBe('/einstellungen/regelwerk#rule-result-R02');
});

it('retains a true zero and separates unavailable/partial/not-applicable results', () => {
  const data = facts();
  data.score = null;
  data.categories[0] = { ...data.categories[0]!, score: 0 };
  data.categories[1] = {
    ...data.categories[1]!,
    state: 'unavailable',
    score: null,
    coverageBp: 0,
    metrics: [
      {
        ...metric('debt', 100, 0),
        score: null,
        reason: 'incomplete_service',
        state: 'unavailable',
      },
    ],
  };
  data.categories[2] = {
    ...data.categories[2]!,
    state: 'not_applicable',
    score: null,
    coverageBp: 0,
  };
  render(<HealthAssessmentView assessment={data} />);
  expect(screen.getByTestId('health-score-cashflow').textContent).toBe('0 von 100');
  expect(screen.getByTestId('health-score-debt').textContent).toBe('Nicht bewertbar');
  expect(screen.getByTestId('health-score-portfolio').textContent).toBe('Nicht anwendbar');
  expect(screen.getByTestId('health-overall-score').textContent).toBe('Nicht bewertbar');
  expect(
    screen.getByTestId('health-score-debt').closest('section')!.querySelector(':scope > p')!
      .textContent,
  ).toBe('Die Zahlungsverpflichtung ist nicht für jede Schuld vollständig belegt.');
});

it('masks source figures and all derived score numbers without putting them in ARIA/data attributes', () => {
  const { container } = render(<HealthAssessmentView assessment={facts()} />);
  act(() => setAmountsHidden(true));
  expect(screen.getByTestId('health-overall-score').textContent).toBe('••• von 100');
  expect(screen.getByTestId('health-score-cashflow').textContent).toBe('••• von 100');
  expect(container.textContent).not.toContain('100,01 €');
  expect(container.innerHTML).not.toContain('aria-valuenow');
  expect(container.innerHTML).not.toContain('25,00 %');
});

it('labels cached data as unconfirmed/offline instead of presenting fresh health', () => {
  render(<HealthAssessmentView assessment={facts()} stale offline />);
  expect(screen.getByRole('status').textContent).toContain('Offline');
  expect(screen.getByRole('status').textContent).toContain('nicht aktuell bestätigt');
  expect(screen.getByText('Gesamtbewertung · letzter Stand')).toBeTruthy();
});

it('keeps the OFF rollback presentation unchanged and does not read the new endpoint', () => {
  flag.REDESIGN_ENABLED = false;
  const { container } = render(<FinancialHealthScores />);
  expect(container.innerHTML).toBe('');
  expect(request).not.toHaveBeenCalled();
});

it('provides distinct loading, failure and retry states for the authenticated reader', async () => {
  let fail: ((error: Error) => void) | undefined;
  request.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FinancialHealthScores />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('status').textContent).toContain('werden geladen');
  await act(async () => {
    fail!(new Error('Synthetic unavailable'));
  });
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  request.mockResolvedValueOnce(facts());
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  await waitFor(() =>
    expect(screen.getByTestId('health-overall-score').textContent).toBe('68 von 100'),
  );
  expect(request).toHaveBeenLastCalledWith('GET', '/api/rules/health');
  client.clear();
});
