// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ValuationHint,
  ValuationSourceHint,
  valuationSourceText,
  type ValuationSource,
} from './valuation-hint';
import { eur } from './format';
import { overviewGroupValuationSources, overviewValuationSources } from './overview-page';

const quote: ValuationSource = {
  accountId: 'synthetic',
  securityId: 'held',
  name: 'Synthetic held',
  asOf: '2026-09-20',
  kind: 'quote',
  quality: 'exact',
  date: '2026-09-18',
  currency: 'USD',
  source: 'manual',
  lookAhead: false,
  positiveHolding: true,
  quoteNeeded: false,
  missing: null,
  fx: { kind: 'rate', date: '2026-09-19', source: 'ecb' },
};
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
});
it('places an accessible marker next to the real formatted value and explains actual quote and FX dates', () => {
  render(
    <p>
      {eur(11400)}
      <ValuationSourceHint sources={[quote]} label="Synthetic account" />
    </p>,
  );
  const marker = screen.getByRole('button', { name: 'Bewertungsgrundlage · Synthetic account' });
  expect(marker.textContent).toBe('≈');
  const tooltip = document.getElementById(marker.getAttribute('aria-describedby')!);
  expect(tooltip?.textContent).toContain('Kurs vom 18.09.2026 fortgeschrieben · manuell');
  expect(tooltip?.textContent).toContain(
    'Wechselkurs USD/EUR vom 19.09.2026 fortgeschrieben · EZB',
  );
  const show = vi.fn();
  Object.defineProperty(tooltip, 'showPopover', { value: show });
  fireEvent.focus(marker);
  fireEvent.mouseEnter(marker);
  fireEvent.click(marker);
  expect(show).toHaveBeenCalledTimes(3);
});
it('retains the reason, keyboard trigger and no amount in hidden-mode labels, tooltips or titles', () => {
  act(() => setAmountsHidden(true));
  render(
    <p>
      {eur(11400)}
      <ValuationSourceHint sources={[quote]} label="Synthetic account" />
    </p>,
  );
  expect(screen.getByText('••• €')).toBeTruthy();
  const button = screen.getByRole('button', { name: 'Bewertungsgrundlage · Synthetic account' });
  button.focus();
  expect(document.activeElement).toBe(button);
  expect(document.body.textContent).not.toContain('114');
  expect(document.body.innerHTML).not.toContain('11400');
  expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain(
    '18.09.2026',
  );
});
it('opens the valuation explanation above a low trigger without covering its click target', () => {
  vi.stubGlobal('innerHeight', 768);
  try {
    render(<ValuationSourceHint sources={[quote]} label="Synthetic account" />);
    const marker = screen.getByRole('button', { name: 'Bewertungsgrundlage · Synthetic account' });
    const popup = document.getElementById(marker.getAttribute('aria-describedby')!)!;
    vi.spyOn(marker, 'getBoundingClientRect').mockReturnValue({
      x: 24,
      y: 600,
      top: 600,
      bottom: 644,
      left: 24,
      right: 68,
      width: 44,
      height: 44,
      toJSON: () => ({}),
    });
    vi.spyOn(popup, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      bottom: 300,
      left: 0,
      right: 300,
      width: 300,
      height: 300,
      toJSON: () => ({}),
    });
    vi.spyOn(popup, 'matches').mockReturnValue(true);
    fireEvent(popup, new Event('toggle'));
    expect(popup.style.top).toBe('292px');
    expect(Number.parseFloat(popup.style.top) + 300).toBeLessThan(600);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('differentiates lookahead execution, cost estimate and missing conversion, rather than inventing a quote or parity', () => {
  expect(
    valuationSourceText({
      ...quote,
      kind: 'execution',
      date: '2026-09-21',
      source: null,
      lookAhead: true,
    }),
  ).toContain('Brutto-Ausführung vom 21.09.2026 · später als der Stichtag');
  expect(valuationSourceText({ ...quote, kind: 'cost', date: null })).toContain(
    'Einstandswert als Schätzung',
  );
  expect(
    valuationSourceText({
      ...quote,
      kind: 'missing',
      date: null,
      missing: 'price',
      fx: { kind: 'missing', date: null, source: null },
    }),
  ).toContain('Bewertung fehlt · EUR-Umrechnung fehlt · USD');
});
it('renders no marker for a same-day EUR quote, while retaining the original Wealth/Reports hint contract', () => {
  const { container, unmount } = render(
    <ValuationSourceHint
      sources={[
        {
          ...quote,
          date: quote.asOf,
          currency: 'EUR',
          fx: { kind: 'identity', date: null, source: null },
        },
      ]}
      label="Synthetic"
    />,
  );
  expect(container.childElementCount).toBe(0);
  unmount();
  render(
    <ValuationHint
      incomplete={[
        {
          securityId: 'held',
          quality: 'estimated',
          from: quote.asOf,
          to: quote.asOf,
          name: 'Synthetic held',
        },
      ]}
    />,
  );
  expect(screen.getByTestId('valuation-hint').textContent).toContain(
    'Bewertung teilweise geschätzt: 1 Wertpapier ohne Kurs',
  );
});

it('attaches linked depot cash provenance to the existing settlement figure, not its securities-only figure', () => {
  const cash = {
    ...quote,
    securityId: null,
    name: null,
    kind: 'cash' as const,
    quoteNeeded: false,
    positiveHolding: false,
  };
  const mapped = overviewValuationSources([
    {
      id: 'depot',
      type: 'brokerage',
      closedAt: null,
      referenceAccountId: 'settlement',
      valuationSources: [
        { ...quote, accountId: 'depot' },
        { ...cash, accountId: 'depot' },
      ],
    },
    {
      id: 'settlement',
      type: 'checking',
      closedAt: null,
      valuationSources: [{ ...cash, accountId: 'settlement' }],
    },
  ]);
  expect(mapped.get('depot')).toEqual([{ ...quote, accountId: 'depot' }]);
  expect(mapped.get('settlement')).toEqual([
    { ...cash, accountId: 'settlement' },
    { ...cash, accountId: 'depot' },
  ]);
});

it('keeps unknown unlinked USD cash in the group disclosure when its fresh EUR holding remains known', () => {
  const holding = {
    ...quote,
    accountId: 'depot',
    date: quote.asOf,
    currency: 'EUR',
    fx: { kind: 'identity' as const, date: null, source: null },
  };
  const cash: ValuationSource = {
    ...quote,
    accountId: 'depot',
    securityId: null,
    name: null,
    kind: 'cash',
    quality: 'missing',
    currency: 'USD',
    quoteNeeded: false,
    positiveHolding: false,
    missing: 'fx',
    fx: { kind: 'missing', date: null, source: null },
  };
  // Actual tree case: known EUR holding, unknown cash and therefore unknown group sum.
  // No synthetic cash amount is supplied or inferred by the source mapper.
  const accounts = [
    { id: 'depot', type: 'brokerage' as const, closedAt: null, valuationSources: [holding, cash] },
  ];
  const rows = overviewValuationSources(accounts);
  expect(rows.get('depot')).toEqual([holding]);
  const group = overviewGroupValuationSources(accounts, rows);
  expect(group).toEqual([holding, cash]);
  render(
    <p>
      Kurs fehlt
      <ValuationSourceHint sources={group} label="Depots" />
    </p>,
  );
  const marker = screen.getByRole('button', { name: 'Bewertungsgrundlage · Depots' });
  const detail = document.getElementById(marker.getAttribute('aria-describedby')!);
  expect(detail?.textContent).toContain('EUR-Umrechnung fehlt · USD');
  expect(detail?.textContent).not.toContain('Kurs vom');
  expect(group.filter((source) => source.quoteNeeded)).toHaveLength(0);
});
