import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { YNAB_FILE_NAMES, ynabExport, ynabLedger } from './generate';

const committed = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../ynab-export/${name}`, import.meta.url))),
  );
const indexOf = (bytes: Uint8Array, needle: number[]) =>
  bytes.findIndex((_, i) => needle.every((b, k) => bytes[i + k] === b));

describe('synthetic YNAB export', () => {
  const files = ynabExport(1);

  it('is deterministic by seed and equals the committed files byte for byte', () => {
    const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));
    const again = ynabExport(1);
    expect(same(again.register, files.register) && same(again.plan, files.plan)).toBe(true);
    expect(same(ynabExport(2).register, files.register)).toBe(false);
    // Regenerate with `npm run fixtures:ynab` after changing the generator.
    expect(same(committed(YNAB_FILE_NAMES.register), files.register)).toBe(true);
    expect(same(committed(YNAB_FILE_NAMES.plan), files.plan)).toBe(true);
  });

  it('has the file format: BOM, CRLF only, quoted fields, CESU-8 and UTF-8 emoji', () => {
    for (const bytes of [files.register, files.plan]) {
      expect([...bytes.slice(0, 4)]).toEqual([0xef, 0xbb, 0xbf, 0x22]);
      const lf = bytes.reduce(
        (n, b, i) => n + (b === 0x0a ? 1 : 0) - (b === 0x0a && bytes[i - 1] === 0x0d ? 1 : 0),
        0,
      );
      expect(lf).toBe(0);
      // 🛒 as CESU-8 surrogates and as proper UTF-8, in different rows.
      expect(indexOf(bytes, [0xed, 0xa0, 0xbd, 0xed, 0xbb, 0x92])).toBeGreaterThan(0);
      expect(indexOf(bytes, [0xf0, 0x9f, 0x9b, 0x92])).toBeGreaterThan(0);
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(files.register);
    expect(text).toContain('"€0,00"');
    expect(text).toContain('"Gutschein ""Sommer"""');
    expect(text).toMatch(/"\d{2}\.\d{2}\.\d{4}"/);
    expect(new TextDecoder().decode(files.plan)).toMatch(/"Dec 2022"/);
  });

  it('covers ≥ 3 years, ≥ 10 accounts, ≥ 40 categories and every documented edge case', () => {
    const { rows, months, plan } = ynabLedger(1);
    expect(months.length).toBeGreaterThanOrEqual(36);
    expect(new Set(rows.map((r) => r.account)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(plan.map((p) => `${p.group}: ${p.name}`)).size).toBeGreaterThanOrEqual(40);
    const payees = new Set(rows.map((r) => r.payee));
    for (const p of [
      'Starting Balance',
      'Reconciliation Balance Adjustment',
      'Manual Balance Adjustment',
    ])
      expect(payees).toContain(p);
    expect(rows.some((r) => r.memo.startsWith('Split (3/3) '))).toBe(true);
    // Categorised transfer legs to off-budget accounts, hidden categories, card payment group.
    expect(rows.some((r) => r.payee === 'Transfer : Depot' && r.category === 'Sparplan')).toBe(
      true,
    );
    expect(plan.some((p) => p.group === 'Hidden Categories')).toBe(true);
    expect(plan.some((p) => p.group === 'Credit Card Payments')).toBe(true);
    expect(rows.filter((r) => r.date > '2026-09-29')).toHaveLength(6);
    expect(plan.some((p) => p.available < 0)).toBe(true);
  });

  it('card cases of the migration doc (May–August 2024) have the documented Plan.tsv figures', () => {
    const { plan } = ynabLedger(1);
    const at = (month: string, name: string) => {
      const p = plan.find((x) => x.month === month && x.name === name);
      return [p?.assigned, p?.activity, p?.available];
    };
    expect(at('2024-05', 'Elektronik')).toEqual([10000, -15000, -5000]); // credit
    expect(at('2024-05', 'Möbel')).toEqual([10000, -15000, -5000]); // cash
    expect(at('2024-05', 'Kultur')).toEqual([10000, -15000, -5000]); // 30 € cash + 20 € credit
    expect(at('2024-05', 'Bücher')).toEqual([10000, -15000, -5000]); // all cash
    expect(at('2024-06', 'Elektronik')).toEqual([0, 0, 0]); // reset
    expect(at('2024-05', 'Geschenke')).toEqual([15000, -15000, 0]); // covered later
    expect(at('2024-06', 'Kfz-Service')).toEqual([0, 2000, 2000]); // refund
    // Card Grün: funded 150 € + 60 €, refund −20 €, payments −60 € and −130 €.
    expect(
      ['2024-05', '2024-06', '2024-07', '2024-08'].map((m) => at(m, 'Kreditkarte Grün')),
    ).toEqual([
      [0, 21000, 21000],
      [0, -2000, 19000],
      [0, -6000, 13000],
      [0, -13000, 0],
    ]);
  });

  it('by hand, not by budgetMonths: unfunded card spending, cash advance, payment (Sep 2024 – Jan 2025)', () => {
    const { plan } = ynabLedger(1);
    const at = (month: string, name: string) => {
      const p = plan.find((x) => x.month === month && x.name === name);
      return [p?.assigned, p?.activity, p?.available];
    };
    // Sep: 80 € on the card, 50 € assigned → 50 € funded, 30 € new card debt.
    expect(at('2024-09', 'Möbel')).toEqual([5000, -8000, -3000]);
    expect(at('2024-10', 'Möbel')).toEqual([0, 0, 0]);
    // Nov: 40 € from the card to the wallet: the payment category does not move (cash advance);
    // the wallet spends it in Kultur.
    expect(at('2024-11', 'Kultur')).toEqual([4000, -4000, 0]);
    // Dec: the whole card balance (80 € + 40 €) paid from the current account; 70 € of it had no
    // money in the payment category: cash overspending, reset in January.
    expect(
      ['2024-09', '2024-10', '2024-11', '2024-12', '2025-01'].map((m) => at(m, 'Kreditkarte Grün')),
    ).toEqual([
      [0, 5000, 5000],
      [0, 0, 5000],
      [0, 0, 5000],
      [0, -12000, -7000],
      [0, 0, 0],
    ]);
  });

  it('future-dated rows are in the register but not in the plan (Oct 2026)', () => {
    const { plan, rows } = ynabLedger(1);
    expect(rows.filter((r) => r.date > '2026-09-29').map((r) => r.date)).toHaveLength(6);
    const rent = plan.find((p) => p.month === '2026-10' && p.name.startsWith('Miete'));
    expect(rent?.activity).toBe(0);
    expect(rent?.assigned).toBe(108961);
  });
});
