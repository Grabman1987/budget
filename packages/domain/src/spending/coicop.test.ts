import { expect, it } from 'vitest';
import { coicopLabel, cpiPriceLevels } from './coicop';
import { personalInflation } from './inflation';
import { monthsBetween } from '../date';

it('weights a CPI price relative with own spending, never the index level or source weight', () => {
  const months = monthsBetween('2023-10', '2024-10');
  const prices = { food: Object.fromEntries(months.map((m) => [m, m < '2024-10' ? 200 : 220])) };
  const level = cpiPriceLevels(months, [{ code: 'food', shareBp: 10000 }], prices);
  const spend = Object.fromEntries(months.map((m) => [m, 1000]));
  const result = personalInflation({
    available: months,
    baseConsumptionCents: 52000,
    items: [
      { id: 'food', name: 'Lebensmittel', class: 'need', source: 'cpi', level, spend },
      {
        id: 'rent',
        name: 'Wohnen',
        class: 'need',
        level: Object.fromEntries(months.map((m) => [m, 3000])),
        spend: Object.fromEntries(months.map((m) => [m, 3000])),
      },
    ],
  });
  expect(result.points.at(-1)?.index).toBe(102.5);
  expect(result.basket.find((b) => b.id === 'food')).toMatchObject({
    shareBp: 2500,
    changeBp: 1000,
    contributionBp: 250,
  });
  expect(
    cpiPriceLevels(months, [{ code: 'missing', shareBp: 10000 }], prices)['2024-10'],
  ).toBeNull();
});

it('rebases two different class levels before applying a split and leaves missing months unavailable', () => {
  const level = cpiPriceLevels(
    ['2023-10', '2023-11', '2023-12'],
    [
      { code: 'food', shareBp: 8000 },
      { code: 'care', shareBp: 2000 },
    ],
    {
      food: { '2023-10': 200, '2023-11': 220, '2023-12': 230 },
      care: { '2023-10': 50, '2023-11': 60 },
    },
  );
  expect(level).toEqual({ '2023-10': 10000, '2023-11': 11200, '2023-12': null });
});

it('formats fractional class splits in the German locale', () => {
  expect(
    coicopLabel([
      { code: '01.1', shareBp: 3333 },
      { code: '12.1.3', shareBp: 6667 },
    ]),
  ).toContain('(33,33 %)');
});
