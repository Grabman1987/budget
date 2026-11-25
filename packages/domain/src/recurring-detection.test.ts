import { describe, expect, it } from 'vitest';
import {
  counterpartyKey,
  detectRecurrence,
  looseKeyUsable,
  matchesAssignment,
  ownAccountTransferTarget,
} from './index';

const ev = (dates: string[], cents: number | number[]) =>
  dates.map((date, i) => ({ date, amountCents: Array.isArray(cents) ? cents[i]! : cents }));

describe('counterpartyKey', () => {
  it('drops processor prefix and volatile digits, is idempotent', () => {
    const key = counterpartyKey('PAYPAL *Kino Beispiel 1234567  ');
    expect(key).toBe('kino beispiel');
    expect(counterpartyKey(key)).toBe(key);
    expect(counterpartyKey('SumUp  *Kino Beispiel 99887')).toBe(key);
  });
  it('keeps a purely numeric or bare processor text', () => {
    expect(counterpartyKey('123456')).toBe('123456');
    expect(counterpartyKey('PayPal')).toBe('paypal');
  });
  it('matches across such noise only when loose matching is requested', () => {
    const match = {
      mode: 'all' as const,
      conditions: [{ type: 'counterparty' as const, text: 'kino beispiel' }],
    };
    const row = (counterparty: string) => ({
      accountId: 'a',
      amountCents: -900,
      payeeId: null,
      rawText: counterparty,
      counterparty,
    });
    expect(matchesAssignment(match, row('PAYPAL *KINO BEISPIEL 5551234'))).toBe(false);
    expect(matchesAssignment(match, row('PAYPAL *KINO BEISPIEL 5551234'), true)).toBe(true);
    expect(matchesAssignment(match, row('  Kino   Beispiel '))).toBe(true);
    expect(matchesAssignment(match, row('Kino Anders'), true)).toBe(false);
  });
  it('never matches loosely on short or generic keys', () => {
    expect(looseKeyUsable('abc')).toBe(false);
    expect(looseKeyUsable('dauerauftrag')).toBe(false);
    expect(looseKeyUsable('sepa überweisung')).toBe(false);
    expect(looseKeyUsable('miete wohnung')).toBe(true);
    const match = {
      mode: 'all' as const,
      conditions: [{ type: 'counterparty' as const, text: 'dauerauftrag 1234567' }],
    };
    const row = {
      accountId: 'a',
      amountCents: -900,
      payeeId: null,
      rawText: 'x',
      counterparty: 'Dauerauftrag 7654321',
    };
    expect(matchesAssignment(match, row, true)).toBe(false);
  });
});

describe('ownAccountTransferTarget', () => {
  const accounts = [
    { id: 'self', name: 'Girokonto' },
    { id: 'depot', name: 'Beispiel Depot', ibans: ['DE89 3704 0044 0532 0130 00'] },
    { id: 'spar', name: 'Sparkonto Alpha', ibanTails: ['9911'] },
    { id: 'spar2', name: 'Sparkonto Beta' },
  ];
  it('matches a full IBAN in any spacing', () => {
    expect(
      ownAccountTransferTarget('Überweisung DE89370400440532013000 Depot', 'self', accounts),
    ).toBe('depot');
  });
  it('matches an IBAN by its known tail', () => {
    expect(ownAccountTransferTarget('an AT611904300234579911', 'self', accounts)).toBe('spar');
  });
  it('matches the account name only as the whole text', () => {
    expect(ownAccountTransferTarget('beispiel depot', 'self', accounts)).toBe('depot');
    expect(
      ownAccountTransferTarget('Umbuchung Sparkonto Alpha Dauerauftrag', 'self', accounts),
    ).toBeNull();
    expect(ownAccountTransferTarget('Beispiel Depotbank AG', 'self', accounts)).toBeNull();
  });
  it('never proposes the own account and refuses ambiguity', () => {
    expect(ownAccountTransferTarget('Girokonto', 'self', accounts)).toBeNull();
    expect(
      ownAccountTransferTarget('AT611904300234579911', 'self', [
        ...accounts,
        { id: 'twin', name: 'Zwilling', ibanTails: ['9911'] },
      ]),
    ).toBeNull();
  });
});

describe('detectRecurrence', () => {
  it('detects a fixed monthly amount from three occurrences', () => {
    const r = detectRecurrence(ev(['2026-08-05', '2026-09-04', '2026-10-05'], -1299), '2026-10-20');
    expect(r).toMatchObject({
      rhythm: 'monthly',
      dueDay: 5,
      amountCents: 1299,
      toleranceCents: 0,
      count: 3,
      lastDate: '2026-10-05',
      startDate: null,
    });
  });
  it('needs at least three occurrences', () => {
    expect(detectRecurrence(ev(['2026-09-04', '2026-10-05'], -1299), '2026-10-20')).toBeNull();
  });
  it('accepts a variable amount within 10 % and rejects beyond', () => {
    const dates = ['2026-08-10', '2026-09-10', '2026-10-10'];
    const ok = detectRecurrence(ev(dates, [-5000, -5400, -4800]), '2026-10-12');
    expect(ok?.amountCents).toBe(5000);
    expect(ok?.toleranceCents).toBe(400);
    expect(detectRecurrence(ev(dates, [-5000, -6500, -4800]), '2026-10-12')).toBeNull();
  });
  it('detects quarterly, half-yearly and yearly with the due month', () => {
    expect(
      detectRecurrence(ev(['2026-01-15', '2026-04-15', '2026-07-15'], -3000), '2026-08-01'),
    ).toMatchObject({ rhythm: 'quarterly', dueMonth: 1, dueDay: 15 });
    expect(
      detectRecurrence(ev(['2025-01-02', '2025-07-01', '2026-01-02'], -9000), '2026-02-01'),
    ).toMatchObject({ rhythm: 'semiannual', dueMonth: 1 });
    expect(
      detectRecurrence(ev(['2024-03-20', '2025-03-20', '2026-03-20'], -12000), '2026-06-01'),
    ).toMatchObject({ rhythm: 'yearly', dueMonth: 3, dueDay: 20 });
  });
  it('detects weekly and fortnightly with an anchor date', () => {
    expect(
      detectRecurrence(ev(['2026-10-01', '2026-10-08', '2026-10-15'], 2500), '2026-10-17'),
    ).toMatchObject({ rhythm: 'weekly', intervalWeeks: 1, startDate: '2026-10-15' });
    expect(
      detectRecurrence(ev(['2026-09-17', '2026-10-01', '2026-10-15'], 2500), '2026-10-17'),
    ).toMatchObject({ rhythm: 'weekly', intervalWeeks: 2 });
  });
  it('tolerates one skipped occurrence (a gap of twice the cadence), once only', () => {
    expect(
      detectRecurrence(
        ev(['2026-05-05', '2026-06-05', '2026-08-05', '2026-09-05'], -999),
        '2026-09-20',
      ),
    ).toMatchObject({ rhythm: 'monthly', count: 4 });
    expect(
      detectRecurrence(
        ev(['2026-02-05', '2026-04-05', '2026-06-05', '2026-08-05', '2026-09-05'], -999),
        '2026-09-20',
      ),
    ).toBeNull();
  });
  it('tolerates late or early bookings by a few days', () => {
    expect(
      detectRecurrence(
        ev(['2026-07-01', '2026-08-05', '2026-09-02', '2026-10-06'], -999),
        '2026-10-20',
      ),
    ).toMatchObject({ rhythm: 'monthly' });
    expect(
      detectRecurrence(ev(['2026-10-01', '2026-10-09', '2026-10-15'], 500), '2026-10-17'),
    ).toMatchObject({ rhythm: 'weekly', intervalWeeks: 1 });
    expect(
      detectRecurrence(ev(['2026-07-01', '2026-08-09', '2026-09-20'], -999), '2026-10-01'),
    ).toBeNull();
  });
  it('judges the cadence on the median gap', () => {
    expect(
      detectRecurrence(
        ev(['2026-04-05', '2026-05-05', '2026-06-04', '2026-07-05', '2026-08-04'], -999),
        '2026-08-20',
      )?.rhythm,
    ).toBe('monthly');
  });
  it('accepts a single price change when the last three amounts are steady', () => {
    const dates = ['2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05'];
    const r = detectRecurrence(ev(dates, [-1000, -1000, -1500, -1500, -1500]), '2026-09-20');
    expect(r).toMatchObject({ amountCents: 1500, toleranceCents: 0 });
    expect(
      detectRecurrence(ev(dates, [-1000, -1500, -1000, -1500, -1000]), '2026-09-20'),
    ).toBeNull();
  });
  it('rejects irregular gaps and stale series', () => {
    expect(
      detectRecurrence(ev(['2026-06-01', '2026-06-20', '2026-10-05'], -1000), '2026-10-10'),
    ).toBeNull();
    expect(
      detectRecurrence(ev(['2025-01-05', '2025-02-05', '2025-03-05'], -1000), '2026-10-10'),
    ).toBeNull();
  });
});
