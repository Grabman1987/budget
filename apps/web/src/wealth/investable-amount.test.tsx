// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { InvestableAmountChain } from './investable-amount';

afterEach(cleanup);

it('shows all deductions, the signed result and the floored amount in Austrian German', () => {
  render(
    <InvestableAmountChain
      amount={{
        payday: '2026-10-15',
        through: '2026-11-14',
        cashCents: 1234,
        obligationsCents: 1345,
        committedReservesCents: 99,
        needWantAvailableCents: 33,
        rawCents: -243,
        investableCents: 0,
      }}
    />,
  );
  const chain = within(screen.getByRole('region', { name: 'Investierbarer Betrag' }));
  expect(chain.getAllByRole('term').map((term) => term.textContent)).toEqual([
    'Geld auf Budgetkonten',
    'Verpflichtungen bis Gehalt + 30 Tage (bis 14.11.2026)',
    'Gebundene Rücklagen',
    'Verfügbar in Bedarf/Wunsch',
    'Rechnerischer Betrag',
    'Investierbar',
  ]);
  expect(
    chain
      .getAllByRole('definition')
      .map((definition) => definition.textContent?.replace(/\s/g, ' ')),
  ).toEqual(['12,34 €', '− 13,45 €', '− 0,99 €', '− 0,33 €', '= −2,43 €', '0,00 €']);
});
