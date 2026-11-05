// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import { ReadSourceDetail } from './read-source-detail';

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

it('hides amounts and raw JSON while amount privacy is enabled', () => {
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

it('masks amounts in legacy free-text details', () => {
  setAmountsHidden(true);
  render(<ReadSourceDetail detail="Quellsaldo 12,34 EUR stimmt nicht überein." />);

  expect(screen.getByText('Quellsaldo ••• EUR stimmt nicht überein.')).toBeTruthy();
});
