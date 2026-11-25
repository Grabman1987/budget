// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RecurringSuggestionList } from './recurring-suggestions';
import type { RecurringSuggestion } from './api';

afterEach(cleanup);

const item: RecurringSuggestion = {
  id: 'suggestion-1',
  name: 'Streaming Beispiel',
  kind: 'outflow',
  accountId: 'giro',
  payeeId: null,
  categoryId: 'abo',
  incomeTypeId: null,
  rhythm: 'monthly',
  intervalWeeks: null,
  dueDay: 14,
  dueMonth: null,
  startDate: null,
  amountCents: 1299,
  toleranceCents: 0,
  currency: 'EUR',
  count: 4,
  lastDate: '2026-10-14',
};

it('lists a suggestion with cadence, amount and category and reports the two actions', async () => {
  const onAccept = vi.fn();
  const onDismiss = vi.fn();
  render(
    <RecurringSuggestionList
      items={[item]}
      categoryName={(id) => (id === 'abo' ? 'Abos' : null)}
      onAccept={onAccept}
      onDismiss={onDismiss}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Erkannte wiederkehrende Zahlungen' })).toBeTruthy();
  expect(screen.getByText('Streaming Beispiel')).toBeTruthy();
  expect(
    screen.getByText(/monatlich am 14\. · Abos · 4 Buchungen, zuletzt 14\.10\.2026/),
  ).toBeTruthy();
  expect(screen.getByText(/12,99/)).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' })));
  expect(onAccept).toHaveBeenCalledWith(item);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' })));
  expect(onDismiss).toHaveBeenCalledWith(item);
});

it('renders nothing without suggestions', () => {
  const { container } = render(
    <RecurringSuggestionList
      items={[]}
      categoryName={() => null}
      onAccept={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(container.innerHTML).toBe('');
});
