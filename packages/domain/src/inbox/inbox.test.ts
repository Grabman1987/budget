import { describe, expect, it } from 'vitest';
import { marketValueCents, priceMicroForValue } from '../invest';
import {
  INBOX_GROUPS,
  inboxGroupOf,
  inboxMinutes,
  isStaleValue,
  missedText,
  overspentText,
  staleText,
  suggestCategory,
  uncategorizedText,
  versionActionLabel,
  versionText,
} from './inbox';

describe('inbox groups', () => {
  it('keeps the order of the prototype plus Regeln and Sonstiges', () => {
    expect(INBOX_GROUPS.map((g) => g.title)).toEqual([
      'Überziehung',
      'Ohne Kategorie',
      'Mögliche Umbuchung',
      'Erwartete Zahlung weicht ab',
      'Veralteter Wert',
      'Bank-Einwilligung',
      'Regeln',
      'Sonstiges',
    ]);
  });

  it('places every kind, P4 items generically', () => {
    expect(inboxGroupOf('overspent', 'category')).toBe('over');
    expect(inboxGroupOf('uncategorized', 'booking')).toBe('uncat');
    expect(inboxGroupOf('expected_payment', null)).toBe('version');
    expect(inboxGroupOf('stale_value', 'security')).toBe('stale');
    expect(inboxGroupOf('consent', null)).toBe('consent');
    expect(inboxGroupOf('revision', 'rule')).toBe('rules');
    expect(inboxGroupOf('import', 'transfer')).toBe('transfer');
    expect(inboxGroupOf('import', 'run')).toBe('other');
    expect(inboxGroupOf('backup', 'encrypted_backup')).toBe('other');
    expect(inboxGroupOf('other', 'savings_plan')).toBe('other');
  });
});

describe('inboxMinutes', () => {
  it('takes 0,7 minutes per item and at least one', () => {
    expect([0, 1, 2, 5, 9, 10].map(inboxMinutes)).toEqual([0, 1, 1, 4, 6, 7]);
  });
});

describe('suggestCategory', () => {
  it('prefers the payee default', () => {
    expect(suggestCategory('c-default', ['c-a', 'c-a'])).toBe('c-default');
  });
  it('takes the most frequent recent category', () => {
    expect(suggestCategory(null, ['c-b', 'c-a', 'c-a'])).toBe('c-a');
  });
  it('breaks a tie towards the newest', () => {
    expect(suggestCategory(null, ['c-b', 'c-a', 'c-a', 'c-b'])).toBe('c-b');
  });
  it('has no suggestion without history', () => {
    expect(suggestCategory(null, [])).toBeNull();
  });
});

describe('isStaleValue', () => {
  it('is stale only beyond the threshold', () => {
    expect(isStaleValue(30)).toBe(false);
    expect(isStaleValue(31)).toBe(true);
    expect(isStaleValue(10, 7)).toBe(true);
  });
});

describe('wording', () => {
  it('reads like the prototype', () => {
    expect(overspentText('Treibstoff', 1240)).toEqual({
      title: 'Treibstoff ist überzogen',
      detail: '−12,40 € · im Plan aus einem anderen Envelope decken',
    });
    expect(uncategorizedText('Restaurant', -7250, '2026-09-05', 'Kreditkarte')).toEqual({
      title: 'Restaurant · −72,50 €',
      detail: '05.09. · Kreditkarte',
    });
    expect(versionText('Strom', '2026-10', -11800, -10500)).toEqual({
      title: 'Strom: neuer Betrag ab Oktober',
      detail: '118,00 € statt 105,00 € laut letzter Buchung',
    });
    expect(versionActionLabel('2026-10')).toBe('Ab Oktober übernehmen');
    expect(missedText('Miete', '2026-09-01').title).toBe('Miete: Zahlung fehlt');
    expect(staleText('P2P', 34, 423000)).toEqual({
      title: 'P2P: Wert seit 34 Tagen nicht aktualisiert',
      detail: 'zuletzt 4.230,00 € · manuell',
    });
  });
});

describe('priceMicroForValue', () => {
  it('inverts marketValueCents', () => {
    const units = 123_456_789; // 1,23456789 units
    const price = priceMicroForValue(423_000, units);
    expect(marketValueCents(units, price)).toBe(423_000);
  });
  it('rounds half up', () => {
    expect(priceMicroForValue(1, 10_000_000_000)).toBe(100);
    expect(priceMicroForValue(1, 300_000_000)).toBe(3333);
    expect(priceMicroForValue(2, 300_000_000)).toBe(6667);
  });
  it('refuses empty positions', () => {
    expect(() => priceMicroForValue(100, 0)).toThrow(RangeError);
  });
});
