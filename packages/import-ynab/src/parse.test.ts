import { describe, expect, it } from 'vitest';
import {
  decodeExport,
  exportFileOf,
  parseAmount,
  parseDate,
  parsePlan,
  parsePlanMonth,
  parseRegister,
  parseTsv,
  ParseError,
  REGISTER_COLUMNS,
} from './parse';

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === 'string' ? [...new TextEncoder().encode(p)] : p)),
  );
const BOM = [0xef, 0xbb, 0xbf];
/** 🛒 (U+1F6D2) as CESU-8: two 3-byte surrogates. */
const CART_CESU8 = [0xed, 0xa0, 0xbd, 0xed, 0xbb, 0x92];
const q = (fields: string[]) =>
  `${fields.map((f) => `"${f.replaceAll('"', '""')}"`).join('\t')}\r\n`;
const register = (...rows: string[][]) => bytes(BOM, q([...REGISTER_COLUMNS]), ...rows.map(q));
const row = (over: Partial<Record<(typeof REGISTER_COLUMNS)[number], string>> = {}) =>
  REGISTER_COLUMNS.map(
    (c) =>
      over[c] ??
      {
        Account: 'Girokonto',
        Date: '01.02.2024',
        Payee: 'Markt',
        Outflow: '€12,34',
        Inflow: '€0,00',
        Cleared: 'Cleared',
      }[c as string] ??
      '',
  );
const errorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ParseError) return { line: e.line, code: e.code, file: e.file };
    throw e;
  }
  throw new Error('no error');
};

describe('decoding', () => {
  it('drops the BOM and joins CESU-8 surrogate pairs; proper UTF-8 stays as it is', () => {
    expect(decodeExport(bytes(BOM, '"', CART_CESU8, ' Lebensmittel"'), 'plan')).toBe(
      '"🛒 Lebensmittel"',
    );
    expect(decodeExport(bytes('"🛒 Öffis ☕"'), 'plan')).toBe('"🛒 Öffis ☕"');
  });

  it('rejects invalid UTF-8 and lone surrogates with the line', () => {
    expect(errorOf(() => decodeExport(bytes('a\r\nb\r\n', [0xff], '\r\n'), 'register'))).toEqual({
      file: 'register',
      line: 3,
      code: 'encoding',
    });
    expect(errorOf(() => decodeExport(bytes('x\n', [0xed, 0xa0, 0xbd], 'y'), 'plan')).line).toBe(2);
    expect(errorOf(() => decodeExport(bytes([0xed, 0xbb, 0x92]), 'plan')).code).toBe('encoding');
    expect(errorOf(() => decodeExport(bytes([0xc3]), 'plan')).code).toBe('encoding');
  });
});

describe('TSV', () => {
  it('reads quoted fields with doubled quotes, tabs and line breaks inside, CRLF or LF', () => {
    const text = '"a"\t"say ""hi"""\t"x\ty"\r\n"multi\r\nline"\t""\t"z"\n"last"';
    expect(parseTsv(text, 'register')).toEqual([
      { line: 1, fields: ['a', 'say "hi"', 'x\ty'] },
      { line: 2, fields: ['multi\r\nline', '', 'z'] },
      { line: 4, fields: ['last'] },
    ]);
  });

  it('rejects unquoted, unterminated and trailing garbage fields with the line', () => {
    expect(errorOf(() => parseTsv('"a"\r\nb\t"c"', 'plan'))).toMatchObject({
      line: 2,
      code: 'tsv.unquoted',
    });
    expect(errorOf(() => parseTsv('"a"\r\n"b', 'plan'))).toMatchObject({
      line: 2,
      code: 'tsv.unterminated',
    });
    expect(errorOf(() => parseTsv('"a"x\r\n', 'plan'))).toMatchObject({
      line: 1,
      code: 'tsv.after_quote',
    });
  });
});

describe('fields', () => {
  it('amounts: euro sign first, minus before it, decimal comma, into integer cents', () => {
    expect(parseAmount('€12,34')).toBe(1234);
    expect(parseAmount('-€12,34')).toBe(-1234);
    expect(parseAmount('€0,00')).toBe(0);
    expect(Object.is(parseAmount('-€0,00'), 0)).toBe(true);
    expect(parseAmount('€123456,78')).toBe(12345678);
    expect(parseAmount('€1.234,56')).toBe(123456);
    for (const bad of ['12,34', '€12.34', '€12,3', '€-12,34', '€1.23,45', '€ 12,34', '', '€12,345'])
      expect(parseAmount(bad), bad).toBeNull();
  });

  it('dates DD.MM.YYYY and plan months "Dec 2020"', () => {
    expect(parseDate('29.02.2024')).toBe('2024-02-29');
    for (const bad of ['29.02.2023', '31.04.2024', '1.2.2024', '2024-02-01', '00.01.2024'])
      expect(parseDate(bad), bad).toBeNull();
    expect(parsePlanMonth('Dec 2020')).toBe('2020-12');
    expect(parsePlanMonth('May 2024')).toBe('2024-05');
    for (const bad of ['December 2020', 'Dez 2020', '12/2020', 'dec 2020'])
      expect(parsePlanMonth(bad)).toBeNull();
  });

  it('file kinds by suffix', () => {
    expect(exportFileOf('Any budget as of 2026-09-29 18-30 - Register.tsv')).toBe('register');
    expect(exportFileOf('x - Plan.tsv')).toBe('plan');
    expect(exportFileOf('Register.csv')).toBeNull();
  });
});

describe('Register.tsv and Plan.tsv', () => {
  it('parses a row: amount = Inflow − Outflow, ISO date, flag and cleared state', () => {
    const [r] = parseRegister(register(row({ Flag: 'Red', Memo: 'Split (1/2) x' })));
    expect(r).toEqual({
      line: 2,
      account: 'Girokonto',
      flag: 'Red',
      date: '2024-02-01',
      payee: 'Markt',
      group: '',
      category: '',
      memo: 'Split (1/2) x',
      amountCents: -1234,
      cleared: 'Cleared',
    });
  });

  it('broken inputs give the line, the column and a code, never the value', () => {
    const cases: [Uint8Array, number, string][] = [
      [bytes(BOM, '"Account"\t"Flag"\r\n'), 1, 'header'],
      [register(row(), row().slice(0, 10)), 3, 'tsv.columns'],
      [register(row(), row({ Date: '31.02.2024' })), 3, 'field'],
      [register(row({ Outflow: '12,34' })), 2, 'field'],
      [register(row(), row(), row({ Inflow: '€1,00' })), 4, 'amount.both'],
      [register(row({ Cleared: 'Pending' })), 2, 'field'],
      [register(row({ Flag: 'Pink' })), 2, 'field'],
      [register(row({ Account: '' })), 2, 'field'],
    ];
    for (const [input, line, code] of cases) {
      const error = errorOf(() => parseRegister(input));
      expect(error, code).toEqual({ file: 'register', line, code });
    }
    try {
      parseRegister(register(row({ Date: '32.13.2024' })));
    } catch (e) {
      expect(String(e)).toBe('ParseError: Register.tsv, line 2: Invalid value in column Date');
    }
  });

  it('parses plan rows and rejects bad months and amounts', () => {
    const plan = (...rows: string[][]) =>
      bytes(
        BOM,
        q([
          'Month',
          'Category Group/Category',
          'Category Group',
          'Category',
          'Assigned',
          'Activity',
          'Available',
        ]),
        ...rows.map(q),
      );
    const ok = ['Dec 2020', 'G: C', 'G', 'C', '€10,00', '-€15,00', '-€5,00'];
    expect(parsePlan(plan(ok))).toEqual([
      {
        line: 2,
        month: '2020-12',
        group: 'G',
        category: 'C',
        assignedCents: 1000,
        activityCents: -1500,
        availableCents: -500,
      },
    ]);
    expect(errorOf(() => parsePlan(plan(ok, ['2020-12', ...ok.slice(1)])))).toEqual({
      file: 'plan',
      line: 3,
      code: 'field',
    });
    expect(errorOf(() => parsePlan(plan([...ok.slice(0, 6), '-5,00'])))).toMatchObject({
      line: 2,
      code: 'field',
    });
  });
});
