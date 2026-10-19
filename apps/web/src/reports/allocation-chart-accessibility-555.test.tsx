// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { ChartValue } from '@budget/ui';
import { cents } from '@budget/domain';
import { expect, it } from 'vitest';
import { AllocationBar } from './allocation-bar';

const data = {
  incomeCents: cents(100_000),
  needCents: cents(50_000),
  wantCents: cents(30_000),
  futureCents: cents(20_000),
  restCents: cents(0),
};
const label = 'Okt 26: Bedarf 50 %, Wunsch 30 %, Zukunft 20 %, Rest 0 % der Einnahmen';

it('keeps standalone allocation bars labelled for the existing Plan and print consumers', () => {
  render(<AllocationBar data={data} label={label} />);
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.getByRole('img', { name: label })).toBeTruthy();
});

it('announces an imported allocation drawing once when the shared wrapper owns its statement', () => {
  render(
    <ChartValue
      label={label}
      date="2026-10"
      series={[
        { name: 'Bedarf', value: '500,00 € · 50 %' },
        { name: 'Wunsch', value: '300,00 € · 30 %' },
        { name: 'Zukunft', value: '200,00 € · 20 %' },
        { name: 'Rest', value: '0,00 € · 0 %' },
      ]}
    >
      <AllocationBar data={data} label={label} decorative />
    </ChartValue>,
  );
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.getByRole('img', { name: label })).toBeTruthy();
  expect(screen.getByRole('group', { name: label })).toBeTruthy();
});
