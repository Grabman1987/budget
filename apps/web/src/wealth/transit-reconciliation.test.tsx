// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TransitReconciliation } from './transit-reconciliation';

afterEach(cleanup);
it('labels raw cash and the separate signed transit bridge, including missing FX and old responses', () => {
  const data = {
    label: 'Geld unterwegs' as const,
    asOf: '2026-11-01',
    accountIds: ['synthetic-source', 'synthetic-recipient'],
    rawCashCents: 50000,
    transitCents: 10000,
    cashIncludingTransitCents: 60000,
    missingFxAccountIds: [] as string[],
  };
  const { rerender } = render(<TransitReconciliation data={data} />);
  const line = () => screen.getByTestId('transit-reconciliation').textContent?.replace(/\s+/g, ' ');
  expect(line()).toContain('Geld unterwegs: 100,00 €');
  expect(line()).toContain('Kontogeld: 500,00 €');
  expect(line()).toContain('Kontogeld inkl. Geld unterwegs: 600,00 €');
  expect(line()).toContain('Umfang: 2 ausgewählte Konten');
  rerender(<TransitReconciliation data={{ ...data, rawCashCents: 70000, transitCents: -10000 }} />);
  expect(line()).toContain('Geld unterwegs: −100,00 €');
  rerender(
    <TransitReconciliation
      data={{
        ...data,
        rawCashCents: null,
        transitCents: null,
        cashIncludingTransitCents: null,
        missingFxAccountIds: ['synthetic-recipient'],
      }}
    />,
  );
  expect(line()).toContain('Geld unterwegs: nicht ermittelbar');
  expect(line()).toContain('Wechselkurs fehlt.');
  rerender(<TransitReconciliation data={{ ...data, transitCents: 0 }} />);
  expect(screen.queryByTestId('transit-reconciliation')).toBeNull();
  rerender(<TransitReconciliation data={undefined} />);
  expect(screen.queryByTestId('transit-reconciliation')).toBeNull();
});
