// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DebtTermsPrompt } from './debts-page';
import type { DebtsView } from './debts-api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(cleanup);
it('offers the existing terms editor for missing terms and never fabricates a payoff date', () => {
  const view = {
    accounts: [
      {
        id: 'loan',
        type: 'loan',
        name: 'Synthetic loan',
        interestRateBp: null,
        installmentCents: 1000,
        monthlyFeeCents: 0,
      },
    ],
  } as unknown as DebtsView;
  const result = render(<DebtTermsPrompt view={view} />);
  expect(screen.getByRole('region', { name: 'Fehlende Kreditkonditionen' }).textContent).toContain(
    'Tilgungsdatum nicht verfügbar',
  );
  expect(
    screen.getByRole('link', { name: 'Gespeicherte Konditionen pflegen' }).getAttribute('href'),
  ).toBe('/einstellungen/konten');
  result.rerender(<DebtTermsPrompt view={{ ...view, accounts: [] }} />);
  expect(screen.queryByRole('region')).toBeNull();
});
