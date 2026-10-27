// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SavedContactReminders } from './offline-state';

afterEach(cleanup);

it('reads the saved server result once per contact without an offline action', () => {
  render(
    <SavedContactReminders
      reminders={{
        items: [
          { contactId: 'k1', contactName: 'Freund', oldestDate: '2026-09-01', overdueCents: 3000 },
        ],
        unavailableCount: 1,
      }}
    />,
  );
  const list = screen.getByRole('list', { name: 'Kontakt-Erinnerungen' });
  expect(list.querySelectorAll('li')).toHaveLength(1);
  expect(screen.getByText(/Freund · seit 01.09.2026 offen/)).toBeTruthy();
  expect(screen.getByText(/30,00.*€/)).toBeTruthy();
  expect(screen.getByText(/Kontakt-Erinnerungen für 1 Kontakt/)).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it('accepts an older cached Heute response without contact reminders', () => {
  const { container } = render(<SavedContactReminders />);
  expect(container.childElementCount).toBe(0);
});
