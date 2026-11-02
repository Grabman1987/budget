// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AllocationStages } from './allocation-stages';
import { targetVersionsQuery, type PortfolioAllocationView } from './allocation-api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(cleanup);
it('shows persisted lower thresholds and the resolver buffer without a second target editor', () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(targetVersionsQuery().queryKey, {
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
  expect(screen.getByText('Stufe 2 · ab 100,00 €')).toBeTruthy();
  expect(screen.getByText('· aktiv im Puffer')).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'In Einstellungen bearbeiten' }).getAttribute('href'),
  ).toBe('/einstellungen/anlageklassen');
  expect(result.container.querySelectorAll('input,select,form,button')).toHaveLength(0);
  client.clear();
});
