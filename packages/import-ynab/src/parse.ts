/**
 * Reading YNAB's export files (`docs/migration/ynab-export.md` §File format): strict decoding with
 * CESU-8 repair, a strict TSV reader and the field parsers. Errors carry file, line and a code,
 * never the row's contents.
 */

export type ExportFile = 'register' | 'plan';

export class ParseError extends Error {
  constructor(
    readonly file: ExportFile,
    readonly line: number,
    readonly code: string,
    message: string,
  ) {
    super(`${file === 'register' ? 'Register.tsv' : 'Plan.tsv'}, line ${line}: ${message}`);
    this.name = 'ParseError';
  }
}

/** Which export file a name is, by its suffix (the budget name in front is free text). */
export function exportFileOf(name: string): ExportFile | null {
  if (name.endsWith(' - Register.tsv')) return 'register';
  if (name.endsWith(' - Plan.tsv')) return 'plan';
  return null;
}

/**
 * Strict UTF-8 decoding that also accepts CESU-8: a character outside the BMP written as two
 * 3-byte surrogates (`ED A0..AF xx ED B0..BF xx`) is joined into one character. A leading BOM is
 * dropped. Anything else that is not UTF-8 (lone surrogates included) is an error with its line.
 */
export function decodeExport(bytes: Uint8Array, file: ExportFile): string {
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  let line = 1;
  let out = '';
  const units: number[] = [];
  const fail = (): never => {
    throw new ParseError(file, line, 'encoding', `Invalid UTF-8 at byte ${i}`);
  };
  const next = (k: number): number => {
    const b = bytes[i + k];
    return b !== undefined && (b & 0xc0) === 0x80 ? b & 0x3f : fail();
  };
  const three = (b: number) => ((b & 0x0f) << 12) | (next(1) << 6) | next(2);
  while (i < bytes.length) {
    const b = bytes[i] as number;
    if (b < 0x80) {
      if (b === 0x0a) line += 1;
      units.push(b);
      i += 1;
    } else if (b >= 0xc2 && b < 0xe0) {
      units.push(((b & 0x1f) << 6) | next(1));
      i += 2;
    } else if (b >= 0xe0 && b < 0xf0) {
      const u = three(b);
      if (u < 0x800 || (u >= 0xdc00 && u <= 0xdfff)) fail();
      if (u >= 0xd800 && u < 0xdc00) {
        // CESU-8: the high surrogate must be followed by a 3-byte low surrogate.
        i += 3;
        const lo = bytes[i] === 0xed ? three(0xed) : fail();
        if (lo < 0xdc00 || lo > 0xdfff) fail();
        units.push(u, lo);
      } else units.push(u);
      i += 3;
    } else if (b >= 0xf0 && b < 0xf5) {
      const cp = ((b & 0x07) << 18) | (next(1) << 12) | (next(2) << 6) | next(3);
      if (cp < 0x10000 || cp > 0x10ffff) fail();
      units.push(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
      i += 4;
    } else fail();
    if (units.length >= 8192) {
      out += String.fromCharCode(...units);
      units.length = 0;
    }
  }
  return out + String.fromCharCode(...units);
}

export interface TsvRecord {
  /** Line of the record's first character (the header is line 1). */
  line: number;
  fields: string[];
}

/** Tab-separated records, every field in double quotes (`""` inside), CRLF or LF line ends. */
export function parseTsv(text: string, file: ExportFile): TsvRecord[] {
  const records: TsvRecord[] = [];
  let i = 0;
  let line = 1;
  while (i < text.length) {
    const start = line;
    const fields: string[] = [];
    for (;;) {
      if (text[i] !== '"') throw new ParseError(file, line, 'tsv.unquoted', 'Field not quoted');
      i += 1;
      let value = '';
      for (;;) {
        const q = text.indexOf('"', i);
        if (q < 0) throw new ParseError(file, start, 'tsv.unterminated', 'Unterminated field');
        const chunk = text.slice(i, q);
        for (let n = chunk.indexOf('\n'); n >= 0; n = chunk.indexOf('\n', n + 1)) line += 1;
        value += chunk;
        if (text[q + 1] !== '"') {
          i = q + 1;
          break;
        }
        value += '"';
        i = q + 2;
      }
      fields.push(value);
      const c = text[i];
      if (c === '\t') {
        i += 1;
        continue;
      }
      if (c === undefined) break;
      if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
        i += c === '\n' ? 1 : 2;
        line += 1;
        break;
      }
      throw new ParseError(file, line, 'tsv.after_quote', 'Unexpected character after a field');
    }
    records.push({ line: start, fields });
  }
  return records;
}

const AMOUNT = /^(-)?€(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/;
/** `€12,34`, `-€1234,56` (a thousands dot is accepted) → integer cents; `null` if malformed. */
export function parseAmount(text: string): number | null {
  const m = AMOUNT.exec(text);
  if (!m) return null;
  const cents = Number((m[2] as string).replaceAll('.', '')) * 100 + Number(m[3]);
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] && cents !== 0 ? -cents : cents;
}

/** `DD.MM.YYYY` → `YYYY-MM-DD`; `null` if malformed or not a calendar day. */
export function parseDate(text: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!m) return null;
  const [, d, mo, y] = m as unknown as [string, string, string, string];
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCDate() !== Number(d) || date.getUTCMonth() !== Number(mo) - 1) return null;
  return `${y}-${mo}-${d}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `Dec 2020` → `2020-12`; `null` if malformed. */
export function parsePlanMonth(text: string): string | null {
  const m = /^([A-Z][a-z]{2}) (\d{4})$/.exec(text);
  const index = m ? MONTHS.indexOf(m[1] as string) : -1;
  return m && index >= 0 ? `${m[2]}-${String(index + 1).padStart(2, '0')}` : null;
}

export const REGISTER_COLUMNS = [
  'Account',
  'Flag',
  'Date',
  'Payee',
  'Category Group/Category',
  'Category Group',
  'Category',
  'Memo',
  'Outflow',
  'Inflow',
  'Cleared',
] as const;
export const PLAN_COLUMNS = [
  'Month',
  'Category Group/Category',
  'Category Group',
  'Category',
  'Assigned',
  'Activity',
  'Available',
] as const;
export const FLAGS = ['', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'] as const;
export const CLEARED = ['Uncleared', 'Cleared', 'Reconciled'] as const;

export interface RegisterRow {
  line: number;
  account: string;
  flag: (typeof FLAGS)[number];
  /** `YYYY-MM-DD` */
  date: string;
  payee: string;
  group: string;
  category: string;
  memo: string;
  /** Inflow − Outflow. */
  amountCents: number;
  cleared: (typeof CLEARED)[number];
}

export interface PlanRow {
  line: number;
  /** `YYYY-MM` */
  month: string;
  group: string;
  category: string;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
}

function records(text: string, file: ExportFile, columns: readonly string[]): TsvRecord[] {
  const [header, ...rows] = parseTsv(text, file);
  if (!header || header.fields.join('\t') !== columns.join('\t'))
    throw new ParseError(file, 1, 'header', `Header must be: ${columns.join(', ')}`);
  for (const r of rows)
    if (r.fields.length !== columns.length)
      throw new ParseError(
        file,
        r.line,
        'tsv.columns',
        `Expected ${columns.length} fields, got ${r.fields.length}`,
      );
  return rows;
}

function field<T>(file: ExportFile, line: number, column: string, value: T | null): T {
  if (value === null)
    throw new ParseError(file, line, 'field', `Invalid value in column ${column}`);
  return value;
}

/** Register.tsv from its bytes. Throws `ParseError` at the first malformed line. */
export function parseRegister(bytes: Uint8Array): RegisterRow[] {
  const file = 'register';
  return records(decodeExport(bytes, file), file, REGISTER_COLUMNS).map(({ line, fields }) => {
    const [account, flag, date, payee, , group, category, memo, outflow, inflow, cleared] =
      fields as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
    const out = field(file, line, 'Outflow', parseAmount(outflow));
    const into = field(file, line, 'Inflow', parseAmount(inflow));
    if (out !== 0 && into !== 0)
      throw new ParseError(file, line, 'amount.both', 'Outflow and Inflow are both set');
    return {
      line,
      account: account === '' ? field<string>(file, line, 'Account', null) : account,
      flag: field(file, line, 'Flag', FLAGS.find((f) => f === flag) ?? null),
      date: field(file, line, 'Date', parseDate(date)),
      payee,
      group,
      category,
      memo,
      amountCents: into - out,
      cleared: field(file, line, 'Cleared', CLEARED.find((c) => c === cleared) ?? null),
    };
  });
}

/** Plan.tsv from its bytes. Throws `ParseError` at the first malformed line. */
export function parsePlan(bytes: Uint8Array): PlanRow[] {
  const file = 'plan';
  return records(decodeExport(bytes, file), file, PLAN_COLUMNS).map(({ line, fields }) => {
    const [month, , group, category, assigned, activity, available] = fields as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    return {
      line,
      month: field(file, line, 'Month', parsePlanMonth(month)),
      group,
      category: category === '' ? field<string>(file, line, 'Category', null) : category,
      assignedCents: field(file, line, 'Assigned', parseAmount(assigned)),
      activityCents: field(file, line, 'Activity', parseAmount(activity)),
      availableCents: field(file, line, 'Available', parseAmount(available)),
    };
  });
}
