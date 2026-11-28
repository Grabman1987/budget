import { describe, expect, it } from 'vitest';
import { summarizeOpenSinceSettlement } from './open-summary';

describe('summarizeOpenSinceSettlement', () => {
  it('adds outlays and due contributions and subtracts usable credit', () => {
    const s = summarizeOpenSinceSettlement({
      outlays: [
        { date: '2026-09-20', payeeName: 'Laden', memo: 'Einkauf', remainingCents: 700 },
        { date: '2026-09-01', memo: null, remainingCents: 2501 },
      ],
      credits: [
        { remainingCents: 1000, usable: true },
        { remainingCents: 999, usable: false },
      ],
      contributions: [{ name: 'Mietanteil', dueDate: '2026-10-03', amountCents: 80000 }],
    });
    expect(s).toMatchObject({
      outlayCents: 3201,
      creditCents: 1000,
      contributionCents: 80000,
      dueCents: 82201,
    });
    expect(s.text).toBe(
      [
        'Offene Auslagen:',
        '01.09.2026 Auslage: 25,01 €',
        '20.09.2026 Laden - Einkauf: 7,00 €',
        'Summe Auslagen: 32,01 €',
        'Abzüglich Guthaben: -10,00 €',
        '',
        'Fällige Beiträge:',
        '03.10.2026 Mietanteil: 800,00 €',
        '',
        'Gesamt offen: 822,01 €',
      ].join('\n'),
    );
  });

  it('never lets credit exceed the outlays and ignores settled rows', () => {
    const s = summarizeOpenSinceSettlement({
      outlays: [{ date: '2026-09-01', remainingCents: 500 }],
      credits: [{ remainingCents: 900, usable: true }],
      contributions: [],
    });
    expect(s.creditCents).toBe(500);
    expect(s.dueCents).toBe(0);
    expect(summarizeOpenSinceSettlement({ outlays: [], credits: [], contributions: [] }).text).toBe(
      'Gesamt offen: 0,00 €',
    );
  });
});

it('writes thousands with a plain space, never a no-break space', () => {
  const s = summarizeOpenSinceSettlement({
    outlays: [{ date: '2026-09-01', remainingCents: 123456 }],
    credits: [],
    contributions: [],
  });
  expect(s.text).toContain('1 234,56 €');
  expect(s.text).not.toMatch(/[\u00a0\u202f]/);
});
