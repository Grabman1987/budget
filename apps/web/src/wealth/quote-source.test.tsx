import { expect, it } from 'vitest';
import { latestQuoteFailure, quoteFailureText, validArivaLink } from './quote-source';

it('explains each quote failure and uses only known currencies', () => {
  expect(quoteFailureText('empty', 'EUR')).toBe(
    'Die Quelle liefert für diesen Zeitraum keine Kurse',
  );
  expect(quoteFailureText('http', 'EUR')).toBe('Die Quelle war nicht erreichbar');
  expect(quoteFailureText('currency_mismatch', 'EUR', 'USD')).toBe(
    'Die Quelle liefert USD, das Wertpapier wird in EUR geführt',
  );
  expect(quoteFailureText('currency_mismatch', 'EUR')).toBe(
    'Die Quelle liefert eine andere Kurswährung; das Wertpapier wird in EUR geführt',
  );
});

it('does not invent the instrument currency when it is unknown', () => {
  expect(quoteFailureText('currency_mismatch')).toBe('Die Quelle liefert eine andere Kurswährung');
});

it('accepts only the existing Ariva parser allowlist', () => {
  expect(
    validArivaLink('https://www.ariva.de/etf/synthetic/kurse/historische-kurse?boerse_id=45'),
  ).toBe(true);
  for (const value of [
    '',
    'http://ariva.de/etf/test/kurse',
    'https://example.org/kurse',
    'https://ariva.de.evil.example/kurse',
    'https://user:pass@ariva.de/kurse',
    'https://ariva.de/etf/test',
  ])
    expect(validArivaLink(value)).toBe(false);
});

it('does not report a failed primary when the same refresh succeeded on its fallback', () => {
  const failed = { attemptedAt: '2026-11-16T01:00:00.000Z', outcome: 'http' };
  const success = { attemptedAt: failed.attemptedAt, outcome: 'ok' };
  expect(latestQuoteFailure([failed, success])).toBeNull();
  expect(latestQuoteFailure([success, failed])).toBeNull();
});

it('reports a newer failed refresh even when an older refresh succeeded', () => {
  const older = { attemptedAt: '2026-11-15T01:00:00.000Z', outcome: 'ok' };
  const newer = { attemptedAt: '2026-11-16T01:00:00.000Z', outcome: 'empty' };
  expect(latestQuoteFailure([older, newer])).toBe('empty');
  expect(latestQuoteFailure([newer, older])).toBe('empty');
  expect(latestQuoteFailure()).toBeNull();
});
