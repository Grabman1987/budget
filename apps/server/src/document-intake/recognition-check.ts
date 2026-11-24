import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  extractReceiptProposal,
  parseCardDocument,
  parsePayrollDocument,
  parseStatementText,
  parseTradeConfirmation,
  tradeProposalFromConfirmation,
  type StatementProposal,
} from '@budget/domain';
import { digest, RECEIPT_LIMIT, receiptMime, sanitizedFilename } from '../receipts/files';
import { recognizeDocument, type DocumentType } from './recognize-document';
import { rankReceiptMatches } from './receipt-match-ranking';

const suffix = '.expected.json';
const types = [
  'card_statement',
  'bank_statement',
  'payslip',
  'bonus',
  'pension',
  'trade_confirmation',
  'receipt',
  'unreadable',
] as const satisfies readonly DocumentType[];
const payrollConfig = () => ({ salaryAccountId: null, wageTypes: {} });
const money = z.number().int();
const date = z.iso.date();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const scalar = z.union([z.string(), money, z.boolean(), z.null()]);
const expectedFile = z
  .strictObject({
    type: z.enum(types),
    fields: z.record(
      z.string().regex(/^[a-z]\w*(?:\.(?:[a-z]\w*|\d+))*$/i),
      z.union([scalar, z.array(scalar)]),
    ),
    cardPeriod: z
      .strictObject({ from: date, to: date })
      .refine(({ from, to }) => from <= to)
      .optional(),
    bookingCandidates: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          accountId: z.string().min(1),
          date,
          amountCents: money,
          currency: z.string().regex(/^[A-Z]{3}$/),
          payee: z.string().nullable(),
          transfer: z.boolean(),
          receipted: z.boolean(),
        }),
      )
      .optional(),
  })
  .refine(({ type, fields, bookingCandidates, cardPeriod }) => {
    if (bookingCandidates && type !== 'receipt') return false;
    if (cardPeriod && type !== 'card_statement') return false;
    if (Object.hasOwn(fields, 'bookingMatches') && !bookingCandidates) return false;
    return Object.entries(fields).every(([path, value]) => {
      const key = path.split('.').at(-1)!;
      if (key.endsWith('Cents')) return money.nullable().safeParse(value).success;
      if (/^(date|periodFrom|periodTo)$|Date$/.test(key))
        return date.nullable().safeParse(value).success;
      if (key === 'month') return month.nullable().safeParse(value).success;
      return path !== 'documentType';
    });
  });

function readCases(dir: string) {
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile())) throw new Error('Expected only regular files.');
  const sidecars = new Set(
    entries.map((entry) => entry.name).filter((name) => name.endsWith(suffix)),
  );
  const documents = entries
    .map((entry) => entry.name)
    .filter((name) => !name.endsWith(suffix))
    .sort();
  if (!documents.length) throw new Error('No document pairs found.');
  const cases = documents.map((document) => {
    const extension = extname(document);
    const stem = document.slice(0, document.length - extension.length);
    const sidecar = stem + suffix;
    if (!extension || !sidecars.delete(sidecar))
      throw new Error(`Expected one sidecar per document: ${JSON.stringify(document)}.`);
    const path = join(dir, document);
    const size = statSync(path).size;
    if (!size || size > RECEIPT_LIMIT)
      throw new Error(`Invalid size: ${JSON.stringify(document)}.`);
    try {
      const expected: unknown = JSON.parse(readFileSync(join(dir, sidecar), 'utf8'));
      return { document, path, expected: expectedFile.parse(expected) };
    } catch {
      throw new Error(`Invalid expected values: ${JSON.stringify(sidecar)}.`);
    }
  });
  if (sidecars.size) throw new Error('Found a sidecar without its document.');
  return cases;
}

function summaryValues(proposal: StatementProposal) {
  return Object.fromEntries(
    Object.entries(proposal.fields).map(([name, field]) => [name, field.value]),
  );
}

function extractFields(
  { type, bookingCandidates, cardPeriod }: z.infer<typeof expectedFile>,
  text: string,
  filename: string,
  hash: string,
): Record<string, unknown> {
  switch (type) {
    case 'payslip':
    case 'bonus':
    case 'pension': {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { documentType: _type, ...payroll } = parsePayrollDocument(
        text,
        filename,
        payrollConfig(),
      );
      return payroll;
    }
    case 'card_statement': {
      const { layout, rows, summary, totalsVerified } = parseCardDocument(text, hash, {
        accountId: 'recognition-check',
        currency: 'EUR',
        mappingKey: 'recognition-check',
        mappedCardAccounts: {},
        period: cardPeriod ?? null,
      });
      return { layout, rows, summary: summaryValues(summary), totalsVerified };
    }
    case 'bank_statement':
      return { summary: summaryValues(parseStatementText(text, hash)) };
    case 'trade_confirmation':
      return { ...tradeProposalFromConfirmation(parseTradeConfirmation(text, hash)) };
    case 'receipt': {
      const receipt = extractReceiptProposal(text);
      const { totalCents, currency, date, payee } = receipt;
      if (!bookingCandidates) return receipt;
      const matches =
        totalCents && currency && date
          ? rankReceiptMatches(bookingCandidates, {
              totalCents,
              currency,
              date,
              payee: payee ?? undefined,
            })
          : [];
      return { ...receipt, bookingMatches: matches.map(({ id }) => id) };
    }
    case 'unreadable':
      return {};
  }
}

function fieldValue(fields: unknown, path: string): unknown {
  return path.split('.').reduce((value: unknown, key) => {
    if (value !== null && typeof value === 'object' && Object.hasOwn(value, key))
      return (value as Record<string, unknown>)[key];
    return undefined;
  }, fields);
}

const print = (row: object) => process.stdout.write(JSON.stringify(row) + '\n');

async function check(dir: string) {
  const summaries = new Map<
    DocumentType,
    {
      typePassed: number;
      typeTotal: number;
      fieldPassed: number;
      fieldTotal: number;
      skipped: number;
    }
  >();
  let failed = false;
  for (const { document, path, expected } of readCases(dir)) {
    const bytes = readFileSync(path);
    try {
      receiptMime(bytes);
    } catch {
      throw new Error(`Unsupported document: ${JSON.stringify(document)}.`);
    }
    const filename = sanitizedFilename(document);
    const { classification, text } = await recognizeDocument(bytes, filename, { payrollConfig });
    const type = expected.type;
    const summary = summaries.get(type) ?? {
      typePassed: 0,
      typeTotal: 0,
      fieldPassed: 0,
      fieldTotal: 0,
      skipped: 0,
    };
    summaries.set(type, summary);
    if (classification.needsPassword) {
      summary.skipped++;
      print({ document, type, skipped: 'encrypted' });
      continue;
    }

    function compare(field: string, expectedValue: unknown, actual: unknown) {
      const pass = isDeepStrictEqual(expectedValue, actual);
      failed ||= !pass;
      print({
        document,
        field,
        expected: expectedValue,
        actual: actual ?? null,
        pass,
        ...(actual === undefined ? { reason: 'missing_field' } : {}),
      });
      return Number(pass);
    }

    summary.typeTotal++;
    summary.typePassed += compare('documentType', type, classification.type);
    let extracted: Record<string, unknown> = {};
    if (text !== undefined && Object.keys(expected.fields).length) {
      try {
        extracted = extractFields(expected, text, filename, digest(bytes));
      } catch {
        // A parser may reject unsupported values; missing fields must count as failures.
      }
    }
    const fields = {
      ...extracted,
      confidence: classification.confidence,
      hints: classification.hints,
    };
    for (const [path, value] of Object.entries(expected.fields)) {
      summary.fieldTotal++;
      summary.fieldPassed += compare(path, value, fieldValue(fields, path));
    }
  }
  for (const [type, { typePassed, typeTotal, fieldPassed, fieldTotal, skipped }] of summaries)
    print({
      type,
      typePassed,
      typeTotal,
      typeAccuracy: typeTotal ? typePassed / typeTotal : null,
      fieldPassed,
      fieldTotal,
      fieldAccuracy: fieldTotal ? fieldPassed / fieldTotal : null,
      skipped,
    });
  return failed ? 1 : 0;
}

const [flag, dir, ...extra] = process.argv.slice(2);
try {
  if (flag !== '--dir' || !dir || extra.length)
    throw new Error('Usage: recognition-check --dir <folder>');
  process.exitCode = await check(dir);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not read recognition inputs.');
  process.exitCode = 2;
}
