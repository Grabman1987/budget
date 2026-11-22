// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import { ReadSourceDetail, sourceWarningReason } from './read-source-detail';
import type { SourceOperation } from '@budget/domain';

afterEach(() => {
  cleanup();
  setAmountsHidden(false);
});

it('explains a fiat balance difference with exact snapshot values and the next action', () => {
  const { container } = render(
    <ReadSourceDetail
      detail={JSON.stringify({
        key: 'currency:eur',
        source: '12.35',
        local: 1234,
        scale: 2,
        accountId: 'cash-private-id',
        reason: 'difference',
      })}
    />,
  );

  expect(screen.getByText(/Quelle beim Abgleich: 12,35/)).toBeTruthy();
  expect(screen.getByText(/App beim Abgleich: 12,34/)).toBeTruthy();
  expect(screen.getByText(/Differenz .*\+0,01/)).toBeTruthy();
  expect(screen.getByText(/Keine Währung beim Abgleich angegeben/)).toBeTruthy();
  expect(screen.getByText('Quellreferenz: currency:eur · App-Konto: cash-private-id')).toBeTruthy();
  expect(container.textContent).toContain(
    'Gleiche neue Bewegungen mit dem Hauptbuch ab und führe danach den Abgleich erneut aus.',
  );
});

it('formats fractional asset units at scale 8 without floating point rounding', () => {
  render(
    <ReadSourceDetail
      detail={JSON.stringify({
        key: 'asset:private-id',
        source: '0.00000003',
        local: 2,
        scale: 8,
        accountId: 'depot-private-id',
        reason: 'difference',
      })}
    />,
  );

  expect(screen.getByText(/Quelle beim Abgleich: 0,00000003 Einheiten/)).toBeTruthy();
  expect(screen.getByText(/App beim Abgleich: 0,00000002 Einheiten/)).toBeTruthy();
  expect(screen.getByText(/Differenz .*\+0,00000001 Einheiten/)).toBeTruthy();
});

it('shows missing or invalid snapshot values explicitly', () => {
  const { container, rerender } = render(
    <ReadSourceDetail
      detail={JSON.stringify({ reason: 'difference', source: null, local: null, scale: 2 })}
    />,
  );
  expect(container.textContent?.match(/Beim Abgleich nicht verfügbar/g)).toHaveLength(2);
  expect(screen.getByText(/Differenz.*Nicht berechenbar/)).toBeTruthy();

  rerender(
    <ReadSourceDetail
      detail={JSON.stringify({ reason: 'difference', source: '1.234', local: 12, scale: 5 })}
    />,
  );
  expect(container.textContent).toContain('Genauigkeit beim Abgleich ungültig');
  expect(screen.getByText(/Differenz.*Nicht berechenbar/)).toBeTruthy();
});

it('hides snapshot amounts while amount privacy is enabled', () => {
  setAmountsHidden(true);
  const { container } = render(
    <ReadSourceDetail
      detail={JSON.stringify({
        key: 'currency:private-key',
        source: '12.35',
        local: 1234,
        scale: 2,
        accountId: 'private-account-id',
        reason: 'difference',
      })}
    />,
  );

  expect(container.textContent).toContain('•••');
  expect(container.textContent).toContain('Beträge sind ausgeblendet');
  expect(container.textContent).not.toContain('12.35');
  expect(container.textContent).not.toContain('12,35');
  expect(container.textContent).not.toContain('private-account-id');
  expect(container.textContent).not.toContain('currency:private-key');
});

it('shows the known source reference without exposing the stored object or its unknown fields', () => {
  const { container } = render(
    <ReadSourceDetail
      detail={JSON.stringify({
        id: 'synthetic-operation',
        reason: 'schema',
        field: 'transactions.#.amount',
        unknownField: 'synthetic-raw-field',
      })}
    />,
  );

  expect(screen.getByText('Quellreferenz: synthetic-operation')).toBeTruthy();
  expect(screen.getByText('Betroffenes Quellfeld: transactions.#.amount')).toBeTruthy();
  expect(screen.getByText(/Die Bewegung konnte nicht gelesen werden/)).toBeTruthy();
  expect(container.textContent).not.toContain('synthetic-raw-field');
  expect(container.querySelector('pre')).toBeNull();
});

it('does not echo an unstructured warning in the detail or list', () => {
  const detail = '{"providerDiagnostic": "synthetic-raw-field"';
  render(<ReadSourceDetail detail={detail} />);
  expect(screen.getByText('Keine lesbaren Angaben zum Abgleich gespeichert.')).toBeTruthy();
  expect(screen.queryByText(/synthetic-raw-field/)).toBeNull();
  expect(sourceWarningReason(detail, true)).toBe('Datenquelle oder Zuordnung prüfen.');
});

const reward: SourceOperation = {
  id: 'synthetic-reward',
  type: 'reward',
  transactions: [
    {
      id: 'synthetic-reward-leg',
      type: 'reward',
      walletId: 'synthetic-wallet',
      flow: 'INCOMING',
      creditedAt: '2026-10-01T12:00:00Z',
      tradeId: 'synthetic-trade',
      amount: { assetId: 'synthetic-coin', currencyId: null, value: '0.00000005', cents: null },
      fee: { assetId: 'synthetic-coin', currencyId: null, value: '0.00000001', cents: null },
      balanceAfter: null,
      tradeFee: null,
      compensates: null,
    },
  ],
};

it.each([
  ['mapping_problem', 'Zuordnung von Konto oder Instrument fehlt oder ist ungültig.'],
  ['source_unreadable', 'Der Quellbestand ist nicht verlässlich lesbar.'],
  ['missing_movement', 'Offene Bewegungen erklären die gesamte Bestandsdifferenz.'],
  ['partly_missing_movement', 'Offene Bewegungen erklären einen Teil der Bestandsdifferenz.'],
  ['real_difference', 'Die Bestandsdifferenz ist durch offene Bewegungen nicht erklärt.'],
])('renders the stored cause %s and the exact gross, fee and net trace', (cause, text) => {
  render(
    <ReadSourceDetail
      detail={JSON.stringify({
        reason: 'difference',
        cause,
        source: '0.00000007',
        local: 3,
        scale: 8,
        key: 'asset:synthetic-coin',
        securityId: 'synthetic-security',
        fetchedAt: '2026-10-01T12:00:00Z',
        comparedOn: '2026-10-02',
        openMovementsE8: 4,
        openMovementCount: 1,
        operations: [reward],
      })}
    />,
  );
  expect(screen.getByText(text)).toBeTruthy();
  const trace = screen.getByRole('region', { name: 'Vorgang und Bestandswirkung' });
  expect(trace.textContent).toContain(
    'Brutto: 0,00000005 · Gebühr: 0,00000001 · Netto-Bestandswirkung: 0,00000004',
  );
  expect(trace.textContent).toContain('Handelsreferenz: synthetic-trade');
  expect(trace.textContent).toContain(
    'Summe der Fiatbewegungen laut Quelle (absolut): Nicht verfügbar',
  );
  expect(screen.getByText(/App-Stichtag: 2026-10-02/)).toBeTruthy();
});

it('labels the current mapping separately from stored operation evidence', () => {
  render(
    <ReadSourceDetail
      detail={JSON.stringify({
        ...reward,
        mappings: [
          { key: 'asset:synthetic-coin', accountId: 'synthetic-depot', securityId: 'synthetic-id' },
        ],
      })}
    />,
  );

  expect(
    screen.getByText(
      'Aktuelle Zuordnung: asset:synthetic-coin · App-Konto: synthetic-depot · App-Instrument: synthetic-id',
    ),
  ).toBeTruthy();
});

it('names the missing funding leg and retains known ledger references without inventing a deposit', () => {
  render(
    <ReadSourceDetail
      detail={JSON.stringify({
        ...reward,
        reconciliation: {
          status: 'missing',
          refs: [{ type: 'trade', id: 'synthetic-known', date: '2026-10-01', kind: 'buy' }],
          missingLegs: [
            { key: 'currency:synthetic-eur', incoming: true, day: '2026-09-28', cents: 1234 },
          ],
        },
      })}
    />,
  );
  expect(
    screen.getByText(
      /Einzahlung \/ Finanzierung fehlt im Abgleich: currency:synthetic-eur · 2026-09-28 · 12,34/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/Erfasste Gegenbewegung: Handel · 2026-10-01 · synthetic-known/),
  ).toBeTruthy();
  expect(screen.getByText('Es wird keine Einzahlung oder Korrekturbuchung erzeugt.')).toBeTruthy();
});

it('hides all new trace amounts and raw evidence with privacy enabled', () => {
  setAmountsHidden(true);
  const { container } = render(
    <ReadSourceDetail
      detail={JSON.stringify({
        ...reward,
        reconciliation: {
          status: 'missing',
          missingLegs: [
            { key: 'currency:synthetic-eur', incoming: true, day: '2026-09-28', cents: 1234 },
          ],
        },
      })}
    />,
  );
  expect(container.textContent).not.toMatch(/0[,.]0000000[145]|12[,.]34|1234/);
  expect(container.querySelector('pre')).toBeNull();
});
