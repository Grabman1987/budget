// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { CreditLineRow } from '@budget/db';
import { CreditLinesTable } from './bank-costs-report';

afterEach(cleanup);
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
