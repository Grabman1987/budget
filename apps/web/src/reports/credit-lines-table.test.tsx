// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, expect, it } from 'vitest';
import type { CreditLineRow } from '@budget/db';
import { CreditLinesTable } from './bank-costs-report';

afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
});
const line: CreditLineRow = {
  id: 'synthetic-line',
  name: 'Musterrahmen',
  institutionId: null,
  type: 'checking',
  limitCents: 200000,
  usedCents: 100001,
  rateBp: 1200,
  currency: 'USD',
  interestKind: null,
  installmentCents: null,
  termStart: null,
  originalAmountCents: null,
  termEnd: null,
  interest12Cents: null,
};

it('shows native-currency limits, usage and cent-rounded estimated monthly interest', () => {
  render(<CreditLinesTable lines={[line]} />);
  const row = screen.getByRole('row', { name: /Musterrahmen/ });
  const cells = within(row).getAllByRole('cell');
  expect(cells.map((cell) => cell.textContent?.replaceAll('\u00a0', ' '))).toEqual([
    'USD 2.000,00',
    '12,00 %',
    'USD 1.000,01',
    'USD 10,00',
  ]);
});

it('distinguishes missing rate and limit from a known zero rate and unused line', () => {
  render(
    <CreditLinesTable
      lines={[
        { ...line, id: 'unknown', name: 'Ohne Zinsangabe', rateBp: null, limitCents: null },
        { ...line, id: 'free', name: 'Zinsfrei', rateBp: 0 },
        { ...line, id: 'unused', name: 'Ungenutzt', usedCents: 0, rateBp: null },
      ]}
    />,
  );
  expect(screen.getByRole('row', { name: /Ohne Zinsangabe/ }).textContent).toContain(
    'Keine Angabe',
  );
  expect(
    within(screen.getByRole('row', { name: /Ohne Zinsangabe/ }))
      .getAllByRole('cell')
      .at(-1)?.textContent,
  ).toBe('Nicht schätzbar');
  expect(
    within(screen.getByRole('row', { name: /Zinsfrei/ }))
      .getAllByRole('cell')
      .at(-1)?.textContent,
  ).toBe('USD\u00a00,00');
  expect(
    within(screen.getByRole('row', { name: /Ungenutzt/ }))
      .getAllByRole('cell')
      .at(-1)?.textContent,
  ).toBe('USD\u00a00,00');
});

it('explains an empty credit-line list', () => {
  render(<CreditLinesTable lines={[]} />);
  expect(screen.getByText('Keine offenen Kredit- oder Dispolinien.')).toBeTruthy();
});

it('keeps the credit-line table named and keyboard scrollable while hiding native amounts', () => {
  render(<CreditLinesTable lines={[line]} />);
  const region = screen.getByRole('region', { name: 'Tabelle der Kredit- und Dispolinien' });
  expect(region.tabIndex).toBe(0);
  expect(
    within(region).getByRole('table', { name: 'Tabelle der Kredit- und Dispolinien' }),
  ).toBeTruthy();
  act(() => setAmountsHidden(true));
  const row = screen.getByRole('row', { name: /Musterrahmen/ });
  expect(row.textContent).not.toContain('1.000,01');
  expect(row.textContent).not.toContain('2.000,00');
  expect(within(row).getAllByRole('cell').at(-1)?.textContent).not.toContain('10,00');
  act(() => setAmountsHidden(false));
  expect(row.textContent).toContain('1.000,01');
});
