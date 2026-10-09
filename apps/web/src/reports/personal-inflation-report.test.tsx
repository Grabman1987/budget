// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { addMonths, personalInflation } from '@budget/domain';
import type { InflationReport } from '@budget/db';
import { BasketBody } from './personal-inflation-report';

afterEach(cleanup);
const available = Array.from({ length: 25 }, (_, i) => addMonths('2024-08', i));
const data: InflationReport = {
  ...personalInflation({
    available,
    items: ['stored', 'bookings', 'trailing', 'cpi'].map((source, i) => ({
      id: source,
      name: `Position ${i + 1}`,
      class: 'need' as const,
      source: source as 'stored' | 'bookings' | 'trailing' | 'cpi',
      level: Object.fromEntries(available.map((m, n) => [m, n < 13 ? 10_000 : 11_000])),
      spend: Object.fromEntries(available.map((m) => [m, 10_000])),
    })),
    baseConsumptionCents: 12 * 80_000,
  }),
  explorer: [],
  basketSettings: [],
  hasOverrides: false,
  excludedCategories: 1,
  excluded: [],
  referenceAvailable: false,
  reference: null,
  insufficientReason: null,
  derivedContracts: [],
  referenceLatest: null,
};

it('qualifies a mixed headline before the details and marks basket measurement types in both views', () => {
  render(<BasketBody data={data} />);
  const figure = screen.getByTestId('pi-rate').parentElement!;
  expect(figure.textContent).toContain('Preis und Verbrauch');
  expect(screen.getByTestId('pi-method').textContent).toContain('Kategorieproxy');
  const basket = screen.getByTestId('inflation-basket');
  expect(within(basket).getByRole('row', { name: /Position 1/ }).textContent).toContain(
    'Preis · gespeichert',
  );
  expect(within(basket).getByRole('row', { name: /Position 2/ }).textContent).toContain(
    'Preis · aus Buchungen abgeleitet',
  );
  expect(within(basket).getByRole('row', { name: /Position 3/ }).textContent).toContain(
    'Durchschnittsausgabe',
  );
  expect(within(basket).getByRole('row', { name: /Position 4/ }).textContent).toContain(
    'Kategorieproxy',
  );
  expect(screen.getByTestId('pi-coverage').textContent).toContain('50 %');
  fireEvent.click(screen.getByRole('button', { name: 'Je Jahr' }));
  expect(screen.getByTestId('inflation-basket-yearly').textContent).toContain(
    'Durchschnittsausgabe',
  );
  expect(screen.getByTestId('inflation-basket-yearly').textContent).toContain('Kategorieproxy');
});

it('names the separate comparison, rolling-mean and contribution windows', () => {
  render(<BasketBody data={data} />);
  const basket = screen.getByTestId('inflation-basket');
  expect(within(basket).getByRole('row', { name: /Position 1/ }).textContent).toContain('Aug 24');
  expect(within(basket).getByRole('row', { name: /Position 1/ }).textContent).toContain('Aug 26');
  const trailing = within(basket).getByRole('row', { name: /Position 3/ });
  expect(trailing.textContent).toContain('Sep 25 bis Aug 26');
  const contribution = screen
    .getByRole('heading', { name: 'Beitrag je Kategorie' })
    .closest('section')!;
  expect(contribution.textContent).toContain('Aug 25 bis Aug 26');
});

it('labels a price-only basket without claiming consumption is measured', () => {
  render(
    <BasketBody data={{ ...data, basket: data.basket.filter((b) => b.source !== 'trailing') }} />,
  );
  expect(screen.getByTestId('pi-rate').parentElement!.textContent).toContain('Preisbeobachtung');
});
