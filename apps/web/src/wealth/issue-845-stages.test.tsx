// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AllocationStages } from './allocation-stages';
import { allocationStageVersionsQuery, type PortfolioAllocationView } from './allocation-api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(cleanup);
it('shows persisted lower thresholds and the resolver buffer without a second target editor', () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(allocationStageVersionsQuery().queryKey, {
    versions: [
      {
        validFrom: '2026-09-01',
        targets: [],
        sumBp: 10000,
        label: null,
        reason: null,
        createdAt: null,
        auditGroupId: null,
        tiers: [
          { upToCents: 9999, targets: [{ assetClassId: 'a', targetShareBp: 10000 }] },
          { upToCents: null, targets: [{ assetClassId: 'a', targetShareBp: 10000 }] },
        ],
      },
    ],
  });
  const view = {
    policy: { targetValidFrom: '2026-09-01', wealthStage: { fromCents: 10000, inBuffer: true } },
    classes: [{ id: 'a', name: 'Synthetic class' }],
  } as unknown as PortfolioAllocationView;
  const result = render(
    <QueryClientProvider client={client}>
      <AllocationStages view={view} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('rowheader', { name: 'Stufe 2' })).toBeTruthy();
  expect(screen.getByText('aktiv im Puffer')).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'In Einstellungen bearbeiten' }).getAttribute('href'),
  ).toBe('/einstellungen/anlageklassen');
  expect(screen.getByRole('table').textContent).toContain('100,00 €');
  expect(result.container.querySelectorAll('input,select,form,button')).toHaveLength(0);
  client.clear();
});

it('keeps unclassified actual allocation visible and uses producer deviations', async () => {
  const { AllocationV3 } = await import('./allocation-v3');
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(allocationStageVersionsQuery().queryKey, { versions: [] });
  const view = {
    asOf: '2026-09-17',
    valueCents: 10000,
    policy: { targetValidFrom: '2026-09-01' },
    quality: { confidence: 'exact' },
    classes: [{ id: 'a', name: 'Synthetic class', targetBp: 5000, assignedSecurities: [] }],
    risk: {
      allocation: {
        totalCents: 10000,
        rows: [
          { assetClass: 'a', shareBp: 6000, targetBp: 5000, deviationBp: 1000, gapCents: -1000 },
          { assetClass: '', shareBp: 4000, targetBp: null, deviationBp: null, gapCents: 0 },
        ],
      },
    },
  } as unknown as PortfolioAllocationView;
  render(
    <QueryClientProvider client={client}>
      <AllocationV3 view={view} art="alle" />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('row', { name: /Ohne Anlageklasse/ }).textContent).toContain('40,0 %');
  expect(screen.getByRole('row', { name: /Synthetic class/ }).textContent).toContain('+10,0 Pp');
  expect(screen.getByRole('row', { name: /Synthetic class/ }).textContent).toContain('10,00 €');
  client.clear();
});
