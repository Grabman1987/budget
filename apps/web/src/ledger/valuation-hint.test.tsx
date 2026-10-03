// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mergeValuationNotes, ValuationHint, valuationHintText } from './valuation-hint';

const note = (securityId: string, quality: 'estimated' | 'missing' = 'estimated') => ({
  securityId,
  quality,
  from: '2026-01-06',
  to: '2026-01-13',
  name: `Instrument ${securityId}`,
});

afterEach(cleanup);

describe('ValuationHint', () => {
  it('says how many securities are valued without a quote', () => {
    expect(valuationHintText(1)).toBe('Bewertung teilweise geschätzt: 1 Wertpapier ohne Kurs');
    expect(valuationHintText(4)).toBe('Bewertung teilweise geschätzt: 4 Wertpapiere ohne Kurs');
    render(<ValuationHint incomplete={[note('a'), note('b')]} />);
    const hint = screen.getByTestId('valuation-hint');
    expect(hint.textContent).toContain('Bewertung teilweise geschätzt: 2 Wertpapiere ohne Kurs');
    expect(hint.textContent).toContain('Instrument a, Instrument b');
    expect(hint.textContent).not.toContain('fehlen sie in der Summe');
  });

  it('warns that a security without any cost basis is missing from the sum', () => {
    render(<ValuationHint incomplete={[note('a', 'missing')]} />);
    expect(screen.getByTestId('valuation-hint').textContent).toContain('fehlen sie in der Summe');
  });

  it('renders nothing without incomplete securities', () => {
    const { container, rerender } = render(<ValuationHint incomplete={[]} />);
    expect(container.firstChild).toBeNull();
    rerender(<ValuationHint />);
    expect(container.firstChild).toBeNull();
  });

  it('merges the notes of several answers per security, the worse quality wins', () => {
    const merged = mergeValuationNotes([note('a'), note('b')], undefined, [note('a', 'missing')]);
    expect(merged.map((n) => [n.securityId, n.quality])).toEqual([
      ['a', 'missing'],
      ['b', 'estimated'],
    ]);
  });
});
