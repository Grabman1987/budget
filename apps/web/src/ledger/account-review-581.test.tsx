// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AccountReview } from './account-review';
import type { AccountRow } from './types';

vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }));
vi.mock('./upcoming-register', () => ({ useRegisterToday: () => '2026-10-18' }));
vi.mock('./reconcile-panel', () => ({
  ReconcilePanel: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Existing reconciliation" /> : null,
}));

it.each([
  [null, 'Nie geprüft – jetzt prüfen'],
  ['2026-09-12', 'Geprüft 12.09.'],
] as const)(
  'announces the compact review badge and opens the existing action (%s)',
  (date, label) => {
    render(
      <AccountReview
        compact
        account={
          { id: 'sample', type: 'checking', closedAt: null, lastReconciledOn: date } as AccountRow
        }
      />,
    );
    const button = screen.getByRole('button', { name: `${label} · Kontostand prüfen` });
    expect(button.textContent).toBe(label);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Existing reconciliation' })).toBeTruthy();
  },
);
